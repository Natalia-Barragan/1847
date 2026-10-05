'use server'

import { supabaseAdmin } from '@/lib/supabase'
import { AuditLogRow } from '@/types/database.types'

export interface GetAuditLogsFilters {
  limit?: number
  action?: string
  entity?: string
  userId?: string
}

/**
 * Consulta la bitácora de auditoría y trazabilidad del sistema
 */
export async function getAuditLogsAction(filters?: GetAuditLogsFilters): Promise<{
  success: boolean
  logs: AuditLogRow[]
  error?: string
}> {
  try {
    let query = supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.limit) {
      query = query.limit(filters.limit)
    } else {
      query = query.limit(50)
    }

    if (filters?.action) {
      query = query.eq('action', filters.action)
    }

    if (filters?.entity) {
      query = query.eq('entity', filters.entity)
    }

    if (filters?.userId) {
      query = query.eq('user_id', filters.userId)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, logs: [], error: error.message }
    }

    return {
      success: true,
      logs: (data as AuditLogRow[]) || [],
    }
  } catch (err: any) {
    return { success: false, logs: [], error: err?.message || 'Error al obtener registros de auditoría' }
  }
}
