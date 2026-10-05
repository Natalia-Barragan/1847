'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { OrderRow, OrderItemRow, InvoiceArcaRow } from '@/types/database.types'
import { emitirFacturaArcaAction } from '@/app/actions/arca'
import { AuthenticatedUser, validateUserSession, formatAuditUserLabel } from '@/lib/auth-server'
import { recordAuditLog } from '@/lib/audit'

export interface CreateOrderItemInput {
  productId: string
  quantity: number
  notes?: string
}

export interface OpenOrderInput {
  tableNumber?: string // Si se provee, es comanda de Salón
  origin: 'salon' | 'takeaway' | 'qr'
  customerName?: string
  customerPhone?: string
  estimatedTime?: string // Formato 'HH:MM'
  notes?: string
  items: CreateOrderItemInput[]
}

/**
 * 1. Abrir mesa / Crear comanda con trazabilidad y auditoría de usuario obligatoria
 */
export async function openOrderAction(
  data: OpenOrderInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  orderId?: string
  error?: string
}> {
  try {
    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'La comanda debe contener al menos un ítem.' }
    }

    // 0. Validación de usuario / operador
    let activeUser: AuthenticatedUser
    if (data.origin === 'qr' && !user) {
      // Pedido autogestionado por comensal desde código QR en mesa
      activeUser = {
        id: 'usr-qr-guest',
        name: data.customerName?.trim() || 'Comensal en Mesa',
        legajo: 'AUTOGESTION-QR',
        role: 'salon',
      }
    } else {
      const authResult = await validateUserSession(user)
      if (!authResult.isValid || !authResult.user) {
        return {
          success: false,
          error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para abrir comandas.',
        }
      }
      activeUser = authResult.user
    }

    // 1. Validar mesa si es origen salón
    let tableId: string | null = null
    if (data.origin === 'salon' && data.tableNumber) {
      const { data: table, error: tableError } = await supabaseAdmin
        .from('tables')
        .select('id, status')
        .eq('number', data.tableNumber)
        .single()

      if (tableError || !table) {
        return { success: false, error: `La mesa número ${data.tableNumber} no existe.` }
      }
      tableId = table.id
    }

    // 2. Obtener precios actuales de los productos para calcular subtotal
    const productIds = data.items.map((item) => item.productId)
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, price, name')
      .in('id', productIds)

    if (productsError || !products) {
      return { success: false, error: 'Error al consultar el precio de los productos.' }
    }

    const productMap = new Map(products.map((p) => [p.id, p]))

    let subtotal = 0
    const itemsToInsert = []

    for (const item of data.items) {
      const prod = productMap.get(item.productId)
      if (!prod) {
        return { success: false, error: `El producto con ID ${item.productId} no existe.` }
      }
      const itemSubtotal = prod.price * item.quantity
      subtotal += itemSubtotal

      itemsToInsert.push({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: prod.price,
        notes: item.notes || null,
        status: 'active' as const,
      })
    }

    const userLabel = formatAuditUserLabel(activeUser)

    // 3. Crear el registro de la orden/comanda con usuario operador
    const { data: newOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        table_id: tableId,
        origin: data.origin,
        customer_name: data.customerName || null,
        customer_phone: data.customerPhone || null,
        estimated_time: data.estimatedTime || null,
        notes: data.notes || null,
        status: 'open',
        kds_status: 'pending',
        subtotal: subtotal,
        discount_pct: 0,
        discount_amount: 0,
        total: subtotal,
        user_id: activeUser.id,
        user_name: userLabel,
      })
      .select('id')
      .single()

    if (orderError || !newOrder) {
      return { success: false, error: `Error al crear la orden: ${orderError?.message}` }
    }

    // 4. Insertar los ítems de la orden (esto activa el trigger de descuento de stock en BD)
    const itemsWithOrderId = itemsToInsert.map((item) => ({
      ...item,
      order_id: newOrder.id,
    }))

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(itemsWithOrderId)

    if (itemsError) {
      await supabaseAdmin.from('orders').delete().eq('id', newOrder.id)
      return { success: false, error: `Error al registrar los ítems de la orden: ${itemsError.message}` }
    }

    // 5. Si es de salón, marcar la mesa como ocupada
    if (tableId) {
      const { error: tableUpdateError } = await supabaseAdmin
        .from('tables')
        .update({ status: 'ocupada' })
        .eq('id', tableId)

      if (tableUpdateError) {
        console.error('Error al actualizar el estado de la mesa:', tableUpdateError)
      }
    }

    // 6. Auditoría inmutable de apertura
    await recordAuditLog({
      action: 'OPEN_ORDER',
      entity: 'orders',
      entityId: newOrder.id,
      user: activeUser,
      details: {
        tableNumber: data.tableNumber,
        origin: data.origin,
        itemsCount: data.items.length,
        subtotal,
      },
    })

    return { success: true, orderId: newOrder.id }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado del servidor.' }
  }
}

