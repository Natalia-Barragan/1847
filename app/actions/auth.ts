'use server'

import { cookies } from 'next/headers'
import {
  AuthenticatedUser,
  AUTH_COOKIE_NAME,
  verifyUserCredentials,
  formatAuditUserLabel,
} from '@/lib/auth'
import { recordAuditLog } from '@/lib/audit'

/**
 * Server Action para iniciar sesión con usuario/legajo y contraseña
 */
export async function loginUserAction(
  identifier: string,
  secret: string
): Promise<{
  success: boolean
  user?: AuthenticatedUser
  error?: string
}> {
  const result = verifyUserCredentials(identifier, secret)

  if (!result.success || !result.user) {
    // Registrar intento fallido en bitácora de auditoría
    await recordAuditLog({
      action: 'LOGIN_FAILED',
      entity: 'auth',
      user: {
        id: 'anonymous',
        username: 'anonymous',
        name: `Intento Fallido (${identifier || 'anónimo'})`,
        legajo: 'ANON',
        role: 'mozo',
        defaultView: 'salon',
        allowedViews: ['salon'],
      },
      details: { attemptedIdentifier: identifier },
    })

    return {
      success: false,
      error: result.error || 'Credenciales inválidas.',
    }
  }

  const user = result.user

  try {
    const cookieStore = await cookies()
    cookieStore.set(AUTH_COOKIE_NAME, encodeURIComponent(JSON.stringify(user)), {
      path: '/',
      httpOnly: false, // Accesible por cliente para sincronizar sesión rápida
      maxAge: 43200, // 12 horas de turno
      sameSite: 'lax',
    })
  } catch (err) {
    console.error('Error al guardar cookie de sesión:', err)
  }

  // Registrar login exitoso en bitácora de auditoría
  await recordAuditLog({
    action: 'LOGIN',
    entity: 'auth',
    entityId: user.id,
    user,
    details: {
      legajo: user.legajo,
      role: user.role,
      allowedViews: user.allowedViews,
    },
  })

  return {
    success: true,
    user,
  }
}

/**
 * Server Action para cerrar sesión
 */
export async function logoutUserAction(currentUser?: AuthenticatedUser | null): Promise<{
  success: boolean
}> {
  if (currentUser) {
    await recordAuditLog({
      action: 'LOGOUT',
      entity: 'auth',
      entityId: currentUser.id,
      user: currentUser,
      details: { legajo: currentUser.legajo },
    })
  }

  try {
    const cookieStore = await cookies()
    cookieStore.delete(AUTH_COOKIE_NAME)
  } catch (err) {
    console.error('Error al borrar cookie de sesión:', err)
  }

  return { success: true }
}

/**
 * Server Action para obtener el usuario de la sesión activa
 */
export async function getSessionUserAction(): Promise<{
  user: AuthenticatedUser | null
}> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(AUTH_COOKIE_NAME)
    if (sessionCookie && sessionCookie.value) {
      const parsed = JSON.parse(decodeURIComponent(sessionCookie.value)) as AuthenticatedUser
      if (parsed && parsed.id && parsed.name) {
        return { user: parsed }
      }
    }
  } catch (err) {
    // Sin sesión activa
  }

  return { user: null }
}
