import { supabaseAdmin } from '@/lib/supabase'
import { AuthenticatedUser, formatAuditUserLabel } from '@/lib/auth'
import { Json } from '@/types/database.types'

export type AuditAction =
  | 'OPEN_ORDER'
  | 'CLOSE_ORDER_FISCAL'
  | 'CLOSE_ORDER_INTERNAL'
  | 'CANCEL_ITEM'
  | 'EMIT_PREBILL'
  | 'EMIT_INVOICE_ARCA'
  | 'OPEN_SHIFT'
  | 'CLOSE_SHIFT'
  | 'UPDATE_MENU'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'

export interface RecordAuditLogInput {
  action: AuditAction
  entity: 'orders' | 'order_items' | 'invoices_arca' | 'cash_register_shifts' | 'prebill_emissions' | 'products' | 'auth'
  entityId?: string | null
  user: AuthenticatedUser
  details?: Record<string, any>
}

/**
 * Registra un evento de trazabilidad y auditoría de usuario en la base de datos Supabase
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<{
  success: boolean
  auditId?: string
  error?: string
}> {
  try {
    const userLabel = formatAuditUserLabel(input.user)
    const payload = {
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId || null,
      user_id: input.user.id,
      user_name: userLabel,
      details: (input.details || null) as Json,
    }

    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      console.warn(`[AUDITORÍA] Error al persistir log (${input.action}):`, error.message)
      return { success: false, error: error.message }
    }

    return { success: true, auditId: data?.id }
  } catch (err: any) {
    console.warn(`[AUDITORÍA] Excepción al registrar log (${input.action}):`, err?.message || err)
    return { success: false, error: err?.message || 'Error al registrar log de auditoría' }
  }
}