/**
 * 2. Actualizar estado de comanda en Cocina (KDS)
 */
export async function updateKdsStatusAction(
  orderId: string,
  kdsStatus: 'pending' | 'preparing' | 'ready' | 'delivered',
  user?: AuthenticatedUser
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ kds_status: kdsStatus })
      .eq('id', orderId)

    if (error) {
      return { success: false, error: `Error al actualizar estado KDS: ${error.message}` }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al actualizar KDS.' }
  }
}

export interface CloseOrderInput {
  discountPct: number
  paymentMethod: 'efectivo' | 'debito' | 'credito' | 'qr'
  invoiceType: 'A' | 'B' | 'C'
  docType?: number
  docNumber?: string
}

/**
 * 3. Cerrar comanda y registrar cobro en Caja con desglose de IVA/descuentos y factura ARCA.
 * Requiere sesión de usuario válida y asienta closed_by_user_id y closed_by_user_name.
 */
export async function closeOrderAndInvoiceAction(
  orderId: string,
  data: CloseOrderInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  order?: OrderRow
  invoice?: InvoiceArcaRow
  error?: string
}> {
  try {
    // 0. Validación de usuario / operador
    const authResult = await validateUserSession(user)
    if (!authResult.isValid || !authResult.user) {
      return {
        success: false,
        error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para procesar cobros y facturación.',
      }
    }
    const activeUser = authResult.user

    // 1. Obtener la orden activa con sus ítems y productos
    const { data: order, error: orderQueryError } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('id', orderId)
      .single()

    if (orderQueryError || !order) {
      return { success: false, error: 'No se encontró la orden solicitada.' }
    }

    if (order.status === 'closed') {
      return { success: false, error: 'Esta comanda ya se encuentra cerrada y facturada.' }
    }

    const orderItems = (order.order_items as (OrderItemRow & { products: any })[])?.filter(
      (it) => it.status !== 'cancelled'
    )
    if (!orderItems || orderItems.length === 0) {
      return { success: false, error: 'La comanda no posee ítems activos para facturar.' }
    }

    // 2. Emitir factura fiscal utilizando la Server Action de ARCA pasando el usuario logueado
    const arcaRes = await emitirFacturaArcaAction(
      {
        orderId,
        invoiceType: data.invoiceType,
        docType: data.docType,
        docNumber: data.docNumber,
        discountPct: data.discountPct,
        paymentMethod: data.paymentMethod,
      },
      activeUser
    )

    if (!arcaRes.success || !arcaRes.invoice) {
      return { success: false, error: arcaRes.error || 'Error al procesar la factura ARCA.' }
    }

    const newInvoice = arcaRes.invoice
    const discountPct = Math.max(0, Math.min(100, data.discountPct))
    const discountAmount = Number(newInvoice.total_amount) * (discountPct / 100)
    const finalTotal = Number(newInvoice.total_amount)
    const userLabel = formatAuditUserLabel(activeUser)

    // 3. Actualizar la orden como cerrada con datos del usuario cobrador
    const { data: updatedOrder, error: orderUpdateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'closed',
        payment_method: data.paymentMethod,
        discount_pct: discountPct,
        discount_amount: Math.round(discountAmount * 100) / 100,
        total: Math.round(finalTotal * 100) / 100,
        closed_at: new Date().toISOString(),
        closed_by_user_id: activeUser.id,
        closed_by_user_name: userLabel,
      })
      .eq('id', orderId)
      .select()
      .single()

    if (orderUpdateError || !updatedOrder) {
      await supabaseAdmin.from('invoices_arca').delete().eq('id', newInvoice.id)
      return { success: false, error: `Error al cerrar la orden: ${orderUpdateError?.message}` }
    }

    // 4. Liberar la mesa asociada si existe
    if (order.table_id) {
      const { error: tableFreeError } = await supabaseAdmin
        .from('tables')
        .update({ status: 'libre' })
        .eq('id', order.table_id)

      if (tableFreeError) {
        console.error('Error al liberar la mesa:', tableFreeError.message)
      }
    }

    // 5. Registrar en bitácora de auditoría
    await recordAuditLog({
      action: 'CLOSE_ORDER_FISCAL',
      entity: 'orders',
      entityId: orderId,
      user: activeUser,
      details: {
        paymentMethod: data.paymentMethod,
        total: finalTotal,
        discountPct,
        invoiceNumber: newInvoice.invoice_number,
        invoiceType: newInvoice.invoice_type,
      },
    })

    return {
      success: true,
      order: updatedOrder as OrderRow,
      invoice: newInvoice as InvoiceArcaRow,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado en el proceso de facturación.' }
  }
}

