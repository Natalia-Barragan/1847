'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { CashRegisterShiftRow } from '@/types/database.types'
import { AuthenticatedUser, validateUserSession, formatAuditUserLabel } from '@/lib/auth-server'
import { recordAuditLog } from '@/lib/audit'

export interface OpenShiftInput {
  shiftName: string
  initialCash: number
  notes?: string
}

export interface CloseShiftInput {
  shiftId: string
  finalCashReal: number
  notes?: string
}

/**
 * 1. Apertura de Turno de Caja con registro de usuario y trazabilidad
 */
export async function openCashRegisterShiftAction(
  data: OpenShiftInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  shift?: CashRegisterShiftRow
  error?: string
}> {
  try {
    // 0. Validación de autenticación y sesión
    const authResult = await validateUserSession(user)
    if (!authResult.isValid || !authResult.user) {
      return {
        success: false,
        error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para abrir turno de caja.',
      }
    }
    const activeUser = authResult.user

    if (data.initialCash < 0) {
      return { success: false, error: 'El fondo inicial de caja no puede ser negativo.' }
    }

    const shiftName = data.shiftName?.trim() || 'Turno General'
    const userLabel = formatAuditUserLabel(activeUser)

    // 1. Verificar si ya existe un turno abierto
    const { data: existingOpen } = await supabaseAdmin
      .from('cash_register_shifts')
      .select('id, shift_name, opened_at, opened_by_user_name')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)

    if (existingOpen && existingOpen.length > 0) {
      return {
        success: false,
        error: `Ya existe un turno abierto ("${existingOpen[0].shift_name}" iniciado por ${existingOpen[0].opened_by_user_name}). Debe cerrarse antes de abrir uno nuevo.`,
      }
    }

    // 2. Crear el nuevo turno en base de datos
    const { data: newShift, error: insertErr } = await supabaseAdmin
      .from('cash_register_shifts')
      .insert({
        shift_name: shiftName,
        status: 'open',
        opened_at: new Date().toISOString(),
        opened_by_user_id: activeUser.id,
        opened_by_user_name: userLabel,
        initial_cash: data.initialCash,
        notes: data.notes || null,
      })
      .select()
      .single()

    if (insertErr || !newShift) {
      return {
        success: false,
        error: `Error al abrir turno en base de datos: ${insertErr?.message}`,
      }
    }

    // 3. Registrar auditoría inmutable
    await recordAuditLog({
      action: 'OPEN_SHIFT',
      entity: 'cash_register_shifts',
      entityId: newShift.id,
      user: activeUser,
      details: {
        shiftName: newShift.shift_name,
        initialCash: newShift.initial_cash,
        openedAt: newShift.opened_at,
      },
    })

    return {
      success: true,
      shift: newShift as CashRegisterShiftRow,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado al abrir turno.' }
  }
}

/**
 * 2. Cierre de Turno de Caja / Arqueo Z con conciliación de fondos y auditoría
 */
