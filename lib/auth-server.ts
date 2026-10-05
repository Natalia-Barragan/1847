import { cookies } from 'next/headers'
import { AuthenticatedUser, AUTH_COOKIE_NAME, formatAuditUserLabel } from './auth'

export * from './auth'

/**
 * Validador de sesión de usuario y trazabilidad para Server Actions.
 * Si no se provee un usuario explícito, intenta leer la sesión desde las cookies de la solicitud.
 * Si ninguna de las dos opciones tiene un id y nombre válido, RECHAZA la operación por seguridad.
 */
export async function validateUserSession(
  userCandidate?: AuthenticatedUser | null
): Promise<{
  isValid: boolean
  user: AuthenticatedUser | null
  error?: string
}> {
  // 1. Verificar si se proporcionó un usuario en el payload de la acción
  if (userCandidate && userCandidate.id && userCandidate.name) {
    const cleanId = String(userCandidate.id).trim()
    const cleanName = String(userCandidate.name).trim()
    const cleanLegajo = userCandidate.legajo ? String(userCandidate.legajo).trim() : 'S/L'

    if (cleanId.length > 0 && cleanName.length > 0) {
      return {
        isValid: true,
        user: {
          ...userCandidate,
          id: cleanId,
          name: cleanName,
          legajo: cleanLegajo,
          role: userCandidate.role,
        },
      }
    }
  }

  // 2. Si no vino en el payload, intentar resolver desde cookie HTTP de sesión
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME)
    if (sessionCookie && sessionCookie.value) {
      const parsed = JSON.parse(decodeURIComponent(sessionCookie.value)) as AuthenticatedUser
      if (parsed && parsed.id && parsed.name) {
        return {
          isValid: true,
          user: {
            ...parsed,
            id: String(parsed.id).trim(),
            name: String(parsed.name).trim(),
            legajo: parsed.legajo ? String(parsed.legajo).trim() : 'S/L',
            role: parsed.role,
          },
        }
      }
    }
  } catch (cookieErr) {
    // Si no está disponible el contexto de cookies (ej. tests directos), se prosigue a rechazo
  }

  // 3. Fallo de seguridad: Operación denegada por falta de sesión válida
  return {
    isValid: false,
    user: null,
    error: 'Acceso denegado: Se requiere una sesión de usuario válida (ID y Nombre/Legajo) para auditar y ejecutar esta operación.',
  }
}