export interface CloseOrderWithoutInvoiceInput {
  discountPct: number
  paymentMethod: 'efectivo' | 'debito' | 'credito' | 'qr'
}

/**
 * 4. Cerrar comanda sin factura fiscal (Ticket X / Comprobante Interno)
 * Requiere sesión de usuario válida y asienta closed_by_user_id y closed_by_user_name.
 */
export async function closeOrderWithoutInvoiceAction(
  orderId: string,
  data: CloseOrderWithoutInvoiceInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  order?: OrderRow
  error?: string
}> {
  try {
    // 0. Validación de usuario / operador
    const authResult = await validateUserSession(user)
    if (!authResult.isValid || !authResult.user) {
      return {
        success: false,
        error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para registrar cobros.',
      }
    }
    const activeUser = authResult.user

    const { data: order, error: orderQueryError } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single()

    if (orderQueryError || !order) {
      return { success: false, error: 'No se encontró la orden solicitada.' }
    }

    if (order.status === 'closed') {
      return { success: false, error: 'Esta comanda ya se encuentra cerrada.' }
    }

    const discountPct = Math.max(0, Math.min(100, data.discountPct))
    const subtotal = Number(order.subtotal || 0)
    const discountAmount = subtotal * (discountPct / 100)
    const finalTotal = subtotal - discountAmount
    const userLabel = formatAuditUserLabel(activeUser)

    const { data: updatedOrder, error: orderUpdateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'closed',
        payment_method: data.paymentMethod,
        discount_pct: discountPct,
        discount_amount: Math.round(discountAmount * 100) / 100,
        total: Math.round(finalTotal * 100) / 100,
        closed_at: new Date().toISOString(),
        closed_by_user_id: activeUser.id,
        closed_by_user_name: userLabel,
      })
      .eq('id', orderId)
      .select()
      .single()

    if (orderUpdateError || !updatedOrder) {
      return { success: false, error: `Error al cerrar la orden: ${orderUpdateError?.message}` }
    }

    if (order.table_id) {
      await supabaseAdmin
        .from('tables')
        .update({ status: 'libre' })
        .eq('id', order.table_id)
    }

    // Registrar en bitácora de auditoría
    await recordAuditLog({
      action: 'CLOSE_ORDER_INTERNAL',
      entity: 'orders',
      entityId: orderId,
      user: activeUser,
      details: {
        paymentMethod: data.paymentMethod,
        total: finalTotal,
        discountPct,
      },
    })

    return {
      success: true,
      order: updatedOrder as OrderRow,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error al cerrar la orden sin factura.' }
  }
}

export interface CancelOrderItemInput {
  orderId: string
  orderItemId: string
  reason: string
}

/**
 * 5. Anulación de Ítem de Comanda con justificación obligatoria y auditoría de usuario.
 * Reincorpora el stock al inventario, recalcula totales y asienta en bitácora de anulaciones.
 */
