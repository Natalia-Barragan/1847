export type UserRole =
  | 'admin'
  | 'cajero'
  | 'cocina'
  | 'mozo'
  | 'salon'
  | 'takeaway'
  | 'cashier'
  | 'kitchen'

export type ViewTab = 'salon' | 'takeaway' | 'cashier' | 'kitchen' | 'admin'

export interface AuthenticatedUser {
  id: string
  username?: string
  name: string
  legajo: string
  role: UserRole
  title?: string
  specialty?: string
  permissions?: string[]
  avatarColor?: string
  badgeBg?: string
  defaultView?: ViewTab
  allowedViews?: ViewTab[]
  passwords?: string[]
}

export const AUTH_COOKIE_NAME = 'fuego_session_user'

/**
 * Perfiles oficiales de los 5 roles operativos para "1847 - parrilla & cerveceria"
 * Cada perfil cuenta con sus credenciales (usuario/legajo y contraseña)
 * y su lista estricta de vistas permitidas (RBAC).
 */
export const SYSTEM_OPERATORS: AuthenticatedUser[] = [
  {
    id: 'usr-adm-001',
    username: 'natalia',
    name: 'Natalia',
    legajo: 'ADM-001',
    role: 'admin',
    title: 'Administración General & Dueña',
    specialty: 'Acceso Total a Todas las Áreas',
    permissions: [
      'Acceso total a todas las secciones',
      'Caja & Facturación',
      'KDS Cocina & Fuegos',
      'Administración & Finanzas',
      'Cierres de Turno Z & Arqueo',
      'Configuración fiscal ARCA',
      'Auditoría & Trazabilidad',
    ],
    avatarColor: 'bg-purple-600 text-white',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    defaultView: 'admin',
    allowedViews: ['salon', 'takeaway', 'cashier', 'kitchen', 'admin'], // ADMIN TIENE TODO ACTIVADO
    passwords: ['admin1847', 'natalia1847', '1847'],
  },
  {
    id: 'usr-caj-001',
    username: 'cajero',
    name: 'Cajero',
    legajo: 'CAJ-001',
    role: 'cajero',
    title: 'Caja & Facturación',
    specialty: 'Cobros, Turnos y ARCA',
    permissions: [
      'Acceso integral a Caja & Cobros',
      'Toma y creación de pedidos (Salón y Mostrador/Take Away)',
      'Emisión e impresión de comandas divididas por estación (Parrilla y Cocina)',
      'Gestión de cuentas y medios de pago',
      'Facturación fiscal ARCA y comprobantes X',
      'Gestión de turnos de caja (Apertura y Cierre Z)',
      'Anulación de ítems con justificación',
    ],
    avatarColor: 'bg-emerald-600 text-white',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    defaultView: 'cashier',
    allowedViews: ['cashier', 'salon', 'takeaway'], // Operación completa de pedidos y cobros
    passwords: ['caja1847', 'cajero1847', '1847'],
  },
  {
    id: 'usr-par-001',
    username: 'parrillero',
    name: 'Parrillero',
    legajo: 'PAR-001',
    role: 'cocina',
    title: 'Parrilla & Fuego',
    specialty: 'Especialidad Carnes y Fuegos',
    permissions: [
      'Acceso exclusivo al KDS de cocina para comandas de carnes y fuegos',
      'Control de puntos de cocción',
      'Despacho de cortes a las brasas',
      'Impresión de comandas de parrilla',
    ],
    avatarColor: 'bg-orange-600 text-white',
    badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    defaultView: 'kitchen',
    allowedViews: ['kitchen'], // SOLO COCINA KDS (PARRILLA)
    passwords: ['fuego1847', 'parrilla1847', '1847'],
  },
  {
    id: 'usr-coc-001',
    username: 'cocinero',
    name: 'Cocinero',
    legajo: 'COC-001',
    role: 'cocina',
    title: 'Cocina & Preparación',
    specialty: 'Guarniciones, Entradas y Bebidas',
    permissions: [
      'Acceso al KDS de cocina para guarniciones, entradas y bebidas',
      'Preparación de minutas y empanadas',
      'Despacho de cocina fría y caliente',
      'Control de stock inmediato de cocina',
    ],
    avatarColor: 'bg-sky-600 text-white',
    badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    defaultView: 'kitchen',
    allowedViews: ['kitchen'], // SOLO COCINA KDS (COCINA)
    passwords: ['cocina1847', '1847'],
  },
  {
    id: 'usr-moz-001',
    username: 'mozo',
    name: 'Mozo',
    legajo: 'MOZ-001',
    role: 'mozo',
    title: 'Salón & Mesas',
    specialty: 'Atención al Comensal',
    permissions: [
      'Acceso a la toma de pedidos por mesa',
      'Envío de comandas a cocina y parrilla',
      'Emisión de pre-cuentas de mesa',
      'Control de estado de mesas (libre/ocupada/cuenta)',
    ],
    avatarColor: 'bg-indigo-600 text-white',
    badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    defaultView: 'salon',
    allowedViews: ['salon'], // SOLO MOZO / SALÓN
    passwords: ['salon1847', 'mozo1847', '1847'],
  },
]

// Mantiene compatibilidad con exportaciones anteriores
export const DEFAULT_SYSTEM_OPERATORS = SYSTEM_OPERATORS

/**
 * Valida credenciales contra la nómina oficial del sistema
 */
export function verifyUserCredentials(
  identifier: string,
  secret: string
): { success: boolean; user?: AuthenticatedUser; error?: string } {
  const cleanId = (identifier || '').trim().toLowerCase()
  const cleanPass = (secret || '').trim()

  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Por favor complete usuario/legajo y contraseña.' }
  }

  const found = SYSTEM_OPERATORS.find(
    (u) =>
      (u.username && u.username.toLowerCase() === cleanId) ||
      u.legajo.toLowerCase() === cleanId ||
      u.name.toLowerCase() === cleanId
  )

  if (!found) {
    return { success: false, error: 'Usuario o legajo no encontrado.' }
  }

  const validPasswords = found.passwords || ['1847']
  const isMatch = validPasswords.includes(cleanPass)

  if (!isMatch) {
    return { success: false, error: 'Contraseña incorrecta para el usuario indicado.' }
  }

  // Devolver usuario sin exponer el array de passwords
  const { passwords, ...userSafe } = found
  return { success: true, user: userSafe as AuthenticatedUser }
}

/**
 * Formatea el identificador amigable del usuario para registros de auditoría y tickets
 */
export function formatAuditUserLabel(user: AuthenticatedUser): string {
  const legajoStr = user.legajo ? `[${user.legajo}]` : '[Sin legajo]'
  return `${user.name} ${legajoStr}`
}