export async function closeCashRegisterShiftAction(
  data: CloseShiftInput,
  user?: AuthenticatedUser
): Promise<{
  success: boolean
  shift?: CashRegisterShiftRow
  error?: string
}> {
  try {
    // 0. Validación de autenticación y sesión
    const authResult = await validateUserSession(user)
    if (!authResult.isValid || !authResult.user) {
      return {
        success: false,
        error: authResult.error || 'Acceso denegado: Se requiere un usuario autenticado para cerrar turno de caja.',
      }
    }
    const activeUser = authResult.user

    // 1. Obtener datos del turno actual
    const { data: shift, error: shiftErr } = await supabaseAdmin
      .from('cash_register_shifts')
      .select('*')
      .eq('id', data.shiftId)
      .single()

    if (shiftErr || !shift) {
      return { success: false, error: 'No se encontró el turno especificado.' }
    }

    if (shift.status === 'closed') {
      return { success: false, error: 'Este turno ya ha sido cerrado previamente.' }
    }

    const nowIso = new Date().toISOString()
    const openedAtIso = shift.opened_at

    // 2. Consultar órdenes cerradas durante el turno
    const { data: closedOrders } = await supabaseAdmin
      .from('orders')
      .select('id, total, payment_method, closed_at')
      .eq('status', 'closed')
      .gte('closed_at', openedAtIso)

    const ordersList = closedOrders || []
    const totalOrdersCount = ordersList.length
    const totalSalesAmount = ordersList.reduce((sum, o) => sum + Number(o.total || 0), 0)

    let totalCashAmount = 0
    let totalDebitAmount = 0
    let totalCreditAmount = 0
    let totalQrAmount = 0

    ordersList.forEach((o) => {
      const tot = Number(o.total || 0)
      if (o.payment_method === 'efectivo') totalCashAmount += tot
      else if (o.payment_method === 'debito') totalDebitAmount += tot
      else if (o.payment_method === 'credito') totalCreditAmount += tot
      else if (o.payment_method === 'qr') totalQrAmount += tot
    })

    // 3. Consultar facturas ARCA emitidas durante el turno
    const { data: invoices } = await supabaseAdmin
      .from('invoices_arca')
      .select('net_amount, vat_amount')
      .eq('status', 'approved')
      .gte('created_at', openedAtIso)

    const invoicesList = invoices || []
    const totalFiscalNet = invoicesList.reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0)
    const totalFiscalVat = invoicesList.reduce((sum, inv) => sum + Number(inv.vat_amount || 0), 0)

    // 4. Conciliación de caja: Esperado vs Real
    const initialCash = Number(shift.initial_cash || 0)
    const expectedCash = Math.round((initialCash + totalCashAmount) * 100) / 100
    const realCash = Math.round(Number(data.finalCashReal || 0) * 100) / 100
    const cashDifference = Math.round((realCash - expectedCash) * 100) / 100

    const userLabel = formatAuditUserLabel(activeUser)

    // 5. Asentar cierre en la base de datos
    const { data: updatedShift, error: updateErr } = await supabaseAdmin
      .from('cash_register_shifts')
      .update({
        status: 'closed',
        closed_at: nowIso,
        closed_by_user_id: activeUser.id,
        closed_by_user_name: userLabel,
        final_cash_expected: expectedCash,
        final_cash_real: realCash,
        cash_difference: cashDifference,
        total_orders_count: totalOrdersCount,
        total_sales_amount: totalSalesAmount,
        total_cash_amount: totalCashAmount,
        total_debit_amount: totalDebitAmount,
        total_credit_amount: totalCreditAmount,
        total_qr_amount: totalQrAmount,
        total_fiscal_net: totalFiscalNet,
        total_fiscal_vat: totalFiscalVat,
        notes: data.notes || shift.notes,
      })
      .eq('id', data.shiftId)
      .select()
      .single()

    if (updateErr || !updatedShift) {
      return { success: false, error: `Error al asentar cierre de turno: ${updateErr?.message}` }
    }

    // 6. Registrar en bitácora inmutable de auditoría
    await recordAuditLog({
      action: 'CLOSE_SHIFT',
      entity: 'cash_register_shifts',
      entityId: updatedShift.id,
      user: activeUser,
      details: {
        shiftName: updatedShift.shift_name,
        initialCash: updatedShift.initial_cash,
        finalCashReal: realCash,
        finalCashExpected: expectedCash,
        cashDifference,
        totalOrdersCount,
        totalSalesAmount,
        totalCashAmount,
        closedAt: nowIso,
      },
    })

    return {
      success: true,
      shift: updatedShift as CashRegisterShiftRow,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error inesperado al cerrar turno.' }
  }
}

/**
 * 3. Obtener el turno de caja actualmente abierto (si existe)
 */
export async function getActiveCashRegisterShiftAction(): Promise<{
  success: boolean
  shift: CashRegisterShiftRow | null
  error?: string
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cash_register_shifts')
      .select('*')
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)

    if (error) {
      return { success: false, shift: null, error: error.message }
    }

    return {
      success: true,
      shift: data && data.length > 0 ? (data[0] as CashRegisterShiftRow) : null,
    }
  } catch (err: any) {
    return { success: false, shift: null, error: err?.message || 'Error al consultar turno activo' }
  }
}

/**
 * 4. Obtener historial de turnos de caja para auditoría gerencial
 */
export async function getRecentCashRegisterShiftsAction(limit = 10): Promise<{
  success: boolean
  shifts: CashRegisterShiftRow[]
  error?: string
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cash_register_shifts')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, shifts: [], error: error.message }
    }

    return {
      success: true,
      shifts: (data as CashRegisterShiftRow[]) || [],
    }
  } catch (err: any) {
    return { success: false, shifts: [], error: err?.message || 'Error al consultar historial de turnos' }
  }
}