export async function cancelOrderItemAction(
  data: CancelOrderItemInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  cancelledItemId?: string
  newSubtotal?: number
  newTotal?: number
  error?: string
}> {
  try {
    // 0. Validación de usuario / operador
    const authResult = await validateUserSession(user)
    if (!authResult.isValid || !authResult.user) {
      return {
        success: false,
        error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para anular ítems de comandas.',
      }
    }
    const activeUser = authResult.user

    if (!data.reason || data.reason.trim().length < 3) {
      return { success: false, error: 'Debe ingresar un motivo válido de anulación (mínimo 3 caracteres).' }
    }

    // 1. Obtener orden
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', data.orderId)
      .single()

    if (orderErr || !order) {
      return { success: false, error: 'No se encontró la orden especificada.' }
    }

    if (order.status === 'closed') {
      return { success: false, error: 'No se pueden anular ítems de una orden ya cerrada.' }
    }

    // 2. Obtener el ítem a anular
    const { data: item, error: itemErr } = await supabaseAdmin
      .from('order_items')
      .select('*, products(name)')
      .eq('id', data.orderItemId)
      .eq('order_id', data.orderId)
      .single()

    if (itemErr || !item) {
      return { success: false, error: 'No se encontró el ítem en la comanda seleccionada.' }
    }

    if (item.status === 'cancelled') {
      return { success: false, error: 'Este ítem ya se encuentra anulado.' }
    }

    const userLabel = formatAuditUserLabel(activeUser)
    const nowIso = new Date().toISOString()
    const reasonClean = data.reason.trim()
    const productName = (item.products as any)?.name || 'Producto'

    // 3. Marcar ítem como anulado con datos de auditoría
    const { error: cancelErr } = await supabaseAdmin
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: nowIso,
        cancelled_by_user_id: activeUser.id,
        cancelled_by_user_name: userLabel,
        cancel_reason: reasonClean,
      })
      .eq('id', data.orderItemId)

    if (cancelErr) {
      return { success: false, error: `Error al registrar la anulación del ítem: ${cancelErr.message}` }
    }

    // 4. Registrar en tabla histórica de anulaciones
    await supabaseAdmin.from('order_item_cancellations').insert({
      order_id: data.orderId,
      order_item_id: data.orderItemId,
      product_id: item.product_id,
      product_name: productName,
      quantity: item.quantity,
      unit_price: item.unit_price,
      reason: reasonClean,
      user_id: activeUser.id,
      user_name: userLabel,
    })

    // 5. Devolver stock descontado a inventario
    if (item.product_id) {
      const { data: invItem } = await supabaseAdmin
        .from('inventory_stock')
        .select('id, current_quantity')
        .eq('product_id', item.product_id)
        .single()

      if (invItem) {
        const restoredQty = Number(invItem.current_quantity) + item.quantity
        await supabaseAdmin
          .from('inventory_stock')
          .update({
            current_quantity: restoredQty,
            updated_at: nowIso,
          })
          .eq('id', invItem.id)
      }
    }

    // 6. Recalcular subtotal de la comanda con ítems activos restantes
    const { data: remainingItems } = await supabaseAdmin
      .from('order_items')
      .select('quantity, unit_price')
      .eq('order_id', data.orderId)
      .eq('status', 'active')

    const newSubtotal = (remainingItems || []).reduce(
      (sum, it) => sum + Number(it.quantity) * Number(it.unit_price),
      0
    )
    const discountPct = Number(order.discount_pct || 0)
    const newDiscountAmount = newSubtotal * (discountPct / 100)
    const newTotal = newSubtotal - newDiscountAmount

    await supabaseAdmin
      .from('orders')
      .update({
        subtotal: newSubtotal,
        discount_amount: Math.round(newDiscountAmount * 100) / 100,
        total: Math.round(newTotal * 100) / 100,
      })
      .eq('id', data.orderId)

    // 7. Registrar en bitácora de auditoría
    await recordAuditLog({
      action: 'CANCEL_ITEM',
      entity: 'order_items',
      entityId: data.orderItemId,
      user: activeUser,
      details: {
        orderId: data.orderId,
        productName,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        reason: reasonClean,
        newSubtotal,
      },
    })

    return {
      success: true,
      cancelledItemId: data.orderItemId,
      newSubtotal,
      newTotal,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al anular ítem.' }
  }
}

