'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { Database, InventoryStockRow, StockPurchaseRow } from '@/types/database.types'

interface RegisterPurchaseInput {
  inventoryItemId: string
  quantity: number
  unitPrice: number
  supplier?: string
}

/**
 * 1. Registrar compra de stock e incrementar cantidad actual en inventario.
 */
export async function registerStockPurchaseAction(
  data: RegisterPurchaseInput
): Promise<{
  success: boolean
  newQuantity?: number
  error?: string
}> {
  try {
    if (data.quantity <= 0) {
      return { success: false, error: 'La cantidad comprada debe ser mayor a 0.' }
    }
    if (data.unitPrice < 0) {
      return { success: false, error: 'El precio unitario no puede ser negativo.' }
    }

    // 1. Verificar que el ítem de inventario exista
    const { data: item, error: itemError } = await supabaseAdmin
      .from('inventory_stock')
      .select('id, current_quantity, name')
      .eq('id', data.inventoryItemId)
      .single()

    if (itemError || !item) {
      return { success: false, error: 'No se encontró el ítem de inventario especificado.' }
    }

    const currentQty = Number(item.current_quantity)
    const newQuantity = currentQty + data.quantity
    const totalPrice = data.quantity * data.unitPrice

    // 2. Registrar la compra
    const { error: purchaseError } = await supabaseAdmin
      .from('stock_purchases')
      .insert({
        inventory_item_id: data.inventoryItemId,
        quantity: data.quantity,
        unit_price: data.unitPrice,
        total_price: totalPrice,
        supplier: data.supplier || null,
        purchase_date: new Date().toISOString(),
      })

    if (purchaseError) {
      return { success: false, error: `Error al registrar la compra: ${purchaseError.message}` }
    }

    // 3. Incrementar el stock actual del ítem
    const { error: stockUpdateError } = await supabaseAdmin
      .from('inventory_stock')
      .update({
        current_quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.inventoryItemId)

    if (stockUpdateError) {
      return { success: false, error: `Error al actualizar la cantidad de stock: ${stockUpdateError.message}` }
    }

    return {
      success: true,
      newQuantity: newQuantity,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al registrar compra.' }
  }
}

/**
 * 2. Obtener productos con stock crítico (bajo stock mínimo).
 */
export async function getLowStockItemsAction(): Promise<{
  success: boolean
  items?: (InventoryStockRow & { product_name?: string })[]
  error?: string
}> {
  try {
    // Consultar ítems de inventario con join a productos para obtener el nombre real de venta si aplica
    const { data: rawItems, error } = await supabaseAdmin
      .from('inventory_stock')
      .select('*, products(name)')

    if (error || !rawItems) {
      return { success: false, error: `Error al consultar stock de inventario: ${error.message}` }
    }

    // Filtrar los que estén por debajo del stock mínimo configurado
    const lowStockItems = rawItems
      .filter((item) => Number(item.current_quantity) <= Number(item.min_stock))
      .map((item) => ({
        ...item,
        product_name: (item.products as any)?.name || undefined,
      }))

    return {
      success: true,
      items: lowStockItems as (InventoryStockRow & { product_name?: string })[],
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error inesperado al consultar stock crítico.' }
  }
}