export interface EmitPrebillInput {
  orderId: string
  discountPct?: number
}

/**
 * 6. Emisión de Pre-cuenta con trazabilidad de usuario y registro en base de datos.
 * Registra quién imprimió o emitió la pre-cuenta y actualiza el estado de la mesa.
 */
export async function emitirPrecuentaAction(
  data: EmitPrebillInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  prebill?: {
    orderId: string
    tableNumber?: string
    customerName?: string
    subtotal: number
    discountPct: number
    discountAmount: number
    total: number
    userLabel: string
    items: { quantity: number; name: string; unitPrice: number }[]
  }
  error?: string
}> {
  try {
    // 0. Validación de usuario / operador
    const authResult = await validateUserSession(user)
    if (!authResult.isValid || !authResult.user) {
      return {
        success: false,
        error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para emitir pre-cuentas.',
      }
    }
    const activeUser = authResult.user

    // 1. Obtener la orden con sus ítems activos
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('*, tables(number), order_items(*, products(name))')
      .eq('id', data.orderId)
      .single()

    if (orderErr || !order) {
      return { success: false, error: 'No se encontró la comanda especificada.' }
    }

    if (order.status === 'closed') {
      return { success: false, error: 'La comanda ya se encuentra cerrada.' }
    }

    const activeItems = (order.order_items as (OrderItemRow & { products: { name: string } | null })[])?.filter(
      (it) => it.status !== 'cancelled'
    )

    if (!activeItems || activeItems.length === 0) {
      return { success: false, error: 'La orden no posee ítems activos.' }
    }

    const subtotal = activeItems.reduce(
      (sum, it) => sum + Number(it.quantity) * Number(it.unit_price),
      0
    )
    const discountPct = Math.max(0, Math.min(100, data.discountPct ?? Number(order.discount_pct || 0)))
    const discountAmount = Math.round(subtotal * (discountPct / 100) * 100) / 100
    const finalTotal = Math.round((subtotal - discountAmount) * 100) / 100
    const tableNumber = (order.tables as any)?.number || undefined
    const userLabel = formatAuditUserLabel(activeUser)
    const nowIso = new Date().toISOString()

    // 2. Registrar en tabla prebill_emissions
    await supabaseAdmin.from('prebill_emissions').insert({
      order_id: data.orderId,
      table_id: order.table_id,
      table_number: tableNumber || null,
      subtotal,
      discount_pct: discountPct,
      discount_amount: discountAmount,
      total: finalTotal,
      user_id: activeUser.id,
      user_name: userLabel,
    })

    // 3. Actualizar la orden con la fecha y operador de la última pre-cuenta
    await supabaseAdmin
      .from('orders')
      .update({
        last_prebill_at: nowIso,
        last_prebill_by_user_id: activeUser.id,
        last_prebill_by_user_name: userLabel,
        discount_pct: discountPct,
        discount_amount: discountAmount,
        total: finalTotal,
      })
      .eq('id', data.orderId)

    // 4. Cambiar estado de mesa a 'cuenta' si es de salón
    if (order.table_id) {
      await supabaseAdmin
        .from('tables')
        .update({ status: 'cuenta' })
        .eq('id', order.table_id)
    }

    // 5. Registrar en bitácora de auditoría
    await recordAuditLog({
      action: 'EMIT_PREBILL',
      entity: 'prebill_emissions',
      entityId: data.orderId,
      user: activeUser,
      details: {
        orderId: data.orderId,
        tableNumber,
        total: finalTotal,
        discountPct,
      },
    })

    return {
      success: true,
      prebill: {
        orderId: data.orderId,
        tableNumber,
        customerName: order.customer_name || 'Comensal',
        subtotal,
        discountPct,
        discountAmount,
        total: finalTotal,
        userLabel,
        items: activeItems.map((it) => ({
          quantity: it.quantity,
          name: it.products?.name || 'Ítem',
          unitPrice: Number(it.unit_price),
        })),
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al emitir pre-cuenta.' }
  }
}
