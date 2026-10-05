'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Bell,
  ChefHat,
  Clock,
  Clock3,
  CreditCard,
  Flame,
  LayoutGrid,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Utensils,
  Wallet,
  X,
  Volume2,
  AlertTriangle,
  FileText,
  User,
  Phone,
  Calendar,
  Check,
  CheckCircle,
  Search,
  Edit,
  Slash,
  PlusCircle,
  Tag,
  DollarSign,
  Layers,
  ShieldAlert,
  Printer,
  Lock,
  LogOut,
  KeyRound,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import {
  openOrderAction,
  updateKdsStatusAction,
  closeOrderAndInvoiceAction,
  closeOrderWithoutInvoiceAction,
  cancelOrderItemAction,
  emitirPrecuentaAction,
} from '@/app/actions/orders'
import {
  openCashRegisterShiftAction,
  closeCashRegisterShiftAction,
  getActiveCashRegisterShiftAction,
  getRecentCashRegisterShiftsAction,
} from '@/app/actions/shifts'
import { getAuditLogsAction } from '@/app/actions/audit'
import { loginUserAction, logoutUserAction } from '@/app/actions/auth'
import {
  AuthenticatedUser,
  DEFAULT_SYSTEM_OPERATORS,
  SYSTEM_OPERATORS,
  formatAuditUserLabel,
} from '@/lib/auth'
import { calculateArcaInvoiceAmounts } from '@/app/actions/arca'
import { FISCAL_REGIME } from '@/lib/arca-constants'
import { registerStockPurchaseAction } from '@/app/actions/inventory'
import {
  createProductAction,
  updateProductAction,
  toggleProductAvailabilityAction,
} from '@/app/actions/menu'
import { getInitialDashboardData, getAdminMetricsAction, AdminMetrics } from '@/app/actions/queries'
import {
  TableRow,
  CategoryRow,
  ProductRow,
  OrderRow,
  OrderItemRow,
  InventoryStockRow,
  InvoiceArcaRow,
  CashRegisterShiftRow,
  AuditLogRow,
} from '@/types/database.types'
import { ThermalReceipt, ThermalReceiptProps } from '@/components/thermal-receipt'

type Role = 'salon' | 'takeaway' | 'cashier' | 'kitchen' | 'admin'
type OrderWithItems = OrderRow & {
  order_items: (OrderItemRow & {
    products: { name: string; detail: string | null; price: number } | null
  })[]
}

const roles: { id: Role; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'salon', label: 'Mozo / Salón', icon: LayoutGrid },
  { id: 'takeaway', label: 'Parrilla / Take Away', icon: ShoppingBag },
  { id: 'cashier', label: 'Caja / Facturación', icon: Wallet },
  { id: 'kitchen', label: 'Cocina KDS', icon: ChefHat },
  { id: 'admin', label: 'Admin & Finanzas', icon: Receipt },
]

const isParrillaProduct = (productName?: string) => {
  const n = (productName || '').toLowerCase()
  return (
    n.includes('bife') ||
    n.includes('entraña') ||
    n.includes('asado') ||
    n.includes('parrilla') ||
    n.includes('ojo') ||
    n.includes('corte') ||
    n.includes('vacio') ||
    n.includes('chorizo') ||
    n.includes('morcilla') ||
    n.includes('molleja') ||
    n.includes('provoleta') ||
    n.includes('tira') ||
    n.includes('matambre') ||
    n.includes('chinchulin')
  )
}

const formatMoney = (value: number) => `$ ${value.toLocaleString('es-AR')}`

let sharedAudioCtx: AudioContext | null = null

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx()
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {})
    }
    return sharedAudioCtx
  } catch {
    return null
  }
}

// Desbloquear audio automáticamente al interactuar con cualquier parte de la pestaña
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext()
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    } catch {}
  }
  window.addEventListener('click', unlockAudio, { passive: true })
  window.addEventListener('touchstart', unlockAudio, { passive: true })
  window.addEventListener('keydown', unlockAudio, { passive: true })
}

const playNotificationSound = (type: 'order' | 'bill' | 'ready') => {
  if (typeof window === 'undefined') return
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const doPlay = () => {
      try {
        const now = ctx.currentTime
        if (type === 'ready') {
          // Doble campana de pase de cocina (A5 -> D6) alegre para aviso a mozos
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, now) // A5
          osc.frequency.setValueAtTime(1174.66, now + 0.14) // D6
          gain.gain.setValueAtTime(0.35, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now)
          osc.stop(now + 0.55)
        } else if (type === 'order') {
          // Campana de comanda entrante (D5 -> A5)
          const osc1 = ctx.createOscillator()
          const gain1 = ctx.createGain()
          osc1.type = 'sine'
          osc1.frequency.setValueAtTime(587.33, now) // D5
          osc1.frequency.exponentialRampToValueAtTime(880, now + 0.16) // A5
          gain1.gain.setValueAtTime(0.3, now)
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
          osc1.connect(gain1)
          gain1.connect(ctx.destination)
          osc1.start(now)
          osc1.stop(now + 0.4)
        } else {
          // Solicitud de cuenta / ticket (C6)
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(1046.5, now) // C6
          gain.gain.setValueAtTime(0.25, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now)
          osc.stop(now + 0.45)
        }
      } catch (err) {
        console.log('Error executing audio playback:', err)
      }
    }

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => doPlay()).catch(() => doPlay())
    } else {
      doPlay()
    }
  } catch (err) {
    console.log('Audio disabled or blocked by browser:', err)
  }
}

const broadcastAction = (event: {
  type: 'NEW_ORDER' | 'UPDATE_ORDER_STATUS' | 'REQUEST_BILL' | 'ORDER_CLOSED' | 'ORDERS_OVERWRITE' | 'TABLES_UPDATED' | 'SYNC_STATE'
  payload: any
}) => {
  if (typeof window === 'undefined') return
  try {
    const bc = new BroadcastChannel('1847_parrilla_realtime_sync')
    bc.postMessage(event)
    bc.close()
  } catch {}
}

// --- DATOS POR DEFECTO PARA MODO DEMO LOCAL ---
const DEFAULT_CATEGORIES: CategoryRow[] = [
  { id: 'c1000000-0000-0000-0000-000000000001', name: 'Cortes', slug: 'cortes', icon: 'Flame', created_at: new Date().toISOString() },
  { id: 'c1000000-0000-0000-0000-000000000002', name: 'Guarniciones', slug: 'guarniciones', icon: 'Utensils', created_at: new Date().toISOString() },
  { id: 'c1000000-0000-0000-0000-000000000003', name: 'Minutas', slug: 'minutas', icon: 'ShoppingBag', created_at: new Date().toISOString() },
  { id: 'c1000000-0000-0000-0000-000000000004', name: 'Bebidas', slug: 'bebidas', icon: 'Bell', created_at: new Date().toISOString() },
  { id: 'c1000000-0000-0000-0000-000000000005', name: 'Postres', slug: 'postres', icon: 'ChefHat', created_at: new Date().toISOString() },
]

const DEFAULT_PRODUCTS: ProductRow[] = [
  { id: 'p1000000-0000-0000-0000-000000000001', category_id: 'c1000000-0000-0000-0000-000000000001', name: 'Bife de Chorizo', price: 18500, detail: '400g · a la parrilla', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000002', category_id: 'c1000000-0000-0000-0000-000000000001', name: 'Ojo de Bife', price: 21000, detail: '350g · corte premium', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000003', category_id: 'c1000000-0000-0000-0000-000000000001', name: 'Entraña Fuego', price: 16800, detail: '300g · chimichurri', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000004', category_id: 'c1000000-0000-0000-0000-000000000002', name: 'Papas Fritas', price: 4800, detail: 'con provenzal', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000005', category_id: 'c1000000-0000-0000-0000-000000000002', name: 'Ensalada Criolla', price: 4200, detail: 'tomate · cebolla · ají', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000006', category_id: 'c1000000-0000-0000-0000-000000000003', name: 'Empanadas de Carne', price: 3200, detail: 'unidad · al horno', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000007', category_id: 'c1000000-0000-0000-0000-000000000004', name: 'Agua Mineral', price: 2200, detail: 'sin gas 500ml', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
  { id: 'p1000000-0000-0000-0000-000000000008', category_id: 'c1000000-0000-0000-0000-000000000005', name: 'Flan Casero', price: 3900, detail: 'con dulce de leche', vat_rate: 21, is_active: true, created_at: new Date().toISOString() },
]

const DEFAULT_TABLES: TableRow[] = [
  // Salón Central (4 Mesas · 4 personas c/u)
  { id: 'tbl-m01', number: 'M01', status: 'libre', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-m02', number: 'M02', status: 'ocupada', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-m03', number: 'M03', status: 'ocupada', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-m04', number: 'M04', status: 'libre', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  // Ingreso / Ochava (Ventanales y Recepción)
  { id: 'tbl-m05', number: 'M05', status: 'cuenta', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-m06', number: 'M06', status: 'libre', capacity: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  // Barra & Espera Take Away (Frente a Parrilla · Pago Adelantado)
  { id: 'tbl-b1', number: 'B1', status: 'ocupada', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-b2', number: 'B2', status: 'libre', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-b3', number: 'B3', status: 'libre', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'tbl-b4', number: 'B4', status: 'libre', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

const DEFAULT_INVENTORY: (InventoryStockRow & { products: { name: string } | null })[] = [
  { id: 'inv-01', product_id: 'p1000000-0000-0000-0000-000000000001', name: 'Porciones Bife de Chorizo', current_quantity: 45, unit: 'unidad', min_stock: 10, updated_at: new Date().toISOString(), products: { name: 'Bife de Chorizo' } },
  { id: 'inv-02', product_id: 'p1000000-0000-0000-0000-000000000002', name: 'Porciones Ojo de Bife', current_quantity: 35, unit: 'unidad', min_stock: 8, updated_at: new Date().toISOString(), products: { name: 'Ojo de Bife' } },
  { id: 'inv-03', product_id: 'p1000000-0000-0000-0000-000000000003', name: 'Porciones Entraña Fuego', current_quantity: 28, unit: 'unidad', min_stock: 6, updated_at: new Date().toISOString(), products: { name: 'Entraña Fuego' } },
  { id: 'inv-04', product_id: 'p1000000-0000-0000-0000-000000000007', name: 'Agua Mineral 500ml', current_quantity: 110, unit: 'unidad', min_stock: 24, updated_at: new Date().toISOString(), products: { name: 'Agua Mineral' } },
]

export default function Page() {
  const [role, setRole] = useState<Role>('salon')
  const [loading, setLoading] = useState(true)
  const [dbConnected, setDbConnected] = useState(false)

  // Estados de datos
  const [tables, setTables] = useState<TableRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [inventory, setInventory] = useState<(InventoryStockRow & { products: { name: string } | null })[]>([])

  // Métricas del Admin
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics | null>(null)

  // Controladores de Diálogos
  const [orderOpen, setOrderOpen] = useState(false)
  const [selectedTableNumber, setSelectedTableNumber] = useState<string>()
  const [notification, setNotification] = useState<{ text: string; type: 'info' | 'success' | 'warn' } | null>(null)
  const [demoPanelExpanded, setDemoPanelExpanded] = useState(false)

  // ESTADO DE OPERADOR / USUARIO AUTENTICADO PARA AUDITORÍA
  const [activeUser, setActiveUser] = useState<AuthenticatedUser | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const sessionSaved = sessionStorage.getItem('fuego_active_user')
        if (sessionSaved) return JSON.parse(sessionSaved)
        const saved = localStorage.getItem('fuego_active_user')
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return DEFAULT_SYSTEM_OPERATORS[0] // Natalia (Admin) en sesión inicial
  })

  // Asegurar que la vista activa pertenezca a las permitidas por el rol del usuario (RBAC)
  useEffect(() => {
    if (activeUser && activeUser.allowedViews && !activeUser.allowedViews.includes(role)) {
      setRole(activeUser.defaultView || 'salon')
    }
  }, [activeUser, role])

  const handleLogout = async () => {
    try {
      if (activeUser) {
        await logoutUserAction(activeUser)
      }
    } catch {}
    try {
      sessionStorage.removeItem('fuego_active_user')
      localStorage.removeItem('fuego_active_user')
    } catch {}
    setActiveUser(null)
    showNotification('Sesión cerrada. Ingrese con usuario y contraseña.', 'info')
  }

  // ESTADO DE TURNOS DE CAJA (Apertura y Cierre Z)
  const [activeShift, setActiveShift] = useState<CashRegisterShiftRow | null>(null)
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false)
  const [initialCashInput, setInitialCashInput] = useState<number>(50000)
  const [shiftNameInput, setShiftNameInput] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const h = new Date().getHours()
      return h >= 18 || h < 5 ? 'Turno Noche' : 'Turno Mediodía'
    }
    return 'Turno Mediodía'
  })
  const [isOpeningShift, setIsOpeningShift] = useState(false)

  // ESTADO DE ANULACIÓN DE ÍTEMS CON JUSTIFICACIÓN
  const [itemToCancel, setItemToCancel] = useState<{
    orderId: string
    item: OrderItemRow & { products?: any }
  } | null>(null)
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('')
  const [isCancellingItem, setIsCancellingItem] = useState(false)

  // ESTADO Y DISPARADOR DE IMPRESIÓN TÉRMICA CON AUDITORÍA
  const [receiptData, setReceiptData] = useState<ThermalReceiptProps | null>(null)

  // Función para lanzar la ventana de impresión térmica del navegador con trazabilidad de operador
  const handlePrint = (type: ThermalReceiptProps['type'], data: ThermalReceiptProps['data']) => {
    setReceiptData({
      type,
      data: {
        ...data,
        operatorName: data.operatorName || (activeUser ? formatAuditUserLabel(activeUser) : 'Operador'),
      },
    })
    setTimeout(() => {
      window.print()
    }, 150)
  }

  // Función para imprimir comandas divididas por estación: 1 para Parrillero y 1 para Cocinero
  const handlePrintKitchenStations = (orderData: {
    id?: string
    tableNumber?: string
    origin?: string
    customerName?: string
    createdAt?: string
    items: { quantity: number; name: string; notes?: string | null; unitPrice?: number }[]
  }) => {
    const parrillaItems = orderData.items.filter((it) => isParrillaProduct(it.name))
    const cocinaItems = orderData.items.filter((it) => !isParrillaProduct(it.name))

    const stationTickets: {
      stationTitle: string
      stationBadge: string
      items: { quantity: number; name: string; notes?: string | null; unitPrice?: number }[]
    }[] = []

    if (parrillaItems.length > 0) {
      stationTickets.push({
        stationTitle: 'COMANDA PARRILLERO (CARNES & FUEGOS)',
        stationBadge: 'PARRILLERO',
        items: parrillaItems,
      })
    }

    if (cocinaItems.length > 0) {
      stationTickets.push({
        stationTitle: 'COMANDA COCINERO (MINUTAS, ENTRADAS & BEBIDAS)',
        stationBadge: 'COCINERO',
        items: cocinaItems,
      })
    }

    if (stationTickets.length === 0) {
      stationTickets.push({
        stationTitle: 'COMANDA GENERAL',
        stationBadge: 'GENERAL',
        items: orderData.items,
      })
    }

    handlePrint('kitchen', {
      orderId: orderData.id,
      tableNumber: orderData.tableNumber,
      origin: orderData.origin,
      customerName: orderData.customerName,
      createdAt: orderData.createdAt || new Date().toISOString(),
      stationTickets,
      items: orderData.items,
    })
  }

  // Carga inicial de datos y turno activo
  const loadDashboardData = async () => {
    try {
      const res = await getInitialDashboardData()
      if (res.success && res.tables.length > 0) {
        setTables(res.tables)
        setCategories(res.categories)
        setProducts(res.products)
        setOrders(res.orders)
        setInventory(res.inventory)
        setDbConnected(true)

        // Cargar turno de caja activo en base de datos
        const shiftRes = await getActiveCashRegisterShiftAction()
        if (shiftRes.success && shiftRes.shift) {
          setActiveShift(shiftRes.shift)
          try {
            localStorage.setItem('fuego_live_shift', JSON.stringify(shiftRes.shift))
          } catch {}
        } else {
          if (typeof window !== 'undefined') {
            try {
              const savedShift = localStorage.getItem('fuego_live_shift')
              if (savedShift) setActiveShift(JSON.parse(savedShift))
            } catch {}
          }
        }

        // Cargar métricas administrativas consolidadas, fiscales y operativas
        const metricsRes = await getAdminMetricsAction()
        if (metricsRes.success) {
          setAdminMetrics(metricsRes)
        }
      } else {
        // Fallback local en memoria con persistencia compartida entre pestañas
        let localTables = DEFAULT_TABLES
        let localOrders: OrderWithItems[] = []
        let localShift: CashRegisterShiftRow | null = null
        if (typeof window !== 'undefined') {
          try {
            const savedTables = localStorage.getItem('fuego_live_tables')
            if (savedTables) localTables = JSON.parse(savedTables)
            const savedOrders = localStorage.getItem('fuego_live_orders')
            if (savedOrders) localOrders = JSON.parse(savedOrders)
            const savedShift = localStorage.getItem('fuego_live_shift')
            if (savedShift) localShift = JSON.parse(savedShift)
          } catch {}
        }
        setTables(localTables)
        setCategories(DEFAULT_CATEGORIES)
        setProducts(DEFAULT_PRODUCTS)
        setInventory(DEFAULT_INVENTORY)
        if (localOrders.length > 0) {
          setOrders(localOrders)
        }
        if (localShift) {
          setActiveShift(localShift)
        }
        setDbConnected(false)
        showNotification('Modo sincronizado en vivo (Salón · Cocina KDS · Caja).', 'info')
      }
    } catch (err) {
      let localTables = DEFAULT_TABLES
      let localOrders: OrderWithItems[] = []
      let localShift: CashRegisterShiftRow | null = null
      if (typeof window !== 'undefined') {
        try {
          const savedTables = localStorage.getItem('fuego_live_tables')
          if (savedTables) localTables = JSON.parse(savedTables)
          const savedOrders = localStorage.getItem('fuego_live_orders')
          if (savedOrders) localOrders = JSON.parse(savedOrders)
          const savedShift = localStorage.getItem('fuego_live_shift')
          if (savedShift) localShift = JSON.parse(savedShift)
        } catch {}
      }
      setTables(localTables)
      setCategories(DEFAULT_CATEGORIES)
      setProducts(DEFAULT_PRODUCTS)
      setInventory(DEFAULT_INVENTORY)
      if (localOrders.length > 0) {
        setOrders(localOrders)
      }
      if (localShift) {
        setActiveShift(localShift)
      }
      setDbConnected(false)
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // COMANDAS LISTAS PARA EL PASE (Aviso / Alerta inmediata para el Mozo)
  // =========================================================================
  const readyOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'open' && o.kds_status === 'ready')
  }, [orders])

  const prevReadyIdsRef = useRef<Set<string>>(new Set())
  const isInitialReadyCheckDone = useRef(false)

  // Alerta sonora (doble campana de pase) y notificación visual al mozo en tiempo real
  useEffect(() => {
    const currentReadyIds = new Set(readyOrders.map((o) => o.id))

    if (isInitialReadyCheckDone.current) {
      const newlyReady = readyOrders.filter((o) => !prevReadyIdsRef.current.has(o.id))
      if (newlyReady.length > 0) {
        newlyReady.forEach((order) => {
          const table = tables.find((t) => t.id === order.table_id)
          const tableNum = table ? `Mesa ${table.number}` : order.origin === 'takeaway' ? 'Take Away' : 'QR Fast Order'
          showNotification(`🛎️ ¡${tableNum.toUpperCase()} LISTA! Pedido preparado para retirar del pase.`, 'success')
        })
        playNotificationSound('ready')
      }
    } else {
      isInitialReadyCheckDone.current = true
    }

    prevReadyIdsRef.current = currentReadyIds
  }, [readyOrders, tables])

  // Funciones KDS y Despacho disponibles tanto para Cocina como para Salón/Mozo
  const advanceStatus = async (orderId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'pending' ? 'preparing' : 'ready'
    const res = await updateKdsStatusAction(orderId, nextStatus)

    setOrders((curr) => {
      const updated = curr.map((o) => (o.id === orderId ? { ...o, kds_status: nextStatus as any } : o))
      try {
        localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
      } catch {}
      return updated
    })

    broadcastAction({
      type: 'UPDATE_ORDER_STATUS',
      payload: { orderId, kds_status: nextStatus },
    })

    if (res.success) {
      if (nextStatus === 'ready') {
        playNotificationSound('ready')
        showNotification('🍽️ Comanda LISTA para despacho. Mozo alertado.', 'success')
      } else {
        showNotification('Pedido avanzado de estado.', 'success')
      }
    } else {
      if (nextStatus === 'ready') {
        playNotificationSound('ready')
        showNotification('🍽️ Comanda LISTA en el pase. Mozo alertado en tiempo real.', 'success')
      } else {
        showNotification('Estado actualizado en preparación.', 'success')
      }
    }
  }

  const deliverOrder = async (orderId: string) => {
    const res = await updateKdsStatusAction(orderId, 'delivered')

    setOrders((curr) => {
      const updated = curr.map((o) => (o.id === orderId ? { ...o, kds_status: 'delivered' as any } : o))
      try {
        localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
      } catch {}
      return updated
    })

    broadcastAction({
      type: 'UPDATE_ORDER_STATUS',
      payload: { orderId, kds_status: 'delivered' },
    })

    if (res.success) {
      showNotification('✅ Comanda entregada en la mesa con éxito.', 'success')
    } else {
      showNotification('✅ Entregado en mesa.', 'success')
    }
  }

  // =========================================================================
  // FUNCIONES DE SIMULACIÓN DE TURNO COMPLETO Y CLIENTE EN VIVO (MODO DEMO)
  // =========================================================================
  const runFullShiftSimulation = () => {
    const now = Date.now()

    // 1. Poblado de mesas según distribución física del local (7.30m x 4.70m con ochava)
    const shiftTables: TableRow[] = [
      // Salón Central
      { id: 'tbl-m01', number: 'M01', status: 'libre', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-m02', number: 'M02', status: 'ocupada', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-m03', number: 'M03', status: 'ocupada', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-m04', number: 'M04', status: 'libre', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      // Ingreso / Ochava
      { id: 'tbl-m05', number: 'M05', status: 'cuenta', capacity: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-m06', number: 'M06', status: 'libre', capacity: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      // Barra & Espera Take Away
      { id: 'tbl-b1', number: 'B1', status: 'ocupada', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-b2', number: 'B2', status: 'libre', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-b3', number: 'B3', status: 'libre', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'tbl-b4', number: 'B4', status: 'libre', capacity: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ]
    setTables(shiftTables)

    setCategories(DEFAULT_CATEGORIES)
    setProducts(DEFAULT_PRODUCTS)

    // 2. Comandas activas para Salón, Barra y Cocina KDS
    const openDemoOrders: OrderWithItems[] = [
      // B1: BARRA / TAKE AWAY (PAGO PREVIO ABONADO EN EFECTIVO $18.500)
      {
        id: 'ord-sim-b1',
        table_id: 'tbl-b1',
        origin: 'takeaway',
        customer_name: 'B1 · Cliente Barra (Pago Previo)',
        customer_phone: '11 4433 2211',
        estimated_time: '13:35',
        notes: '⚡ PAGO PREVIO ABONADO ($18.500 EFECTIVO) - Retiro al paso',
        status: 'open',
        kds_status: 'preparing',
        subtotal: 18500,
        discount_pct: 0,
        discount_amount: 0,
        payment_method: 'efectivo',
        total: 18500,
        closed_at: null,
        created_at: new Date(now - 8 * 60000).toISOString(),
        updated_at: new Date(now - 8 * 60000).toISOString(),
        order_items: [
          {
            id: 'item-b1-1',
            order_id: 'ord-sim-b1',
            product_id: 'p1000000-0000-0000-0000-000000000001',
            quantity: 1,
            unit_price: 18500,
            notes: 'A punto · Para llevar',
            created_at: new Date().toISOString(),
            products: { name: 'Bife de Chorizo', detail: '400g · a la parrilla', price: 18500 },
          },
        ],
      },
      // M02: SALÓN CENTRAL (Ocupada - En preparación)
      {
        id: 'ord-sim-m02',
        table_id: 'tbl-m02',
        origin: 'salon',
        customer_name: 'Familia Rossi (M02)',
        customer_phone: null,
        estimated_time: null,
        notes: 'Puntos de cocción diferenciados',
        status: 'open',
        kds_status: 'preparing',
        subtotal: 46200,
        discount_pct: 0,
        discount_amount: 0,
        payment_method: null,
        total: 46200,
        closed_at: null,
        created_at: new Date(now - 16 * 60000).toISOString(),
        updated_at: new Date(now - 16 * 60000).toISOString(),
        order_items: [
          { id: 'item-m02-1', order_id: 'ord-sim-m02', product_id: 'p1000000-0000-0000-0000-000000000001', quantity: 2, unit_price: 18500, notes: 'Jugoso', created_at: new Date().toISOString(), products: { name: 'Bife de Chorizo', detail: '400g · a la parrilla', price: 18500 } },
          { id: 'item-m02-2', order_id: 'ord-sim-m02', product_id: 'p1000000-0000-0000-0000-000000000004', quantity: 1, unit_price: 4800, notes: 'Provenzal', created_at: new Date().toISOString(), products: { name: 'Papas Fritas', detail: 'con provenzal', price: 4800 } },
          { id: 'item-m02-3', order_id: 'ord-sim-m02', product_id: 'p1000000-0000-0000-0000-000000000007', quantity: 2, unit_price: 2200, notes: null, created_at: new Date().toISOString(), products: { name: 'Agua Mineral', detail: 'sin gas 500ml', price: 2200 } },
        ],
      },
      // M03: SALÓN CENTRAL (Ocupada - Comanda Lista)
      {
        id: 'ord-sim-m03',
        table_id: 'tbl-m03',
        origin: 'salon',
        customer_name: 'Martín G. (M03)',
        customer_phone: null,
        estimated_time: null,
        notes: 'Marchado a mesa',
        status: 'open',
        kds_status: 'ready',
        subtotal: 40000,
        discount_pct: 0,
        discount_amount: 0,
        payment_method: null,
        total: 40000,
        closed_at: null,
        created_at: new Date(now - 20 * 60000).toISOString(),
        updated_at: new Date(now - 20 * 60000).toISOString(),
        order_items: [
          { id: 'item-m03-1', order_id: 'ord-sim-m03', product_id: 'p1000000-0000-0000-0000-000000000003', quantity: 2, unit_price: 16800, notes: 'A punto', created_at: new Date().toISOString(), products: { name: 'Entraña Fuego', detail: '300g', price: 16800 } },
          { id: 'item-m03-2', order_id: 'ord-sim-m03', product_id: 'p1000000-0000-0000-0000-000000000006', quantity: 2, unit_price: 3200, notes: null, created_at: new Date().toISOString(), products: { name: 'Empanadas de Carne', detail: 'al horno', price: 3200 } },
        ],
      },
      // M05: INGRESO / OCHAVA (PIDE CUENTA $34.200)
      {
        id: 'ord-sim-m05',
        table_id: 'tbl-m05',
        origin: 'salon',
        customer_name: 'Mesa Ochava (M05)',
        customer_phone: null,
        estimated_time: null,
        notes: 'Solicita la cuenta en mesa ($34.200)',
        status: 'open',
        kds_status: 'delivered',
        subtotal: 34200,
        discount_pct: 0,
        discount_amount: 0,
        payment_method: null,
        total: 34200,
        closed_at: null,
        created_at: new Date(now - 40 * 60000).toISOString(),
        updated_at: new Date(now - 40 * 60000).toISOString(),
        order_items: [
          { id: 'item-m05-1', order_id: 'ord-sim-m05', product_id: 'p1000000-0000-0000-0000-000000000003', quantity: 1, unit_price: 16800, notes: 'Jugoso', created_at: new Date().toISOString(), products: { name: 'Entraña Fuego', detail: '300g', price: 16800 } },
          { id: 'item-m05-2', order_id: 'ord-sim-m05', product_id: 'p1000000-0000-0000-0000-000000000006', quantity: 4, unit_price: 3200, notes: null, created_at: new Date().toISOString(), products: { name: 'Empanadas de Carne', detail: 'unidad', price: 3200 } },
          { id: 'item-m05-3', order_id: 'ord-sim-m05', product_id: 'p1000000-0000-0000-0000-000000000004', quantity: 1, unit_price: 4600, notes: null, created_at: new Date().toISOString(), products: { name: 'Papas Fritas', detail: 'con provenzal', price: 4600 } },
        ],
      },
    ]

    // 3. Generar historial de órdenes cerradas para métricas de Admin
    const closedDemoOrders: OrderWithItems[] = Array.from({ length: 16 }).map((_, i) => ({
      id: `closed-sim-${i + 1}`,
      table_id: `tbl-m0${(i % 5) + 1}`,
      origin: i % 4 === 0 ? 'takeaway' : 'salon',
      customer_name: `Cliente Histórico ${i + 1}`,
      customer_phone: null,
      estimated_time: null,
      notes: null,
      status: 'closed',
      kds_status: 'delivered',
      subtotal: 42000,
      discount_pct: 0,
      discount_amount: 0,
      payment_method: i % 4 === 0 ? 'efectivo' : i % 4 === 1 ? 'debito' : i % 4 === 2 ? 'credito' : 'qr',
      total: 42000,
      closed_at: new Date(now - (i + 1) * 3600000).toISOString(),
      created_at: new Date(now - (i + 2) * 3600000).toISOString(),
      updated_at: new Date(now - (i + 1) * 3600000).toISOString(),
      order_items: [
        { id: `citem-${i}`, order_id: `closed-sim-${i + 1}`, product_id: 'p1000000-0000-0000-0000-000000000001', quantity: 2, unit_price: 18500, notes: null, created_at: new Date().toISOString(), products: { name: 'Bife de Chorizo', detail: null, price: 18500 } },
      ],
    }))

    const simulatedOrders = [...openDemoOrders, ...closedDemoOrders]
    setOrders(simulatedOrders)
    try {
      localStorage.setItem('fuego_live_orders', JSON.stringify(simulatedOrders))
      localStorage.setItem('fuego_live_tables', JSON.stringify(shiftTables))
    } catch {}

    broadcastAction({
      type: 'SYNC_STATE',
      payload: { orders: simulatedOrders, tables: shiftTables },
    })

    // 4. Métricas de Admin consolidadas (incluye el pago en efectivo abonado en B1)
    setAdminMetrics({
      success: true,
      totalSalesToday: 710900,
      totalSalesMonth: 8650000,
      averageTicketToday: 32313,
      ordersCountToday: 22,
      salesByMethod: {
        efectivo: 302860,
        debito: 213020,
        credito: 130800,
        qr: 64220,
      },
      fiscal: {
        netAmount: 587520.66,
        vatAmount: 123379.34,
        totalInvoiced: 710900,
      },
    })

    playNotificationSound('order')
    showNotification('⚡ TURNO SIMULADO: Salón Central (M02, M03), Ochava (M05 Pide Cuenta) y Barra B1 (Pago Previo)', 'success')
  }

  const runCustomerOrderSimulation = () => {
    const newOrderId = `ord-live-${Date.now()}`
    const randomTableNum = ['M01', 'M04', 'M06', 'B2', 'B3', 'B4'][Math.floor(Math.random() * 6)]
    const matchingTable = tables.find((t) => t.number === randomTableNum)

    const newLiveOrder: OrderWithItems = {
      id: newOrderId,
      table_id: matchingTable ? matchingTable.id : null,
      origin: Math.random() > 0.5 ? 'qr' : 'salon',
      customer_name: `Comensal QR - Mesa ${randomTableNum}`,
      customer_phone: null,
      estimated_time: null,
      notes: '🔥 Pedido en vivo ingresado por QR / Mozo',
      status: 'open',
      kds_status: 'pending',
      subtotal: 44100,
      discount_pct: 0,
      discount_amount: 0,
      payment_method: null,
      total: 44100,
      closed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      order_items: [
        {
          id: `live-item-1-${Date.now()}`,
          order_id: newOrderId,
          product_id: 'p1000000-0000-0000-0000-000000000002',
          quantity: 1,
          unit_price: 21000,
          notes: 'Jugoso',
          created_at: new Date().toISOString(),
          products: { name: 'Ojo de Bife', detail: '350g · corte premium', price: 21000 },
        },
        {
          id: `live-item-2-${Date.now()}`,
          order_id: newOrderId,
          product_id: 'p1000000-0000-0000-0000-000000000003',
          quantity: 1,
          unit_price: 16800,
          notes: 'A punto',
          created_at: new Date().toISOString(),
          products: { name: 'Entraña Fuego', detail: '300g · chimichurri', price: 16800 },
        },
        {
          id: `live-item-3-${Date.now()}`,
          order_id: newOrderId,
          product_id: 'p1000000-0000-0000-0000-000000000006',
          quantity: 2,
          unit_price: 3200,
          notes: null,
          created_at: new Date().toISOString(),
          products: { name: 'Empanadas de Carne', detail: 'unidad · al horno', price: 3200 },
        },
      ],
    }

    setOrders((curr) => {
      const updated = [newLiveOrder, ...curr]
      try {
        localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
      } catch {}
      return updated
    })

    if (matchingTable) {
      setTables((curr) => {
        const updated = curr.map((t) => (t.id === matchingTable.id ? { ...t, status: 'ocupada' as const } : t))
        try {
          localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
        } catch {}
        return updated
      })
    }

    broadcastAction({
      type: 'NEW_ORDER',
      payload: { order: newLiveOrder, tableNumber: randomTableNum },
    })

    playNotificationSound('order')
    showNotification(`🔔 ¡NUEVA COMANDA QR RECIBIDA EN COCINA KDS! (Mesa ${randomTableNum})`, 'success')
  }

  const loadMetrics = async () => {
    if (role === 'admin' || role === 'cashier') {
      const metrics = await getAdminMetricsAction()
      if (metrics.success) {
        setAdminMetrics(metrics)
      }
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  useEffect(() => {
    loadMetrics()
  }, [role, orders])

  // Realtime
  useEffect(() => {
    if (!supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) return

    const channel = supabase
      .channel('1847-parrilla-cerveceria-db')
      .on(
        'postgres_changes' as any,
        { event: '*', scheme: 'public', table: 'tables' },
        (payload: any) => {
          const updatedTable = payload.new as TableRow
          setTables((curr) =>
            curr.map((t) => (t.id === updatedTable.id ? { ...t, ...updatedTable } : t))
          )
          if (updatedTable.status === 'cuenta') {
            showNotification(`Mesa ${updatedTable.number} solicita la cuenta!`, 'success')
            playNotificationSound('bill')
          }
        }
      )
      .on(
        'postgres_changes' as any,
        { event: '*', scheme: 'public', table: 'orders' },
        async (payload: any) => {
          const res = await getInitialDashboardData()
          if (res.success) {
            setOrders(res.orders)
            setInventory(res.inventory)

            if (payload.eventType === 'INSERT') {
              const newOrder = payload.new as OrderRow
              showNotification(`Nueva comanda ingresada (${newOrder.origin.toUpperCase()})`, 'info')
              playNotificationSound('order')
            }
          }
        }
      )
      .on(
        'postgres_changes' as any,
        { event: '*', scheme: 'public', table: 'products' },
        (payload: any) => {
          const updatedProd = payload.new as ProductRow
          setProducts((curr) =>
            curr.map((p) => (p.id === updatedProd.id ? { ...p, ...updatedProd } : p))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // SINCRONIZACIÓN EN TIEMPO REAL MULTI-PESTAÑA (BroadcastChannel + LocalStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return

    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel('1847_parrilla_realtime_sync')
      bc.onmessage = (event) => {
        const { type, payload } = event.data || {}
        if (!type) return

        if (type === 'NEW_ORDER') {
          const { order, tableNumber } = payload || {}
          if (order) {
            setOrders((curr) => {
              const exists = curr.some((o) => o.id === order.id)
              const updated = exists ? curr.map((o) => (o.id === order.id ? order : o)) : [order, ...curr]
              try {
                localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
              } catch {}
              return updated
            })
            if (tableNumber) {
              setTables((curr) => {
                const updated = curr.map((t) => (t.number === tableNumber ? { ...t, status: 'ocupada' as const } : t))
                try {
                  localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
                } catch {}
                return updated
              })
            }
            const isParrilleroUser = activeUser?.legajo === 'PAR-001'
            const isCocineroUser = activeUser?.legajo === 'COC-001'
            const orderItems = order.order_items || []
            const hasParrilla = orderItems.some((it: any) => isParrillaProduct(it.products?.name))
            const hasCocina = orderItems.some((it: any) => !isParrillaProduct(it.products?.name))

            // Alertar sonoramente solo si la comanda requiere preparación en la estación del operador
            const shouldAlert =
              (!isParrilleroUser && !isCocineroUser) ||
              (isParrilleroUser && hasParrilla) ||
              (isCocineroUser && hasCocina)

            if (shouldAlert) {
              playNotificationSound('order')
              showNotification(
                `🔔 ¡Nueva comanda para ${isCocineroUser ? 'COCINA' : isParrilleroUser ? 'PARRILLA' : 'DESPACHO'}! (${order.origin === 'takeaway' ? 'Take Away' : `Mesa ${tableNumber || ''}`})`,
                'info'
              )
            }
          }
        } else if (type === 'UPDATE_ORDER_STATUS') {
          const { orderId, kds_status } = payload || {}
          if (orderId && kds_status) {
            setOrders((curr) => {
              const updated = curr.map((o) => (o.id === orderId ? { ...o, kds_status } : o))
              try {
                localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
              } catch {}
              return updated
            })
            if (kds_status === 'ready') {
              playNotificationSound('ready')
              showNotification('🛎️ ¡Comanda LISTA en el pase! Mozo alertado.', 'success')
            } else if (kds_status === 'delivered') {
              showNotification('✅ Comanda entregada en mesa.', 'info')
            }
          }
        } else if (type === 'REQUEST_BILL') {
          const { tableId, tableNumber, order } = payload || {}
          if (tableId) {
            setTables((curr) => {
              const updated = curr.map((t) => (t.id === tableId ? { ...t, status: 'cuenta' as const } : t))
              try {
                localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
              } catch {}
              return updated
            })
            if (order) {
              setOrders((curr) => {
                const exists = curr.some((o) => o.id === order.id)
                const updated = exists ? curr : [order, ...curr]
                try {
                  localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
                } catch {}
                return updated
              })
            }
            playNotificationSound('bill')
            showNotification(`🧾 Mesa ${tableNumber || ''} solicitó la cuenta.`, 'info')
          }
        } else if (type === 'ORDER_CLOSED') {
          const { orderId, tableId } = payload || {}
          if (orderId) {
            setOrders((curr) => {
              const updated = curr.map((o) => (o.id === orderId ? { ...o, status: 'closed' as const } : o))
              try {
                localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
              } catch {}
              return updated
            })
          }
          if (tableId) {
            setTables((curr) => {
              const updated = curr.map((t) => (t.id === tableId ? { ...t, status: 'libre' as const } : t))
              try {
                localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
              } catch {}
              return updated
            })
          }
        } else if (type === 'SHIFT_OPENED') {
          if (payload?.shift) {
            setActiveShift(payload.shift)
            try {
              localStorage.setItem('fuego_live_shift', JSON.stringify(payload.shift))
            } catch {}
          }
        } else if (type === 'SHIFT_CLOSED') {
          setActiveShift(null)
          try {
            localStorage.removeItem('fuego_live_shift')
          } catch {}
        } else if (type === 'SYNC_STATE') {
          if (payload?.orders) setOrders(payload.orders)
          if (payload?.tables) setTables(payload.tables)
        }
      }
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'fuego_live_orders' && e.newValue) {
        try {
          setOrders(JSON.parse(e.newValue))
        } catch {}
      }
      if (e.key === 'fuego_live_tables' && e.newValue) {
        try {
          setTables(JSON.parse(e.newValue))
        } catch {}
      }
      if (e.key === 'fuego_live_shift') {
        try {
          setActiveShift(e.newValue ? JSON.parse(e.newValue) : null)
        } catch {}
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      try {
        bc?.close()
      } catch {}
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const showNotification = (text: string, type: 'info' | 'success' | 'warn') => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 5000)
  }

  // Estados para Impresión de Cierre Z y Rendición por Día Puntual o Período (disponible tanto para Admin como para Cajero)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printReportType, setPrintReportType] = useState<'z_close' | 'cash_settlement'>('z_close')
  const [printRangeType, setPrintRangeType] = useState<'day' | 'range'>('day')
  const [printShiftFilter, setPrintShiftFilter] = useState<'all' | 'mediodia' | 'noche'>('all')
  const todayIsoDate = useMemo(() => new Date().toISOString().split('T')[0], [])
  const [printDateSingle, setPrintDateSingle] = useState<string>(todayIsoDate)
  const [printDateStart, setPrintDateStart] = useState<string>(todayIsoDate)
  const [printDateEnd, setPrintDateEnd] = useState<string>(todayIsoDate)
  const [periodMetrics, setPeriodMetrics] = useState<AdminMetrics | null>(null)
  const [isCalculatingPeriod, setIsCalculatingPeriod] = useState(false)

  const activeStartDate = printRangeType === 'day' ? printDateSingle : printDateStart
  const activeEndDate = printRangeType === 'day' ? printDateSingle : printDateEnd

  const calculateMetricsForRange = async (
    sDate: string,
    eDate: string,
    shiftFilter: 'all' | 'mediodia' | 'noche' = printShiftFilter
  ) => {
    setIsCalculatingPeriod(true)
    try {
      if (dbConnected && printRangeType !== 'day') {
        const res = await getAdminMetricsAction({ startDate: sDate, endDate: eDate })
        if (res.success) {
          setPeriodMetrics(res)
          setIsCalculatingPeriod(false)
          return
        }
      }
    } catch (err) {
      console.error('Error al consultar métricas del período:', err)
    }

    // Filtrado por fecha y turno (Mediodía / Noche / Consolidado)
    const [sYear, sMonth, sDay] = sDate.split('-').map(Number)
    const [eYear, eMonth, eDay] = eDate.split('-').map(Number)
    const sTime = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0).getTime()
    const eTime = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999).getTime()

    const pOrders = orders.filter((o) => {
      if (o.status !== 'closed') return false
      const dateObj = new Date(o.closed_at || o.created_at)
      const t = dateObj.getTime()
      if (t < sTime || t > eTime) return false

      if (printRangeType === 'day') {
        const hour = dateObj.getHours()
        const minutes = dateObj.getMinutes()
        const timeVal = hour + minutes / 60
        if (shiftFilter === 'mediodia') {
          return timeVal >= 10.0 && timeVal < 17.5
        } else if (shiftFilter === 'noche') {
          return timeVal >= 17.5 || timeVal < 5.0
        }
      }
      return true
    })

    const totalSales = pOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
    const salesByMethod = { efectivo: 0, debito: 0, credito: 0, qr: 0 }
    pOrders.forEach((o) => {
      const m = o.payment_method as keyof typeof salesByMethod
      if (m && m in salesByMethod) salesByMethod[m] += Number(o.total || 0)
    })

    let periodLabel = ''
    if (sDate === eDate) {
      const dateFormatted = `${sDay.toString().padStart(2, '0')}/${sMonth.toString().padStart(2, '0')}/${sYear}`
      if (shiftFilter === 'mediodia') {
        periodLabel = `Día: ${dateFormatted} [Turno Mediodía]`
      } else if (shiftFilter === 'noche') {
        periodLabel = `Día: ${dateFormatted} [Turno Noche]`
      } else {
        periodLabel = `Día: ${dateFormatted} [Consolidado Mediodía + Noche]`
      }
    } else {
      periodLabel = `Período: ${sDay.toString().padStart(2, '0')}/${sMonth.toString().padStart(2, '0')}/${sYear} al ${eDay.toString().padStart(2, '0')}/${eMonth.toString().padStart(2, '0')}/${eYear}`
    }

    setPeriodMetrics({
      success: true,
      totalSalesToday: totalSales,
      totalSalesMonth: totalSales,
      averageTicketToday: pOrders.length > 0 ? totalSales / pOrders.length : 0,
      ordersCountToday: pOrders.length,
      periodLabel,
      salesByMethod,
      fiscal: {
        netAmount: totalSales / 1.21,
        vatAmount: totalSales - totalSales / 1.21,
        totalInvoiced: totalSales,
        invoicesCount: pOrders.length,
      },
      operational: {
        totalNonInvoiced: 0,
        nonInvoicedCount: 0,
      },
    })
    setIsCalculatingPeriod(false)
  }

  useEffect(() => {
    if (printModalOpen) {
      calculateMetricsForRange(activeStartDate, activeEndDate, printShiftFilter)
    }
  }, [printModalOpen, activeStartDate, activeEndDate, printShiftFilter, printRangeType])

  const handleOpenPrintModal = (type: 'z_close' | 'cash_settlement') => {
    setPrintReportType(type)
    setPrintModalOpen(true)
  }

  const handleExecutePrintCustomPeriod = () => {
    const dataToPrint = periodMetrics || adminMetrics || {
      totalSalesToday: orders.filter((o) => o.status === 'closed').reduce((sum, o) => sum + Number(o.total || 0), 0),
      totalSalesMonth: 0,
      averageTicketToday: 0,
      ordersCountToday: orders.filter((o) => o.status === 'closed').length,
      salesByMethod: { efectivo: 0, debito: 0, credito: 0, qr: 0 },
      fiscal: {
        netAmount: 0,
        vatAmount: 0,
        totalInvoiced: 0,
        invoicesCount: 0,
      },
      operational: {
        totalNonInvoiced: 0,
        nonInvoicedCount: 0,
      },
    }

    const activeLabel =
      dataToPrint.periodLabel ||
      (activeStartDate === activeEndDate
        ? `Día: ${activeStartDate.split('-').reverse().join('/')}`
        : `Período: ${activeStartDate.split('-').reverse().join('/')} al ${activeEndDate.split('-').reverse().join('/')}`)

    if (printReportType === 'z_close') {
      const fData = dataToPrint.fiscal || {
        netAmount: dataToPrint.totalSalesToday / 1.21,
        vatAmount: dataToPrint.totalSalesToday - dataToPrint.totalSalesToday / 1.21,
        totalInvoiced: dataToPrint.totalSalesToday,
        invoicesCount: dataToPrint.ordersCountToday,
      }

      handlePrint('z_close', {
        periodLabel: activeLabel,
        ordersCount: fData.invoicesCount || dataToPrint.ordersCountToday,
        fiscalInvoicesCount: fData.invoicesCount || dataToPrint.ordersCountToday,
        totalSalesToday: fData.totalInvoiced,
        netFiscalToday: fData.netAmount,
        vatFiscalToday: fData.vatAmount,
        operatorName: activeUser ? formatAuditUserLabel(activeUser) : 'Operador',
      })
    } else {
      const initCash = Number(activeShift?.initial_cash || 0)
      const expCash = initCash + (dataToPrint.salesByMethod?.efectivo || 0)

      handlePrint('cash_settlement', {
        periodLabel: activeLabel,
        ordersCount: dataToPrint.ordersCountToday,
        totalSalesToday: dataToPrint.totalSalesToday,
        salesByMethod: dataToPrint.salesByMethod,
        initialCash: initCash,
        expectedCash: expCash,
        realCash: expCash,
        cashDifference: 0,
        operatorName: activeUser ? formatAuditUserLabel(activeUser) : 'Operador',
      })
    }

    setPrintModalOpen(false)
    showNotification(`Ticket emitido para ${activeLabel}.`, 'success')
  }

  function Brand() {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex size-9 sm:size-11 items-center justify-center rounded-xl bg-amber-500/10 p-1 border border-amber-500/30 shadow-sm overflow-hidden flex-shrink-0">
          <img src="/logo.png" alt="1847 - parrilla & cerveceria" className="h-full w-full object-contain" />
        </div>
        <div>
          <p className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.25em] text-primary leading-none">POS + KDS</p>
          <h1 className="text-sm sm:text-base lg:text-lg font-black tracking-tight whitespace-nowrap mt-0.5">
            1847 <span className="text-primary">-</span> parrilla & cerveceria
          </h1>
        </div>
      </div>
    )
  }

  function Header() {
    return (
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur print:hidden">
        <div className="flex min-h-14 sm:min-h-16 items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 lg:px-8 py-2 sm:py-3">
          <Brand />
          
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`size-2 rounded-full ${
                dbConnected
                  ? 'bg-emerald-400 shadow-[0_0_10px_theme(colors.emerald.400)]'
                  : 'bg-amber-400 shadow-[0_0_10px_theme(colors.amber.400)]'
              }`}
            />
            {dbConnected ? 'Base de Datos Activa' : 'Modo Demo (Fallback Local)'}
            <span className="ml-3 font-mono text-foreground">12:54:10</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* BADGE DE USUARIO AUTENTICADO */}
            {activeUser && (
              <div
                className="flex items-center gap-2 sm:gap-2.5 rounded-xl border border-border/80 bg-card p-1 sm:px-3 sm:py-1.5 text-xs shadow-sm"
                title={`Sesión iniciada como ${activeUser.name} (${activeUser.legajo})`}
              >
                <div
                  className={`size-7 rounded-lg ${activeUser.avatarColor || 'bg-primary text-primary-foreground'} flex items-center justify-center font-black text-[11px] shadow-sm flex-shrink-0`}
                >
                  {activeUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-left font-sans hidden sm:block">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground leading-none">
                      {activeUser.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-secondary text-muted-foreground border border-border/60">
                      {activeUser.legajo}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-primary font-bold">
                      {activeUser.title || activeUser.role}
                    </span>
                    {activeUser.specialty && (
                      <span className="text-[9px] text-muted-foreground font-medium hidden md:inline">
                        · {activeUser.specialty}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ALERTA / BADGE CABECERA: COMANDAS LISTAS PARA RETIRAR */}
            {readyOrders.length > 0 && (
              <button
                onClick={() => setRole('salon')}
                className="flex items-center gap-1 sm:gap-1.5 rounded-xl border border-emerald-500/60 bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-400 px-2 sm:px-3 py-1.5 text-xs font-black shadow-[0_0_15px_rgba(16,185,129,0.35)] animate-pulse transition-all active:scale-95"
                title="Hacé clic para ver las comandas listas en el pase de cocina y llevarlas a las mesas"
              >
                <Bell className="size-3.5 text-emerald-400 animate-bounce flex-shrink-0" />
                <span>{readyOrders.length}</span>
                <span className="hidden min-[480px]:inline font-bold">
                  {readyOrders.length === 1 ? 'Listo en pase' : 'Listos en pase'}
                </span>
              </button>
            )}

            {/* BOTÓN CERRAR SESIÓN */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive p-2 sm:px-2.5 sm:py-1.5 text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Cerrar sesión actual para entrar con otro usuario"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>

            {/* TABS DE VISTA SEGÚN PERMISOS DEL ROL LOGUEADO (RBAC) */}
            <div className="hidden rounded-lg border border-border bg-card p-1 lg:flex">
              {roles
                .filter((item) => activeUser?.allowedViews?.includes(item.id))
                .map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => setRole(item.id)}
                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                        role === item.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {item.label}
                    </button>
                  )
                })}
            </div>
            <button
              onClick={() => {
                playNotificationSound('order')
                showNotification('🔊 Audio de notificaciones activo y funcionando.', 'success')
              }}
              title="Probar y activar sonido de alertas"
              className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Volume2 className="size-4" />
            </button>
          </div>
        </div>

        {/* NAVEGACIÓN MOBILE CON PERMISOS FILTRADOS */}
        <div className="flex gap-1 overflow-x-auto border-t border-border/50 px-4 py-2 lg:hidden">
          {roles
            .filter((item) => activeUser?.allowedViews?.includes(item.id))
            .map((item) => (
              <button
                key={item.id}
                onClick={() => setRole(item.id)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold ${
                  role === item.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
        </div>
      </header>
    )
  }

  // STATS EN TIEMPO REAL
  const activeTablesCount = tables.filter((t) => t.status !== 'libre').length
  const totalSalesVal = useMemo(() => {
    return orders
      .filter((o) => o.status === 'closed')
      .reduce((sum, o) => sum + Number(o.total), 0)
  }, [orders])

  const pendingKitchenCount = orders.filter((o) => o.status === 'open' && o.kds_status !== 'delivered').length
  const avgTicket = activeTablesCount > 0 ? totalSalesVal / activeTablesCount : 0

  function StatStrip() {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat">
          <span>Mesas activas</span>
          <strong>
            {activeTablesCount} <small>/ {tables.length || 12}</small>
          </strong>
          <em>{Math.round((activeTablesCount / (tables.length || 12)) * 100)}% ocupación</em>
        </div>
        <div className="stat">
          <span>Ventas del día</span>
          <strong>{formatMoney(totalSalesVal || 482700)}</strong>
          <em className="positive">Persistido / Memoria local</em>
        </div>
        <div className={`stat transition-all ${readyOrders.length > 0 ? 'border-emerald-500/60 bg-emerald-950/30 ring-1 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]' : ''}`}>
          <div className="flex items-center justify-between">
            <span>{readyOrders.length > 0 ? 'Listos para servir' : 'Pedidos KDS'}</span>
            {readyOrders.length > 0 && (
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
          <strong className={readyOrders.length > 0 ? 'text-emerald-400 flex items-center gap-1.5' : ''}>
            {readyOrders.length > 0 && <Bell className="size-4 animate-bounce text-emerald-400" />}
            {readyOrders.length > 0 ? `${readyOrders.length} en pase` : pendingKitchenCount}
          </strong>
          <em className={readyOrders.length > 0 ? 'text-emerald-300 font-bold' : 'warning'}>
            {readyOrders.length > 0 ? '🔔 ¡Esperando retiro mozo!' : 'En preparación y cola'}
          </em>
        </div>
        <div className="stat">
          <span>Ticket promedio</span>
          <strong>{formatMoney(avgTicket || 31420)}</strong>
          <em>Mesas activas</em>
        </div>
      </div>
    )
  }

  // ==========================================
  // VISTA: SALÓN / MOZO
  // ==========================================
  function SalonView() {
    const [filter, setFilter] = useState<'Todas' | 'libre' | 'ocupada' | 'cuenta'>('Todas')

    const filteredTables = tables.filter((t) => filter === 'Todas' || t.status === filter)

    const getTableOrderData = (tableId: string) => {
      const activeOrder = orders.find((o) => o.table_id === tableId && o.status === 'open')
      return activeOrder
        ? { name: activeOrder.customer_name || 'Comensal', total: formatMoney(Number(activeOrder.total)) }
        : { name: 'Disponible', total: '' }
    }

    const handleRequestBill = async (tableId: string) => {
      const table = tables.find((t) => t.id === tableId)
      const tableNumber = table?.number || '01'

      // Verificar si existe una orden abierta para esta mesa
      let existingOrder = orders.find((o) => o.table_id === tableId && o.status === 'open')
      let targetOrder = existingOrder

      if (!existingOrder) {
        // Si la mesa no tenía orden previa creada, generar la comanda para cobro/facturación
        const mockOrderId = `ord-${Date.now()}`
        const mockOrder: OrderWithItems = {
          id: mockOrderId,
          table_id: tableId,
          origin: 'salon',
          customer_name: `Comensal (Mesa ${tableNumber})`,
          customer_phone: null,
          estimated_time: null,
          notes: 'Mesa pidió la cuenta en salón',
          status: 'open',
          kds_status: 'delivered',
          subtotal: 44100,
          discount_pct: 0,
          discount_amount: 0,
          payment_method: null,
          total: 44100,
          closed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          order_items: [
            {
              id: `item-${Date.now()}-1`,
              order_id: mockOrderId,
              product_id: 'p1',
              quantity: 2,
              unit_price: 16500,
              notes: 'A punto',
              status: 'active' as const,
              cancelled_at: null,
              cancelled_by_user_id: null,
              cancelled_by_user_name: null,
              cancel_reason: null,
              created_at: new Date().toISOString(),
              products: { name: 'Ojo de Bife 400g', detail: 'Corte premium a las brasas', price: 16500 },
            },
            {
              id: `item-${Date.now()}-2`,
              order_id: mockOrderId,
              product_id: 'p2',
              quantity: 1,
              unit_price: 6600,
              notes: 'Papas rústicas',
              status: 'active' as const,
              cancelled_at: null,
              cancelled_by_user_id: null,
              cancelled_by_user_name: null,
              cancel_reason: null,
              created_at: new Date().toISOString(),
              products: { name: 'Papas Fritas Provenzal', detail: 'Porción grande', price: 6600 },
            },
            {
              id: `item-${Date.now()}-3`,
              order_id: mockOrderId,
              product_id: 'p3',
              quantity: 1,
              unit_price: 4500,
              notes: null,
              status: 'active' as const,
              cancelled_at: null,
              cancelled_by_user_id: null,
              cancelled_by_user_name: null,
              cancel_reason: null,
              created_at: new Date().toISOString(),
              products: { name: 'Cerveza IPA 500ml', detail: 'Tirada artesanal 1847', price: 4500 },
            },
          ],
        }

        targetOrder = mockOrder
        setOrders((curr) => {
          const updated = [mockOrder, ...curr]
          try {
            localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
          } catch {}
          return updated
        })
      }

      if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        await supabase.from('tables').update({ status: 'cuenta' }).eq('id', tableId)
      }
      setTables((curr) => {
        const updated = curr.map((t) => (t.id === tableId ? { ...t, status: 'cuenta' as const } : t))
        try {
          localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
        } catch {}
        return updated
      })

      broadcastAction({
        type: 'REQUEST_BILL',
        payload: { tableId, tableNumber, order: targetOrder },
      })

      showNotification(`Mesa ${tableNumber} solicitó la cuenta. Lista en Caja.`, 'info')
    }

    const isBarra = (num: string) => num.startsWith('B')
    const isOchava = (num: string) => ['M05', 'M06', '05', '06'].includes(num)

    const salonCentralTables = filteredTables.filter((t) => !isBarra(t.number) && !isOchava(t.number))
    const ochavaTables = filteredTables.filter((t) => isOchava(t.number))
    const barraTables = filteredTables.filter((t) => isBarra(t.number))

    const renderTableCard = (t: TableRow) => {
      const activeOrder = orders.find(
        (o) =>
          o.status === 'open' &&
          (o.table_id === t.id ||
            o.table_id === t.number ||
            (o.customer_name && o.customer_name.toLowerCase().includes(t.number.toLowerCase())))
      )

      let ordName = 'Mesa disponible'
      let ordTotal = ''

      if (activeOrder) {
        ordName = activeOrder.customer_name || 'Comensal en mesa'
        ordTotal = formatMoney(Number(activeOrder.total || 0))
      } else if (t.status === 'ocupada') {
        ordName = 'Mesa ocupada'
      } else if (t.status === 'cuenta') {
        ordName = 'Cuenta pedida en salón'
      } else {
        ordName = 'Mesa disponible'
      }

      const ordData = { name: ordName, total: ordTotal }
      const isStool = isBarra(t.number)

      const isOrderReady = activeOrder?.kds_status === 'ready'
      const isOrderPreparing = activeOrder?.kds_status === 'preparing'
      const isOrderPending = activeOrder?.kds_status === 'pending'
      const isOrderDelivered = activeOrder?.kds_status === 'delivered'

      return (
        <div
          key={t.id}
          onClick={() => {
            if (t.status === 'libre') {
              if (!activeShift) {
                showNotification('⚠️ Debe abrir el turno de caja antes de iniciar comandas.', 'warn')
                return
              }
              setSelectedTableNumber(t.number)
              setOrderOpen(true)
            }
          }}
          title={t.status === 'libre' ? `Clic para abrir comanda en ${t.number}` : undefined}
          className={`table-card text-left transition-all ${
            t.status === 'libre' ? 'cursor-pointer hover:border-primary hover:shadow-md' : ''
          } ${
            isOrderReady
              ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500/80 animate-pulse'
              : isStool
              ? 'border-orange-500/40 bg-zinc-900/60 shadow-[0_0_12px_rgba(249,115,22,0.1)]'
              : t.status === 'cuenta'
              ? 'billing border-primary'
              : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <span className="table-number">{t.number}</span>
              {isStool && (
                <span className="text-[9px] font-black uppercase text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                  BANQUETA
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isOrderReady && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/25 border border-emerald-500/60 px-2 py-0.5 text-[9px] font-black text-emerald-300 shadow-sm animate-bounce">
                  <Bell className="size-2.5 text-emerald-400" /> ¡LISTO!
                </span>
              )}
              <span
                className={`status ${
                  t.status === 'libre' ? 'free' : t.status === 'ocupada' ? 'busy' : 'alert'
                }`}
              >
                {t.status === 'libre' ? 'Libre' : t.status === 'ocupada' ? 'Ocupada' : 'Pide Cuenta'}
              </span>
            </div>
          </div>

          {isStool && (
            <div className="mt-2.5 text-[10px] font-extrabold text-orange-300 bg-orange-500/15 px-2 py-0.5 rounded border border-orange-500/30 w-fit flex items-center gap-1">
              ⚡ Pago previo / Take Away
            </div>
          )}

          {/* ALERTA DE PLATOS LISTOS EN EL PASE DE COCINA / PARRILLA */}
          {isOrderReady && activeOrder && (
            <div className="mt-2 sm:mt-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/60 p-2 sm:p-2.5 text-emerald-300 shadow-sm ring-1 ring-emerald-500/30">
              <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1.5 pb-1.5 border-b border-emerald-500/30">
                <span className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1.5 text-emerald-300">
                  <Bell className="size-3 text-emerald-400 animate-bounce flex-shrink-0" />
                  ¡Platos en pase!
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deliverOrder(activeOrder.id)
                  }}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-black px-2.5 py-1.5 min-[380px]:py-0.5 transition-all shadow flex items-center justify-center gap-1 cursor-pointer w-full min-[380px]:w-auto"
                  title="Confirmar entrega de platos en mesa"
                >
                  <Check className="size-3" /> Servir
                </button>
              </div>
              <p className="mt-1 text-[10px] text-emerald-200/90 truncate font-semibold">
                {activeOrder.order_items?.map((it) => `${it.quantity}x ${it.products?.name || 'Ítem'}`).join(', ')}
              </p>
            </div>
          )}

          {/* ESTADO EN PREPARACIÓN */}
          {isOrderPreparing && !isOrderReady && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
              <Clock className="size-3 animate-spin text-amber-400 flex-shrink-0" />
              <span className="truncate">En cocina/parrilla...</span>
            </div>
          )}

          {/* ESTADO EN COLA */}
          {isOrderPending && !isOrderReady && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-1 rounded">
              <Flame className="size-3 text-sky-400 flex-shrink-0" />
              <span className="truncate">Comanda en cola</span>
            </div>
          )}

          {/* ESTADO SERVIDO */}
          {isOrderDelivered && t.status === 'ocupada' && (
            <div className="mt-2 flex items-center gap-1 text-[9px] font-medium text-emerald-400/80 bg-emerald-500/5 px-1.5 py-0.5 rounded w-fit">
              <CheckCircle className="size-3 text-emerald-500 flex-shrink-0" />
              <span>Platos servidos</span>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1">
            <p className={`text-xs font-semibold truncate ${
              activeOrder
                ? 'text-foreground font-bold'
                : t.status === 'ocupada'
                ? 'text-amber-300 font-bold'
                : t.status === 'cuenta'
                ? 'text-orange-400 font-extrabold'
                : 'text-muted-foreground'
            }`}>
              {ordData.name}
            </p>
            {t.status === 'ocupada' && !isStool && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRequestBill(t.id)
                }}
                className="mt-1.5 w-fit rounded bg-orange-600/10 border border-orange-500/20 text-orange-500 text-[10px] font-bold px-2 py-1 hover:bg-orange-600 hover:text-white transition-all active:scale-95"
              >
                Pedir cuenta
              </button>
            )}
          </div>

          <div className="mt-3.5 flex items-end justify-between border-t border-border/40 pt-2">
            <span className="text-[10px] text-muted-foreground">
              {isStool ? '1 pax (Al paso)' : `${t.capacity} pax`}
            </span>
            <strong className="font-mono text-sm text-primary">{ordData.total}</strong>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="mb-4 sm:mb-6 flex flex-wrap items-end justify-between gap-3 sm:gap-4">
          <div>
            <p className="eyebrow text-[10px] sm:text-xs">Operación física del local (7.30m × 4.70m)</p>
            <h2 className="page-title text-xl sm:text-2xl lg:text-3xl">Mapa de Sectores & Mesas</h2>
            <p className="subtle text-xs sm:text-sm">Salón Central · Ingreso Ochava · Barra & Espera Take Away</p>
          </div>
          <Button
            onClick={() => {
              if (!activeShift) {
                showNotification('⚠️ Debe abrir el turno de caja antes de iniciar comandas.', 'warn')
                return
              }
              setSelectedTableNumber(undefined)
              setOrderOpen(true)
            }}
            className="gap-2 bg-orange-600 hover:bg-orange-700 text-white min-h-[40px] text-xs sm:text-sm font-bold shadow-md active:scale-95"
          >
            <Plus className="size-4" /> Nueva orden
          </Button>
        </div>

        <StatStrip />

        {/* BANNER DE PASE DE COCINA: COMANDAS LISTAS PARA RETIRAR Y LLEVAR A MESAS */}
        {readyOrders.length > 0 && (
          <div className="mt-4 sm:mt-6 rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/30 p-3 sm:p-4 shadow-[0_0_25px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-emerald-500/30">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="relative flex size-9 sm:size-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex-shrink-0">
                  <Bell className="size-4 sm:size-5 animate-bounce" />
                  <span className="absolute -top-1 -right-1 size-2 sm:size-2.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-emerald-400 uppercase tracking-wide">
                      ¡Pase de Cocina Listo! ({readyOrders.length} {readyOrders.length === 1 ? 'comanda' : 'comandas'})
                    </h3>
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase text-emerald-300 animate-pulse">
                      Atención Mozos
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-emerald-200/80 leading-snug">
                    Retirar del mostrador de despacho y servir de inmediato en las mesas asignadas:
                  </p>
                </div>
              </div>
              <button
                onClick={() => playNotificationSound('ready')}
                title="Probar sonido de campana de pase"
                className="self-end sm:self-auto flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-800/50 transition-colors active:scale-95"
              >
                <Volume2 className="size-3.5" /> Probar Aviso
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {readyOrders.map((order) => {
                const table = tables.find((t) => t.id === order.table_id)
                const tableLabel = table ? `Mesa ${table.number}` : order.origin === 'takeaway' ? 'Take Away (Barra)' : 'QR Fast Order'
                return (
                  <div
                    key={order.id}
                    className="flex flex-col justify-between rounded-xl border border-emerald-500/40 bg-card/95 p-3 sm:p-3.5 shadow-sm hover:border-emerald-400 transition-all ring-1 ring-emerald-500/20"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-border/50">
                        <span className="text-xs sm:text-sm font-black text-foreground flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          {tableLabel}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 truncate max-w-[130px]">
                          {order.customer_name || 'Comensal'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                        {order.order_items?.map((it) => (
                          <div key={it.id} className="text-xs flex items-start justify-between gap-2">
                            <span className="font-semibold text-foreground/95">
                              <span className="text-emerald-400 font-bold">{it.quantity}x</span> {it.products?.name || 'Ítem'}
                            </span>
                            {it.notes && (
                              <span className="text-[10px] text-amber-400 italic bg-amber-500/10 px-1 rounded flex-shrink-0">
                                {it.notes}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => deliverOrder(order.id)}
                      className="mt-3 w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white text-xs font-bold py-2.5 sm:py-2 flex items-center justify-center gap-2 transition-all shadow-md min-h-[40px]"
                    >
                      <Check className="size-4" /> Marcar Servido en Mesa
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div>
            <h3 className="section-title text-sm sm:text-base">
              Distribución del local <span>{tables.length} puestos</span>
            </h3>
          </div>
          <div className="flex gap-1 overflow-x-auto max-w-full rounded-lg border border-border bg-card p-1">
            {(['Todas', 'libre', 'ocupada', 'cuenta'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-md px-2.5 sm:px-3 py-1 text-xs font-semibold ${
                  filter === f ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 sm:mt-6 space-y-6 sm:space-y-8">
          {/* SECTOR 1: SALÓN CENTRAL */}
          {salonCentralTables.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Salón Central <span className="text-muted-foreground font-normal">({salonCentralTables.length} Mesas · M01 a M04)</span>
                  </h4>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">Comedor Principal</span>
              </div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                {salonCentralTables.map(renderTableCard)}
              </div>
            </div>
          )}

          {/* SECTOR 2: INGRESO / OCHAVA */}
          {ochavaTables.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Ingreso / Ochava <span className="text-muted-foreground font-normal">({ochavaTables.length} Mesas · Ventanales M05, M06)</span>
                  </h4>
                </div>
                <span className="text-[10px] text-amber-400 font-mono">Zona Ventanal & Recepción</span>
              </div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                {ochavaTables.map(renderTableCard)}
              </div>
            </div>
          )}

          {/* SECTOR 3: BARRA & ESPERA TAKE AWAY */}
          {barraTables.length > 0 && (
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between border-b border-orange-500/30 pb-2 bg-orange-950/20 p-2.5 sm:p-3 rounded-xl border">
                <div className="flex items-center gap-2">
                  <Flame className="size-4 text-orange-500 animate-pulse flex-shrink-0" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
                    Barra & Espera Take Away <span className="text-orange-300/80 font-normal">({barraTables.length} Banquetas · B1 a B4)</span>
                  </h4>
                </div>
                <span className="text-[9px] sm:text-[10px] bg-orange-500/20 text-orange-300 font-black px-2 py-0.5 rounded border border-orange-500/30 whitespace-nowrap">
                  ⚡ PAGO ADELANTADO
                </span>
              </div>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                {barraTables.map(renderTableCard)}
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  // ==========================================
  // DIÁLOGO: NUEVA COMANDA (SALÓN / TAKEAWAY)
  // ==========================================
  function OrderDialogComponent({ close }: { close: () => void }) {
    const freeTables = tables.filter((t) => t.status === 'libre')
    const occupiedTables = tables.filter((t) => t.status !== 'libre')

    const [activeCategory, setActiveCategory] = useState(categories[0]?.id || '')
    const [cart, setCart] = useState<{ product: ProductRow; qty: number; notes: string }[]>([])
    const [custName, setCustName] = useState('')
    const [tableNum, setTableNum] = useState(
      selectedTableNumber || freeTables[0]?.number || tables[0]?.number || 'M01'
    )
    const [originType, setOriginType] = useState<'salon' | 'takeaway'>('salon')
    const [sending, setSending] = useState(false)
    const [err, setErr] = useState('')
    const [autoPrintStationComandas, setAutoPrintStationComandas] = useState(true)

    const filteredMenu = products.filter((p) => p.category_id === activeCategory)

    const addToCart = (p: ProductRow) => {
      if (!p.is_active) return
      setCart((curr) => {
        const exist = curr.find((x) => x.product.id === p.id)
        if (exist) {
          return curr.map((x) => (x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x))
        } else {
          return [...curr, { product: p, qty: 1, notes: '' }]
        }
      })
    }

    const updateNotes = (prodId: string, notes: string) => {
      setCart((curr) => curr.map((x) => (x.product.id === prodId ? { ...x, notes } : x)))
    }

    const sub = cart.reduce((s, x) => s + x.product.price * x.qty, 0)

    const handleSendOrder = async (printOverride?: boolean) => {
      if (cart.length === 0) return
      if (originType === 'salon' && !tableNum) {
        setErr('Debe seleccionar el número de mesa para pedidos de salón.')
        return
      }

      setSending(true)
      setErr('')

      const targetTable = tables.find(
        (t) =>
          t.number.toUpperCase() === tableNum.toUpperCase() ||
          t.number.replace(/\D/g, '') === tableNum.replace(/\D/g, '') ||
          t.id === tableNum
      )
      const finalTableNum = targetTable ? targetTable.number : tableNum

      const itemsInput = cart.map((c) => ({
        productId: c.product.id,
        quantity: c.qty,
        notes: c.notes,
      }))

      const printableItems = cart.map((c) => ({
        quantity: c.qty,
        name: c.product.name,
        notes: c.notes || null,
        unitPrice: c.product.price,
      }))

      const shouldPrint = typeof printOverride === 'boolean' ? printOverride : autoPrintStationComandas

      const res = await openOrderAction(
        {
          tableNumber: originType === 'salon' ? finalTableNum : undefined,
          origin: originType,
          customerName: custName || (originType === 'salon' ? `Mesa ${finalTableNum}` : 'Mostrador'),
          items: itemsInput,
        },
        activeUser!
      )

      if (res.success) {
        showNotification('Orden enviada correctamente a cocina.', 'success')
        if (shouldPrint) {
          handlePrintKitchenStations({
            id: res.order?.id,
            tableNumber: originType === 'salon' ? finalTableNum : undefined,
            origin: originType,
            customerName: custName || (originType === 'salon' ? `Mesa ${finalTableNum}` : 'Mostrador'),
            createdAt: new Date().toISOString(),
            items: printableItems,
          })
        }
        await loadDashboardData()
        broadcastAction({
          type: 'SYNC_STATE',
          payload: {},
        })
        close()
      } else {
        const mockOrderId = `ord-${Date.now()}`
        const mockOrder: OrderWithItems = {
          id: mockOrderId,
          table_id: targetTable ? targetTable.id : null,
          origin: originType,
          customer_name: custName || (originType === 'salon' ? `Mesa ${finalTableNum}` : 'Mostrador'),
          customer_phone: null,
          estimated_time: null,
          notes: null,
          status: 'open',
          kds_status: 'pending',
          subtotal: sub,
          discount_pct: 0,
          discount_amount: 0,
          payment_method: null,
          total: sub,
          closed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          order_items: cart.map((c) => ({
            id: `item-${Date.now()}-${c.product.id}`,
            order_id: mockOrderId,
            product_id: c.product.id,
            quantity: c.qty,
            unit_price: c.product.price,
            notes: c.notes || null,
            status: 'active' as const,
            cancelled_at: null,
            cancelled_by_user_id: null,
            cancelled_by_user_name: null,
            cancel_reason: null,
            created_at: new Date().toISOString(),
            products: { name: c.product.name, detail: c.product.detail, price: c.product.price },
          })),
        }

        setOrders((curr) => {
          const updated = [mockOrder, ...curr]
          try {
            localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
          } catch {}
          return updated
        })
        if (originType === 'salon' && targetTable) {
          setTables((curr) => {
            const updated = curr.map((t) => (t.id === targetTable.id ? { ...t, status: 'ocupada' as const } : t))
            try {
              localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
            } catch {}
            return updated
          })
        }

        broadcastAction({
          type: 'NEW_ORDER',
          payload: { order: mockOrder, tableNumber: originType === 'salon' ? finalTableNum : undefined },
        })

        if (shouldPrint) {
          handlePrintKitchenStations({
            id: mockOrderId,
            tableNumber: originType === 'salon' ? finalTableNum : undefined,
            origin: originType,
            customerName: custName || (originType === 'salon' ? `Mesa ${finalTableNum}` : 'Mostrador'),
            createdAt: new Date().toISOString(),
            items: printableItems,
          })
        }

        showNotification('Orden enviada a cocina en tiempo real.', 'success')
        close()
      }
    }

    return (
      <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/60 sm:p-4 animate-in fade-in duration-250 print:hidden">
        <section className="flex h-[92vh] w-full flex-col border border-border bg-card shadow-2xl sm:max-w-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <p className="eyebrow">Terminal POS</p>
              <h2 className="text-xl font-bold">Nueva comanda</h2>
            </div>
            <button onClick={close} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
              <X />
            </button>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
            <div className="flex-1 overflow-y-auto p-5 border-b border-border md:border-b-0 md:border-r">
              <div className="mb-4 flex gap-1 overflow-x-auto">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCategory(c.id)}
                    className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold ${
                      activeCategory === c.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {err && <p className="mb-3 text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded p-2">{err}</p>}

              <div className="grid gap-2">
                {filteredMenu.map((item) => (
                  <button
                    key={item.id}
                    disabled={!item.is_active}
                    onClick={() => addToCart(item)}
                    className={`menu-item text-left ${!item.is_active ? 'opacity-50 cursor-not-allowed bg-zinc-900/30' : ''}`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {!item.is_active && (
                          <span className="text-[9px] font-black text-red-400 bg-red-950/60 border border-red-800/40 px-1.5 py-0.5 rounded">
                            AGOTADO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <span className="font-mono font-bold text-primary">{formatMoney(Number(item.price))}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="flex w-full flex-col bg-background/40 p-5 md:w-80">
              <div className="space-y-4 mb-4 border-b border-border pb-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => setOriginType('salon')}
                    className={`flex-1 rounded py-1.5 text-center text-xs font-bold border ${
                      originType === 'salon' ? 'bg-primary text-white border-primary' : 'bg-transparent border-border text-muted-foreground'
                    }`}
                  >
                    Salón
                  </button>
                  <button
                    onClick={() => setOriginType('takeaway')}
                    className={`flex-1 rounded py-1.5 text-center text-xs font-bold border ${
                      originType === 'takeaway' ? 'bg-primary text-white border-primary' : 'bg-transparent border-border text-muted-foreground'
                    }`}
                  >
                    Take Away
                  </button>
                </div>

                {originType === 'salon' ? (
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Mesa asignada</span>
                    <div className="relative mt-1">
                      <select
                        value={tableNum}
                        onChange={(e) => setTableNum(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary pr-8 cursor-pointer"
                      >
                        {freeTables.length === 0 && (
                          <option value="">No hay mesas libres</option>
                        )}
                        <optgroup label="✨ Mesas Vacías / Libres">
                          {freeTables.map((t) => (
                            <option key={t.id} value={t.number}>
                              {t.number.startsWith('B')
                                ? `Banqueta ${t.number} (Libre · Barra)`
                                : `Mesa ${t.number} (Libre · ${t.capacity} pax)`}
                            </option>
                          ))}
                        </optgroup>
                        {occupiedTables.length > 0 && (
                          <optgroup label="⚠️ Mesas Ya Ocupadas (Sumar a comanda)">
                            {occupiedTables.map((t) => (
                              <option key={t.id} value={t.number}>
                                {t.number.startsWith('B')
                                  ? `Banqueta ${t.number} (Ocupada)`
                                  : `Mesa ${t.number} (Ocupada)`}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    </div>
                  </label>
                ) : null}

                <label className="block">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Nombre Cliente</span>
                  <input
                    placeholder="Ej: Sofía"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                <h3 className="text-xs font-bold uppercase text-muted-foreground">Ítems ({cart.length})</h3>
                {cart.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-10 text-center">Seleccione productos para comandar.</p>
                ) : (
                  cart.map((item) => {
                    const isBeef = item.product.category_id === 'c1000000-0000-0000-0000-000000000001'
                    return (
                      <div key={item.product.id} className="text-xs border-b border-border/50 pb-2">
                        <div className="flex justify-between font-medium">
                          <span>{item.qty}× {item.product.name}</span>
                          <span>{formatMoney(item.product.price * item.qty)}</span>
                        </div>
                        {isBeef && (
                          <div className="flex gap-1.5 mt-1">
                            {['Jugoso', 'A punto', 'Cocido'].map((pt) => (
                              <button
                                key={pt}
                                onClick={() => updateNotes(item.product.id, pt)}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold border transition-colors ${
                                  item.notes === pt
                                    ? 'bg-orange-600/20 text-orange-400 border-orange-500'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                                }`}
                              >
                                {pt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex justify-between text-sm font-semibold mb-2">
                  <span>Subtotal</span>
                  <span className="font-mono text-primary">{formatMoney(sub)}</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-secondary/50 mb-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={autoPrintStationComandas}
                      onChange={(e) => setAutoPrintStationComandas(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500 size-3.5"
                    />
                    <span>Imprimir comandas de estación (Parrillero / Cocinero)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    disabled={cart.length === 0 || sending}
                    onClick={() => handleSendOrder(true)}
                    className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Printer className="size-3.5" /> Enviar e Imprimir
                  </Button>
                  <Button
                    disabled={cart.length === 0 || sending}
                    onClick={() => handleSendOrder(false)}
                    variant="outline"
                    className="w-full border-border text-foreground font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    {sending ? 'Guardando...' : 'Solo Enviar'}
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    )
  }

  // ==========================================
  // VISTA: TAKE AWAY
  // ==========================================
  function TakeAwayView() {
    const [viewMode, setViewMode] = useState<'Nueva' | 'Espera'>('Nueva')
    const [custName, setCustName] = useState('')
    const [phone, setPhone] = useState('')
    const [time, setTime] = useState('13:30')
    const [notes, setNotes] = useState('')
    const [cart, setCart] = useState<{ product: ProductRow; qty: number }[]>([])

    const takeawayOrders = orders.filter((o) => o.origin === 'takeaway' && o.status === 'open')

    const handleConfirmTakeaway = async () => {
      if (cart.length === 0) return
      if (!activeShift) {
        showNotification('⚠️ Debe abrir el turno de caja antes de tomar pedidos de Take Away.', 'warn')
        return
      }
      if (!custName) {
        showNotification('Debe ingresar el nombre del cliente.', 'warn')
        return
      }

      const itemsInput = cart.map((c) => ({
        productId: c.product.id,
        quantity: c.qty,
      }))

      const printableItems = cart.map((c) => ({
        quantity: c.qty,
        name: c.product.name,
        notes: null,
        unitPrice: c.product.price,
      }))

      const res = await openOrderAction(
        {
          origin: 'takeaway',
          customerName: custName,
          customerPhone: phone,
          estimatedTime: time,
          notes: notes,
          items: itemsInput,
        },
        activeUser!
      )

      if (res.success) {
        showNotification('Comanda Take Away creada con éxito.', 'success')
        handlePrintKitchenStations({
          id: res.order?.id,
          origin: 'takeaway',
          customerName: custName,
          createdAt: new Date().toISOString(),
          items: printableItems,
        })
        setCustName('')
        setPhone('')
        setNotes('')
        setCart([])
        setViewMode('Espera')
        await loadDashboardData()
        broadcastAction({
          type: 'SYNC_STATE',
          payload: {},
        })
      } else {
        const mockOrderId = `ta-${Date.now()}`
        const mockOrder: OrderWithItems = {
          id: mockOrderId,
          table_id: null,
          origin: 'takeaway',
          customer_name: custName,
          customer_phone: phone || null,
          estimated_time: time || null,
          notes: notes || null,
          status: 'open',
          kds_status: 'pending',
          subtotal: cart.reduce((s, x) => s + x.product.price * x.qty, 0),
          discount_pct: 0,
          discount_amount: 0,
          payment_method: null,
          total: cart.reduce((s, x) => s + x.product.price * x.qty, 0),
          closed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          order_items: cart.map((c) => ({
            id: `item-ta-${Date.now()}-${c.product.id}`,
            order_id: mockOrderId,
            product_id: c.product.id,
            quantity: c.qty,
            unit_price: c.product.price,
            notes: null,
            status: 'active' as const,
            cancelled_at: null,
            cancelled_by_user_id: null,
            cancelled_by_user_name: null,
            cancel_reason: null,
            created_at: new Date().toISOString(),
            products: { name: c.product.name, detail: c.product.detail, price: c.product.price },
          })),
        }
        setOrders((curr) => {
          const updated = [mockOrder, ...curr]
          try {
            localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
          } catch {}
          return updated
        })

        broadcastAction({
          type: 'NEW_ORDER',
          payload: { order: mockOrder },
        })

        handlePrintKitchenStations({
          id: mockOrderId,
          origin: 'takeaway',
          customerName: custName,
          createdAt: new Date().toISOString(),
          items: printableItems,
        })

        showNotification('Pedido Take Away enviado a cocina en tiempo real.', 'success')
        setCart([])
        setViewMode('Espera')
      }
    }

    return (
      <>
        <div className="mb-6">
          <p className="eyebrow">Mostrador y despacho</p>
          <h2 className="page-title">Take Away</h2>
          <p className="subtle">Pedidos de retiro en local y empaque de cortes a la parrilla.</p>
        </div>

        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit mb-5">
          {['Nueva', 'Espera'].map((x) => (
            <button
              key={x}
              onClick={() => setViewMode(x as any)}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${
                viewMode === x ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {x === 'Nueva' ? 'Nueva orden' : `En espera (${takeawayOrders.length})`}
            </button>
          ))}
        </div>

        {viewMode === 'Nueva' ? (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="panel space-y-4">
              <h3 className="section-title">Datos del cliente</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-bold text-muted-foreground">
                  Nombre
                  <input
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                  />
                </label>
                <label className="block text-xs font-bold text-muted-foreground">
                  Teléfono
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="11 5555 5555"
                    className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                  />
                </label>
                <label className="block text-xs font-bold text-muted-foreground">
                  Hora estimada
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                  />
                </label>
                <label className="block text-xs font-bold text-muted-foreground">
                  Notas de empaque
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Chimichurri aparte, etc."
                    className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                  />
                </label>
              </div>

              <div className="border-t border-border/50 pt-4">
                <h4 className="text-xs font-bold text-muted-foreground mb-3">Agregar productos</h4>
                <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto">
                  {products.map((p) => {
                    const exist = cart.find((c) => c.product.id === p.id)
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between border border-border/60 bg-background/50 rounded-xl p-3 ${
                          !p.is_active ? 'opacity-50 bg-zinc-900/30' : ''
                        }`}
                      >
                        <div className="text-left">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-xs">{p.name}</p>
                            {!p.is_active && (
                              <span className="text-[8px] font-black text-red-400 bg-red-950/60 border border-red-800/40 px-1 py-0.2 rounded">
                                AGOTADO
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-primary">{formatMoney(Number(p.price))}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {exist ? (
                            <>
                              <button
                                onClick={() =>
                                  setCart((curr) =>
                                    curr
                                      .map((c) => (c.product.id === p.id ? { ...c, qty: c.qty - 1 } : c))
                                      .filter((c) => c.qty > 0)
                                  )
                                }
                                className="size-6 rounded border border-border flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="text-xs font-bold">{exist.qty}</span>
                              <button
                                onClick={() =>
                                  setCart((curr) =>
                                    curr.map((c) => (c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c))
                                  )
                                }
                                className="size-6 rounded border border-border flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </>
                          ) : (
                            <button
                              disabled={!p.is_active}
                              onClick={() => setCart((curr) => [...curr, { product: p, qty: 1 }])}
                              className={`text-xs font-bold px-2 py-1 rounded ${
                                p.is_active
                                  ? 'bg-primary text-white hover:bg-orange-600'
                                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                              }`}
                            >
                              Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="panel flex flex-col justify-between">
              <div>
                <h3 className="section-title">Resumen de orden</h3>
                <div className="mt-5 flex flex-col gap-3">
                  {cart.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-10 text-center">No hay productos agregados.</p>
                  ) : (
                    cart.map((item) => (
                      <div key={item.product.id} className="order-line text-sm">
                        <span>{item.qty}× {item.product.name}</span>
                        <b>{formatMoney(item.product.price * item.qty)}</b>
                      </div>
                    ))
                  )}
                  <div className="order-line total border-t border-border pt-3 mt-3">
                    <span>Total</span>
                    <b>{formatMoney(cart.reduce((s, x) => s + x.product.price * x.qty, 0))}</b>
                  </div>
                </div>
              </div>
              <Button
                disabled={cart.length === 0}
                onClick={handleConfirmTakeaway}
                className="mt-5 w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                Confirmar pedido mostrador
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {takeawayOrders.map((o) => (
              <div className="panel relative" key={o.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary">TA-{o.id.slice(0, 4).toUpperCase()}</span>
                    <p className="mt-2 text-sm font-bold text-foreground">{o.customer_name}</p>
                    {o.customer_phone && <p className="text-xs text-muted-foreground">{o.customer_phone}</p>}
                  </div>
                  <span className="status busy">{o.kds_status.toUpperCase()}</span>
                </div>
                <div className="my-3 border-t border-border/40 pt-2 text-xs text-muted-foreground">
                  <p className="font-medium">Hora de retiro: {o.estimated_time || 'No indicada'}</p>
                  <p className="mt-1">Detalle: {o.notes || 'Sin notas'}</p>
                </div>
                <div className="bg-secondary/40 rounded p-2.5 text-xs text-foreground space-y-1">
                  {o.order_items.map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span>{it.quantity}× {it.products?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  // ==========================================
  // VISTA: COCINA (KDS) - CON BOTÓN DE IMPRESIÓN
  // ==========================================
  function KitchenView() {
    const kitchenOrders = orders.filter((o) => o.status === 'open' && o.kds_status !== 'delivered')

    const getOriginLabel = (order: OrderWithItems) => {
      if (order.table_id) {
        const table = tables.find((t) => t.id === order.table_id)
        return `Mesa ${table?.number || '?'}`
      }
      return order.origin === 'takeaway' ? 'Take Away' : 'QR Fast Order'
    }

    // IMPRESIÓN DE TICKET TÉRMICO DE COCINA / PARRILLA
    const handlePrintKitchenTicket = (o: OrderWithItems) => {
      const tableNumber = tables.find((t) => t.id === o.table_id)?.number
      handlePrint('kitchen', {
        orderId: o.id,
        tableNumber: tableNumber,
        origin: o.origin,
        customerName: o.customer_name || 'Comensal',
        createdAt: o.created_at,
        items: o.order_items.map((it) => ({
          quantity: it.quantity,
          name: it.products?.name || 'Ítem',
          unitPrice: Number(it.unit_price),
          notes: it.notes,
        })),
      })
    }

    const isParrillero = activeUser?.legajo === 'PAR-001'
    const isCocinero = activeUser?.legajo === 'COC-001'
    const [stationFilter, setStationFilter] = useState<'all' | 'parrilla' | 'cocina'>(() => {
      if (isParrillero) return 'parrilla'
      if (isCocinero) return 'cocina'
      return 'all'
    })

    const effectiveStation = stationFilter

    const columns: { id: 'pending' | 'preparing' | 'ready'; label: string }[] = [
      { id: 'pending', label: 'Entrantes' },
      { id: 'preparing', label: 'En preparación' },
      { id: 'ready', label: 'Listo para despacho' },
    ]

    const filteredKitchenOrders = kitchenOrders.filter((o) => {
      if (effectiveStation === 'parrilla') {
        return o.order_items.some((it) => isParrillaProduct(it.products?.name))
      }
      if (effectiveStation === 'cocina') {
        return o.order_items.some((it) => !isParrillaProduct(it.products?.name))
      }
      return true
    })

    return (
      <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="eyebrow">Producción en tiempo real</p>
              {activeUser && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${activeUser.badgeBg}`}>
                  Operando: {activeUser.name} ({activeUser.legajo}) · {activeUser.specialty || activeUser.title}
                </span>
              )}
            </div>
            <h2 className="page-title">Cocina KDS</h2>
            <p className="subtle">Monitor de despachos de parrilla & cocina · Sincronizado en vivo</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* TABS DE FILTRO DE ESTACIÓN */}
            <div className="flex gap-1 rounded-xl border border-border bg-card p-1 text-xs">
              <button
                onClick={() => setStationFilter('all')}
                className={`rounded-lg px-3 py-1.5 font-bold transition-colors ${
                  effectiveStation === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas las Estaciones
              </button>
              <button
                onClick={() => setStationFilter('parrilla')}
                className={`rounded-lg px-3 py-1.5 font-bold flex items-center gap-1.5 transition-colors ${
                  effectiveStation === 'parrilla'
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Flame className="size-3.5" /> Parrilla & Carnes
              </button>
              <button
                onClick={() => setStationFilter('cocina')}
                className={`rounded-lg px-3 py-1.5 font-bold flex items-center gap-1.5 transition-colors ${
                  effectiveStation === 'cocina'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ChefHat className="size-3.5" /> Cocina & Minutas
              </button>
            </div>

            <div className="alert-banner">
              <span className="size-2 animate-pulse rounded-full bg-primary" /> {filteredKitchenOrders.length} tickets en cola
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {columns.map((col) => {
            const colOrders = filteredKitchenOrders.filter((o) => o.kds_status === col.id)
            return (
              <div key={col.id} className="flex flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="section-title">{col.label}</h3>
                  <span className="count-pill">{colOrders.length}</span>
                </div>

                <div className="flex-1 rounded-xl bg-zinc-900/30 border border-border/40 p-3 space-y-3 min-h-[400px]">
                  {colOrders.length === 0 ? (
                    <div className="text-center text-xs text-zinc-500 py-20">Sin comandas en esta etapa.</div>
                  ) : (
                    colOrders.map((o) => {
                      const elapsedMin = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000))
                      const isRed = elapsedMin >= 25
                      const isYellow = elapsedMin >= 15 && elapsedMin < 25

                      return (
                        <div
                          key={o.id}
                          className={`ticket relative transition-all ${
                            isRed
                              ? 'border-2 border-red-500/80 bg-red-950/20 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                              : isYellow
                              ? 'border border-amber-500/60 bg-amber-950/10'
                              : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-mono text-xs font-black text-primary">#{o.id.slice(0, 4).toUpperCase()}</span>
                              <h4 className="text-sm font-extrabold mt-1">{getOriginLabel(o)}</h4>
                              <p className="text-[10px] text-zinc-400 font-semibold">{o.customer_name}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`font-mono text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 ${
                                  isRed
                                    ? 'bg-red-950/90 text-red-400 border-red-500/80 font-black animate-pulse'
                                    : isYellow
                                    ? 'bg-amber-950/80 text-amber-400 border-amber-500/60 font-bold'
                                    : 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
                                }`}
                              >
                                <Clock3 className="size-3 inline" />
                                {elapsedMin < 1 ? 'Recién llegado' : `${elapsedMin} min`}
                                {isRed ? ' 🚨 URGENTE' : isYellow ? ' ⚠️ ATENCIÓN' : ''}
                              </span>
                              <button
                                onClick={() => handlePrintKitchenTicket(o)}
                                title="Imprimir ticket para la parrilla (80mm)"
                                className="flex items-center gap-1 bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-foreground text-[10px] font-bold px-2 py-1 rounded border border-border transition-colors"
                              >
                                <Printer className="size-3 text-primary" /> Ticket
                              </button>
                            </div>
                          </div>

                        <div className="my-3 border-y border-border py-2 text-xs space-y-2 text-foreground">
                          {/* Ítems asignados a esta estación */}
                          {o.order_items
                            .filter((it) => {
                              if (effectiveStation === 'parrilla') return isParrillaProduct(it.products?.name)
                              if (effectiveStation === 'cocina') return !isParrillaProduct(it.products?.name)
                              return true
                            })
                            .map((it) => {
                              const isMeat = isParrillaProduct(it.products?.name)
                              return (
                                <div key={it.id} className="flex items-start justify-between gap-1.5 bg-secondary/30 p-2 rounded-lg border border-border/40">
                                  <div>
                                    <span className="font-extrabold text-sm text-foreground">{it.quantity}× {it.products?.name}</span>
                                    {it.notes && <span className="ml-1.5 text-primary font-black uppercase text-[10px] bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">· {it.notes}</span>}
                                  </div>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono flex-shrink-0 ${
                                    isMeat ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                  }`}>
                                    {isMeat ? '🔥 FUEGO' : '🍳 COCINA'}
                                  </span>
                                </div>
                              )
                            })}

                          {/* Referencia cruzada de cortes a la parrilla para el cocinero */}
                          {effectiveStation === 'cocina' && o.order_items.some((it) => isParrillaProduct(it.products?.name)) && (
                            <div className="pt-2 border-t border-dashed border-border/60 text-[11px] text-muted-foreground space-y-1">
                              <span className="font-bold text-orange-400/90 text-[10px] uppercase tracking-wider block">🔥 En marcha en Parrilla:</span>
                              {o.order_items
                                .filter((it) => isParrillaProduct(it.products?.name))
                                .map((it) => (
                                  <div key={it.id} className="flex items-center justify-between text-zinc-400 pl-1 text-[11px]">
                                    <span>{it.quantity}× {it.products?.name}</span>
                                    {it.notes && <span className="text-[10px] italic text-zinc-500">({it.notes})</span>}
                                  </div>
                                ))}
                            </div>
                          )}

                          {/* Referencia cruzada de minutas para el parrillero */}
                          {effectiveStation === 'parrilla' && o.order_items.some((it) => !isParrillaProduct(it.products?.name)) && (
                            <div className="pt-2 border-t border-dashed border-border/60 text-[11px] text-muted-foreground space-y-1">
                              <span className="font-bold text-sky-400/90 text-[10px] uppercase tracking-wider block">🍳 En marcha en Cocina:</span>
                              {o.order_items
                                .filter((it) => !isParrillaProduct(it.products?.name))
                                .map((it) => (
                                  <div key={it.id} className="flex items-center justify-between text-zinc-400 pl-1 text-[11px]">
                                    <span>{it.quantity}× {it.products?.name}</span>
                                    {it.notes && <span className="text-[10px] italic text-zinc-500">({it.notes})</span>}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>

                        {o.notes && (
                          <p className="text-[10px] bg-primary/5 border border-primary/20 text-primary-foreground/80 rounded p-1.5 mb-3">
                            Nota: {o.notes}
                          </p>
                        )}

                        {col.id !== 'ready' ? (
                          <Button
                            onClick={() => advanceStatus(o.id, col.id)}
                            className="w-full bg-secondary hover:bg-primary text-foreground hover:text-white transition-all text-xs font-bold py-1.5"
                          >
                            {col.id === 'pending' ? 'Empezar preparación' : 'Marcar listo'}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => deliverOrder(o.id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-bold py-1.5"
                          >
                            Entregar / Despachar
                          </Button>
                        )}
                      </div>
                    )
                  })
                )}
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ==========================================
  // VISTA: CAJA / FACTURACIÓN & CIERRE Z
  // ==========================================
  function CashierView() {
    const [selectedOrderId, setSelectedOrderId] = useState<string>('')
    const [discount, setDiscount] = useState<number>(0)
    const [payMethod, setPayMethod] = useState<'efectivo' | 'debito' | 'credito' | 'qr'>('efectivo')
    const [invoiceType, setInvoiceType] = useState<'A' | 'B' | 'C'>('B')
    const [cuit, setCuit] = useState('')
    const [dni, setDni] = useState('')
    const [zModalOpen, setZModalOpen] = useState(false)

    const [invoiceProcessed, setInvoiceProcessed] = useState<{
      order: OrderRow
      invoice: InvoiceArcaRow
    } | null>(null)

    const pendingBills = orders.filter((o) => o.status === 'open')
    const activeOrder = orders.find((o) => o.id === selectedOrderId)

    // Impresión de Pre-cuenta con auditoría de usuario obligatoria
    const handlePrintPrebill = async (o: OrderWithItems) => {
      if (dbConnected) {
        const res = await emitirPrecuentaAction(
          { orderId: o.id, discountPct: discount },
          activeUser!
        )
        if (res.success && res.prebill) {
          handlePrint('prebill', {
            orderId: o.id,
            tableNumber: res.prebill.tableNumber,
            origin: o.origin,
            customerName: res.prebill.customerName,
            createdAt: new Date().toISOString(),
            items: res.prebill.items,
            subtotal: res.prebill.subtotal,
            discountPct: res.prebill.discountPct,
            discountAmount: res.prebill.discountAmount,
            total: res.prebill.total,
            operatorName: res.prebill.userLabel,
          })
          showNotification(`Pre-cuenta registrada y emitida por ${activeUser?.name || 'Operador'}.`, 'success')
          await loadDashboardData()
          return
        }
      }

      const tableNumber = tables.find((t) => t.id === o.table_id)?.number
      const sub = Number(o.subtotal)
      const discAmt = sub * (discount / 100)
      const tot = sub - discAmt

      handlePrint('prebill', {
        orderId: o.id,
        tableNumber: tableNumber,
        origin: o.origin,
        customerName: o.customer_name || 'Comensal',
        createdAt: o.created_at,
        items: o.order_items.filter((it) => it.status !== 'cancelled').map((it) => ({
          quantity: it.quantity,
          name: it.products?.name || 'Ítem',
          unitPrice: Number(it.unit_price),
        })),
        subtotal: sub,
        discountPct: discount,
        discountAmount: discAmt,
        total: tot,
        operatorName: activeUser ? formatAuditUserLabel(activeUser) : 'Operador',
      })
    }

    const [checkoutPreview, setCheckoutPreview] = useState<{
      isFiscal: boolean
      order: OrderWithItems
      tableNumber?: string
      discountPct: number
      discountAmount: number
      paymentMethod: 'efectivo' | 'debito' | 'credito' | 'qr'
      invoiceType: 'A' | 'B' | 'C'
      docType: number
      docNumber: string
      subtotal: number
      finalTotal: number
      netAmount: number
      vatAmount: number
      invoiceNumber: string
      cae: string
      caeDueDate: string
    } | null>(null)

    // Abre el modal obligatorio de vista previa SIN liberar la mesa todavía
    const openCheckoutPreview = async (isFiscal: boolean) => {
      if (!selectedOrderId || !activeOrder) return

      const docType = invoiceType === 'A' ? 80 : 96
      const docNumber = invoiceType === 'A' ? cuit : dni || '99'
      const sub = Number(activeOrder.subtotal)

      const calc = await calculateArcaInvoiceAmounts({
        subtotal: sub,
        discountPct: discount,
        invoiceType,
        items: activeOrder.order_items as any,
      })

      const randomReceiptNum = Math.floor(1 + Math.random() * 99999999)
      const invNumber = `0001-${String(randomReceiptNum).padStart(8, '0')}`
      const caeNum = `74${Math.floor(100000000000 + Math.random() * 900000000000)}`
      const caeDue = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]
      const tableNum = tables.find((t) => t.id === activeOrder.table_id)?.number

      setCheckoutPreview({
        isFiscal,
        order: activeOrder,
        tableNumber: tableNum,
        discountPct: calc.discountPct,
        discountAmount: calc.discountAmount,
        paymentMethod: payMethod,
        invoiceType: calc.effectiveInvoiceType,
        docType,
        docNumber,
        subtotal: calc.subtotal,
        finalTotal: calc.finalTotal,
        netAmount: calc.netAmount,
        vatAmount: calc.vatAmount,
        invoiceNumber: invNumber,
        cae: caeNum,
        caeDueDate: caeDue,
      })
    }

    // Confirma el cobro, imprime si se solicita, cierra la orden y LIBERA LA MESA de forma definitiva
    const handleConfirmCheckout = async (printTicket: boolean) => {
      if (!checkoutPreview) return
      const preview = checkoutPreview
      const orderId = preview.order.id

      if (printTicket) {
        if (preview.isFiscal) {
          handlePrint('fiscal', {
            invoiceType: preview.invoiceType,
            invoiceNumber: preview.invoiceNumber,
            cae: preview.cae,
            caeDueDate: preview.caeDueDate,
            docType: preview.docType,
            docNumber: preview.docNumber,
            paymentMethod: preview.paymentMethod,
            netAmount: preview.netAmount,
            vatAmount: preview.vatAmount,
            total: preview.finalTotal,
            createdAt: new Date().toISOString(),
            items: preview.order.order_items.map((it) => ({
              quantity: it.quantity,
              name: it.products?.name || 'Producto',
              unitPrice: Number(it.unit_price),
            })),
          })
        } else {
          handlePrint('prebill', {
            orderId: preview.order.id,
            tableNumber: preview.tableNumber,
            origin: preview.order.origin,
            customerName: preview.order.customer_name || 'Comensal',
            createdAt: preview.order.created_at,
            items: preview.order.order_items.map((it) => ({
              quantity: it.quantity,
              name: it.products?.name || 'Ítem',
              unitPrice: Number(it.unit_price),
            })),
            subtotal: preview.subtotal,
            discountPct: preview.discountPct,
            discountAmount: preview.discountAmount,
            total: preview.finalTotal,
          })
        }
      }

      if (dbConnected) {
        if (preview.isFiscal) {
          await closeOrderAndInvoiceAction(
            orderId,
            {
              discountPct: preview.discountPct,
              paymentMethod: preview.paymentMethod,
              invoiceType: preview.invoiceType,
              docType: preview.docType,
              docNumber: preview.docNumber,
            },
            activeUser!
          )
        } else {
          await closeOrderWithoutInvoiceAction(
            orderId,
            {
              discountPct: preview.discountPct,
              paymentMethod: preview.paymentMethod,
            },
            activeUser!
          )
        }
        await loadDashboardData()
      } else {
        const mockClosedOrder: OrderRow = {
          ...preview.order,
          status: 'closed',
          payment_method: preview.paymentMethod,
          discount_pct: preview.discountPct,
          discount_amount: preview.discountAmount,
          total: preview.finalTotal,
          closed_at: new Date().toISOString(),
        }

        setOrders((curr) => {
          const updated = curr.map((o) => (o.id === orderId ? (mockClosedOrder as any) : o))
          try {
            localStorage.setItem('fuego_live_orders', JSON.stringify(updated))
          } catch {}
          return updated
        })
        if (preview.order.table_id) {
          setTables((curr) => {
            const updated = curr.map((t) => (t.id === preview.order.table_id ? { ...t, status: 'libre' as const } : t))
            try {
              localStorage.setItem('fuego_live_tables', JSON.stringify(updated))
            } catch {}
            return updated
          })
        }

        broadcastAction({
          type: 'ORDER_CLOSED',
          payload: { orderId, tableId: preview.order.table_id },
        })
      }

      setCheckoutPreview(null)
      setSelectedOrderId('')
      showNotification(
        preview.isFiscal
          ? '✅ Factura fiscal autorizada ARCA. Mesa liberada y cobro asentado.'
          : '✅ Cobro finalizado (Comprobante Ticket X). Mesa liberada.',
        'success'
      )
    }

    // Impresión de Factura Fiscal
    const handlePrintFiscalTicket = () => {
      if (!invoiceProcessed) return
      handlePrint('fiscal', {
        invoiceType: invoiceProcessed.invoice.invoice_type,
        invoiceNumber: invoiceProcessed.invoice.invoice_number,
        cae: invoiceProcessed.invoice.cae || undefined,
        caeDueDate: invoiceProcessed.invoice.cae_due_date || undefined,
        docType: invoiceProcessed.invoice.doc_type,
        docNumber: invoiceProcessed.invoice.doc_number,
        paymentMethod: invoiceProcessed.order.payment_method || 'efectivo',
        netAmount: Number(invoiceProcessed.invoice.net_amount),
        vatAmount: Number(invoiceProcessed.invoice.vat_amount),
        total: Number(invoiceProcessed.invoice.total_amount),
        createdAt: invoiceProcessed.invoice.created_at,
        items: (invoiceProcessed.order as any).order_items?.map((it: any) => ({
          quantity: it.quantity,
          name: it.products?.name || 'Producto',
          unitPrice: Number(it.unit_price),
        })),
      })
    }

    // Impresión Cierre Z Fiscal Oficial (ARCA)
    const handlePrintZCloseFiscal = () => {
      const metrics = adminMetrics || {
        ordersCountToday: orders.filter((o) => o.status === 'closed').length,
        fiscal: {
          netAmount: totalSalesVal / 1.21,
          vatAmount: totalSalesVal - totalSalesVal / 1.21,
          totalInvoiced: totalSalesVal,
          invoicesCount: orders.filter((o) => o.status === 'closed').length,
        },
      }

      handlePrint('z_close', {
        ordersCount: metrics.fiscal?.invoicesCount || metrics.ordersCountToday,
        fiscalInvoicesCount: metrics.fiscal?.invoicesCount || metrics.ordersCountToday,
        totalSalesToday: metrics.fiscal?.totalInvoiced || 0,
        netFiscalToday: metrics.fiscal?.netAmount || 0,
        vatFiscalToday: metrics.fiscal?.vatAmount || 0,
        operatorName: activeUser ? formatAuditUserLabel(activeUser) : 'Operador',
      })
    }

    // Impresión Rendición Operativa de Salón & Caja (Arqueo Físico Interno)
    const handlePrintCashSettlement = (countedCash?: number) => {
      const metrics = adminMetrics || {
        totalSalesToday: totalSalesVal,
        ordersCountToday: orders.filter((o) => o.status === 'closed').length,
        salesByMethod: {
          efectivo: totalSalesVal * 0.4,
          debito: totalSalesVal * 0.3,
          credito: totalSalesVal * 0.2,
          qr: totalSalesVal * 0.1,
        },
      }

      const initCash = Number(activeShift?.initial_cash || 0)
      const cashSales = (orders.filter((o) => o.status === 'closed') || []).reduce(
        (sum, o) => (o.payment_method === 'efectivo' ? sum + Number(o.total || 0) : sum),
        0
      )
      const expCash = initCash + (metrics.salesByMethod?.efectivo || cashSales)
      const rCash = typeof countedCash === 'number' ? countedCash : Number(initialCashInput || expCash)
      const diff = rCash - expCash

      handlePrint('cash_settlement', {
        shiftName: activeShift?.shift_name || 'Turno General',
        ordersCount: metrics.ordersCountToday,
        totalSalesToday: metrics.totalSalesToday,
        salesByMethod: metrics.salesByMethod,
        initialCash: initCash,
        expectedCash: expCash,
        realCash: rCash,
        cashDifference: diff,
        operatorName: activeUser ? formatAuditUserLabel(activeUser) : 'Operador',
      })
    }

    return (
      <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Cobros y comprobantes</p>
            <h2 className="page-title">Caja & Facturación</h2>
            <p className="subtle">Gestión de comandas abiertas para facturación electrónica.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeShift ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-400">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  <b>{activeShift.shift_name}</b> · {activeShift.opened_by_user_name}
                </span>
                <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                  Fondo: {formatMoney(Number(activeShift.initial_cash))}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-400 font-semibold">
                <AlertTriangle className="size-4" />
                <span>Sin turno abierto</span>
              </div>
            )}

            {/* BOTONES DE AUDITORÍA E IMPRESIÓN Z Y RENDICIÓN POR DÍA / MENSUAL */}
            <div className="flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl">
              <Button
                onClick={() => handleOpenPrintModal('z_close')}
                className="gap-1.5 bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-800 text-xs font-bold rounded-lg py-1.5 px-3 h-auto"
                title="Imprimir Cierre Z Oficial eligiendo día puntual o período mensual"
              >
                <ShieldAlert className="size-3.5 text-blue-400" /> Z Fiscal (ARCA)
              </Button>
              <Button
                onClick={() => handleOpenPrintModal('cash_settlement')}
                className="gap-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 text-xs font-bold rounded-lg py-1.5 px-3 h-auto"
                title="Imprimir Rendición Operativa eligiendo día puntual o período mensual"
              >
                <Printer className="size-3.5 text-emerald-400" /> Rendición Salón & Caja
              </Button>
            </div>

            <Button
              onClick={() => {
                if (!activeShift) {
                  setOpenShiftModalOpen(true)
                  showNotification('Debe abrir el turno de caja antes de iniciar comandas.', 'warn')
                  return
                }
                setSelectedTableNumber(undefined)
                setOrderOpen(true)
              }}
              className="gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-sm py-2"
            >
              <Plus className="size-4" /> Tomar Nueva Comanda
            </Button>

            {!activeShift ? (
              <Button
                onClick={() => setOpenShiftModalOpen(true)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm py-2"
              >
                <PlusCircle className="size-4" /> Apertura de Turno
              </Button>
            ) : (
              <Button
                onClick={() => setZModalOpen(true)}
                className="gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl border border-zinc-700 shadow-sm py-2"
              >
                <Lock className="size-4 text-orange-400" /> Arqueo / Cierre de Turno (Z)
              </Button>
            )}
          </div>
        </div>

        {/* CARTELITO COMPACTO DE AVISO AL CAJERO: PEDIDOS LISTOS EN EL PASE */}
        {readyOrders.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-300 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex-shrink-0 animate-pulse">
                <Bell className="size-3.5 animate-bounce" />
              </span>
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="font-black text-emerald-300 tracking-wide uppercase whitespace-nowrap">
                  Pase listo ({readyOrders.length} {readyOrders.length === 1 ? 'pedido' : 'pedidos'})
                </span>
                <span className="text-emerald-400/80 text-[11px] hidden sm:inline">
                  (Por si el mozo está ocupado):
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {readyOrders.map((ro) => {
                    const tbl = tables.find((t) => t.id === ro.table_id)
                    const tblName = tbl ? `Mesa ${tbl.number}` : ro.origin === 'takeaway' ? 'Barra / Take Away' : 'QR'
                    return (
                      <span
                        key={ro.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-200"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                        {tblName}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => playNotificationSound('ready')}
              title="Probar sonido de campana de pase"
              className="flex items-center gap-1 text-[11px] text-emerald-300/80 hover:text-emerald-200 px-2 py-1 rounded hover:bg-emerald-900/40 transition-colors flex-shrink-0 active:scale-95"
            >
              <Volume2 className="size-3.5" />
              <span className="hidden min-[480px]:inline">Campana</span>
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
          <div className="panel">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Órdenes abiertas</h3>
              <span className="text-[10px] font-mono font-bold bg-secondary text-muted-foreground px-2 py-0.5 rounded">
                {pendingBills.length} pendientes
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 mb-3">
              Seleccione una comanda para registrar cobro o emitir comprobante fiscal.
            </p>

            <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
              {pendingBills.length === 0 ? (
                <p className="text-xs text-zinc-500 py-10 text-center">No hay cuentas pendientes de cobro.</p>
              ) : (
                pendingBills.map((x) => {
                  const table = tables.find((t) => t.id === x.table_id)
                  const label = table ? `Mesa ${table.number}` : x.origin === 'takeaway' ? 'Take Away' : 'QR Fast Order'
                  const isRequestingBill = table?.status === 'cuenta'
                  const isPaidUpfront = Boolean(x.notes?.includes('PAGO PREVIO') || x.table_id?.includes('tbl-b'))
                  const isReadyInPass = x.kds_status === 'ready'

                  return (
                    <button
                      key={x.id}
                      onClick={() => setSelectedOrderId(x.id)}
                      className={`order-select relative flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        selectedOrderId === x.id
                          ? 'border-orange-500 bg-orange-950/20 ring-1 ring-orange-500/50'
                          : isRequestingBill
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/10 animate-pulse'
                          : isReadyInPass
                          ? 'border-emerald-500/50 bg-emerald-950/20 ring-1 ring-emerald-500/30'
                          : isPaidUpfront
                          ? 'border-emerald-500/30 bg-emerald-950/20'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <b className="font-black text-sm">{label}</b>
                          {isRequestingBill && (
                            <span className="text-[9px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded animate-pulse">
                              🔴 PIDE CUENTA
                            </span>
                          )}
                          {isReadyInPass && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                              <Bell className="size-2.5 text-emerald-400" /> LISTO EN PASE
                            </span>
                          )}
                          {isPaidUpfront && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black px-1.5 py-0.5 rounded">
                              ⚡ PAGO PREVIO
                            </span>
                          )}
                        </div>
                        <small className="text-zinc-400 text-xs font-semibold">
                          Comensal: {x.customer_name || 'Sin nombre'}
                        </small>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {isRequestingBill
                            ? '👉 Cliente listo para pagar'
                            : isReadyInPass
                            ? '🍽️ ¡Platos listos en pase para servir!'
                            : isPaidUpfront
                            ? '✅ Pago cobrado al paso · Emitir factura'
                            : '🍽️ Consumo activo en mesa'}
                        </span>
                      </div>
                      <strong className="font-mono text-sm text-primary">{formatMoney(Number(x.total))}</strong>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="panel">
            {activeOrder ? (
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                    <h3 className="section-title">
                      Detalle de Comanda · {activeOrder.table_id ? 'Salón' : activeOrder.origin.toUpperCase()}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handlePrintKitchenStations({
                            id: activeOrder.id,
                            tableNumber: tables.find((t) => t.id === activeOrder.table_id)?.number,
                            origin: activeOrder.origin,
                            customerName: activeOrder.customer_name || 'Comensal',
                            createdAt: activeOrder.created_at,
                            items: activeOrder.order_items.filter((it) => it.status !== 'cancelled').map((it) => ({
                              quantity: it.quantity,
                              name: it.products?.name || 'Ítem',
                              unitPrice: Number(it.unit_price),
                              notes: it.notes,
                            })),
                          })
                        }
                        className="inline-flex items-center gap-1.5 bg-secondary hover:bg-orange-500/20 text-muted-foreground hover:text-orange-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-border transition-colors"
                        title="Imprimir comandas divididas para Parrillero y Cocinero"
                      >
                        <Flame className="size-3.5 text-orange-500" /> Comandas Estación
                      </button>
                      <button
                        onClick={() => handlePrintPrebill(activeOrder)}
                        className="inline-flex items-center gap-1.5 bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-foreground text-xs font-bold px-3 py-1.5 rounded-lg border border-border transition-colors"
                      >
                        <Printer className="size-3.5 text-primary" /> Pre-cuenta
                      </button>
                      <span className="status alert">Abierta</span>
                    </div>
                  </div>

                  {/* MINI CARTELITO: COMANDA LISTA EN EL PASE */}
                  {activeOrder.kds_status === 'ready' && (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-950/70 border border-emerald-500/50 p-2.5 text-xs text-emerald-300 font-bold animate-in fade-in">
                      <div className="flex items-center gap-2 min-w-0">
                        <Bell className="size-4 text-emerald-400 animate-bounce flex-shrink-0" />
                        <span className="truncate">¡Platos listos en el pase de cocina!</span>
                      </div>
                      <button
                        onClick={() => deliverOrder(activeOrder.id)}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[10px] font-bold px-2.5 py-1 transition-all shadow flex items-center gap-1 flex-shrink-0"
                        title="Marcar como entregado si el mozo está ocupado o se retira en barra"
                      >
                        <Check className="size-3" /> Entregar
                      </button>
                    </div>
                  )}

                  {/* CARTEL INFORMATIVO SEGÚN ESTADO DE COBRO */}
                  {activeOrder.notes?.includes('PAGO PREVIO') || activeOrder.table_id?.includes('tbl-b') ? (
                    <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 p-3 text-xs text-emerald-300 font-bold">
                      <CheckCircle className="size-5 text-emerald-400 shrink-0" />
                      <div>
                        <p>⚡ Pago Previo Abonado en Efectivo/QR (${formatMoney(Number(activeOrder.total))})</p>
                        <p className="text-[10px] font-normal text-emerald-400/80">Este pedido fue cobrado al tomarlo en la barra. Confirme abajo para emitir el comprobante fiscal y cerrar la orden.</p>
                      </div>
                    </div>
                  ) : tables.find((t) => t.id === activeOrder.table_id)?.status === 'cuenta' ? (
                    <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-orange-950/60 border border-orange-500/40 p-3 text-xs text-orange-300 font-bold animate-pulse">
                      <Bell className="size-5 text-orange-400 shrink-0" />
                      <div>
                        <p>🔴 Cliente Solicitó la Cuenta en Mesa</p>
                        <p className="text-[10px] font-normal text-orange-300/80">Seleccione el método de pago elegido por el cliente y proceda a facturar.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-300 font-semibold">
                      <Utensils className="size-4 text-zinc-400 shrink-0" />
                      <p>🍽️ Mesa consumiendo en salón (Comanda activa).</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 max-h-56 overflow-y-auto pr-1">
                    {activeOrder.order_items.map((it) => {
                      const isCancelled = it.status === 'cancelled'
                      return (
                        <div key={it.id} className="order-line text-sm text-foreground flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={isCancelled ? 'line-through text-muted-foreground' : ''}>
                              {it.quantity}× {it.products?.name}
                            </span>
                            {isCancelled && (
                              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase">
                                Anulado
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <b className={isCancelled ? 'line-through text-muted-foreground' : ''}>
                              {formatMoney(it.quantity * it.unit_price)}
                            </b>
                            {!isCancelled && (
                              <button
                                onClick={() => {
                                  setItemToCancel({ orderId: activeOrder.id, item: it })
                                  setCancelReasonInput('')
                                }}
                                title="Anular ítem de la comanda con registro de auditoría"
                                className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="order-line text-sm text-muted-foreground border-t border-border pt-3 mt-3">
                      <span>Subtotal bruto (Ítems activos)</span>
                      <b>{formatMoney(Number(activeOrder.subtotal))}</b>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border pt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-muted-foreground">
                      Descuento comercial
                      <select
                        value={discount}
                        onChange={(e) => setDiscount(Number(e.target.value))}
                        className="mt-1.5 w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-semibold"
                      >
                        <option value="0">Sin descuento</option>
                        <option value="10">10% Efectivo</option>
                        <option value="15">15% Promoción</option>
                      </select>
                    </label>

                    <label className="block text-xs font-bold text-muted-foreground">
                      Método de cobro
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as any)}
                        className="mt-1.5 w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-semibold"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                        <option value="qr">Mercado Pago / QR</option>
                      </select>
                    </label>

                    <label className="block text-xs font-bold text-muted-foreground">
                      Tipo de Factura
                      <select
                        value={invoiceType}
                        onChange={(e) => setInvoiceType(e.target.value as any)}
                        className="mt-1.5 w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-semibold"
                      >
                        <option value="B">Factura B (Consumidor Final)</option>
                        <option value="A">Factura A (Responsable Inscripto)</option>
                        <option value="C">Factura C (Monotributo)</option>
                      </select>
                    </label>

                    {invoiceType === 'A' ? (
                      <label className="block text-xs font-bold text-muted-foreground animate-in slide-in-from-top-2 duration-150">
                        CUIT del Comprador
                        <input
                          placeholder="Sin guiones, ej. 30123456789"
                          value={cuit}
                          onChange={(e) => setCuit(e.target.value)}
                          className="mt-1.5 w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-semibold"
                        />
                      </label>
                    ) : (
                      <label className="block text-xs font-bold text-muted-foreground">
                        DNI del Cliente (Opcional)
                        <input
                          placeholder="Ej. 35123456"
                          value={dni}
                          onChange={(e) => setDni(e.target.value)}
                          className="mt-1.5 w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground font-semibold"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="mt-6 border-t border-border pt-4">
                  <div className="flex items-center justify-between text-lg font-black tracking-tight mb-4">
                    <span>Total a cobrar</span>
                    <span className="font-mono text-primary">
                      {formatMoney(Number(activeOrder.subtotal) * (1 - discount / 100))}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      onClick={() => openCheckoutPreview(true)}
                      className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-xs sm:text-sm"
                      title="Abre la vista previa del comprobante fiscal antes de liberar la mesa"
                    >
                      <CreditCard className="size-4" /> Cobrar y Facturar (ARCA)
                    </Button>

                    <Button
                      onClick={() => openCheckoutPreview(false)}
                      className="w-full gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold py-3 rounded-xl border border-zinc-700 text-xs sm:text-sm"
                      title="Abre la vista previa del comprobante Ticket X sin factura fiscal antes de liberar la mesa"
                    >
                      <FileText className="size-4 text-orange-400" /> Cobrar (Sin Factura / Ticket X)
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-xs text-zinc-500 py-32">
                Seleccione una comanda activa del panel izquierdo para proceder con el cobro.
              </div>
            )}
          </div>
        </div>

        {/* MODAL DE VISTA PREVIA OBLIGATORIA DEL COMPROBANTE ANTES DE LIBERAR LA MESA */}
        {checkoutPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200 print:hidden overflow-y-auto">
            <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl space-y-4 my-8">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="size-5 text-orange-500" />
                  <h3 className="text-base font-black text-white">Vista Previa del Comprobante</h3>
                </div>
                <button
                  onClick={() => setCheckoutPreview(null)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                  title="Cancelar (La mesa permanece ocupada)"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="text-[11px] text-zinc-400">
                Revise los datos del comprobante. La mesa se liberará del plano únicamente al hacer clic en <strong>Finalizar</strong> o <strong>Imprimir</strong>.
              </div>

              {/* TICKET TÉRMICO 80MM EN PANTALLA */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 font-mono text-[11px] text-zinc-200 shadow-inner space-y-2">
                <div className="text-center space-y-0.5">
                  <p className="font-black text-sm tracking-wider text-orange-400 uppercase">🍺 1847 - PARRILLA & CERVECERIA</p>
                  <p className="text-[10px] text-zinc-400">Parrilla & Cervecería POS + KDS · CABA</p>
                  <p className="text-[9px] text-zinc-500">CUIT: 30-71829384-9 · IIBB: 1829384</p>
                </div>

                <div className="border-t border-dashed border-zinc-700 my-2 pt-2 space-y-1">
                  <div className="flex justify-between font-bold text-white">
                    <span>COMPROBANTE:</span>
                    <span className={checkoutPreview.isFiscal ? 'text-emerald-400' : 'text-amber-400'}>
                      {checkoutPreview.isFiscal
                        ? `FACTURA FISCAL ${checkoutPreview.invoiceType}`
                        : 'COMPROBANTE X (NO FISCAL)'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>FECHA / HORA:</span>
                    <span>{new Date().toLocaleDateString('es-AR')} {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>SECTOR / PUESTO:</span>
                    <span className="font-bold text-white">{checkoutPreview.tableNumber ? `Mesa ${checkoutPreview.tableNumber}` : 'Take Away / Mostrador'}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>CLIENTE:</span>
                    <span className="truncate max-w-[180px] text-white">{checkoutPreview.order.customer_name || 'Comensal'}</span>
                  </div>

                  {checkoutPreview.isFiscal && (
                    <>
                      <div className="flex justify-between text-emerald-300 font-semibold pt-1 border-t border-zinc-800">
                        <span>RECEPTOR:</span>
                        <span>{checkoutPreview.invoiceType === 'A' ? `CUIT ${checkoutPreview.docNumber}` : checkoutPreview.docNumber !== '99' ? `DNI ${checkoutPreview.docNumber}` : 'Consumidor Final'}</span>
                      </div>
                      <div className="flex justify-between text-emerald-300 font-semibold">
                        <span>COMPROBANTE N°:</span>
                        <span>{checkoutPreview.invoiceNumber}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* ÍTEMS DE CONSUMO */}
                <div className="border-t border-dashed border-zinc-700 py-2 space-y-1">
                  <div className="flex justify-between font-bold text-zinc-500 text-[9px] pb-1">
                    <span>CANT × ÍTEM</span>
                    <span>IMPORTE</span>
                  </div>
                  {checkoutPreview.order.order_items.map((it) => (
                    <div key={it.id} className="flex justify-between text-zinc-100">
                      <span className="truncate max-w-[210px]">
                        {it.quantity}× {it.products?.name}
                      </span>
                      <span>{formatMoney(it.quantity * it.unit_price)}</span>
                    </div>
                  ))}
                </div>

                {/* LIQUIDACIÓN DE IMPORTES */}
                <div className="border-t border-dashed border-zinc-700 pt-2 space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Subtotal Bruto:</span>
                    <span>{formatMoney(checkoutPreview.subtotal)}</span>
                  </div>

                  {checkoutPreview.discountPct > 0 && (
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Descuento Comercial ({checkoutPreview.discountPct}%):</span>
                      <span>-{formatMoney(checkoutPreview.discountAmount)}</span>
                    </div>
                  )}

                  {checkoutPreview.isFiscal && (
                    <>
                      <div className="flex justify-between text-zinc-400">
                        <span>Neto Gravado (21.00%):</span>
                        <span>{formatMoney(checkoutPreview.netAmount)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>IVA Débito Fiscal:</span>
                        <span>{formatMoney(checkoutPreview.vatAmount)}</span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between font-black text-sm text-orange-400 border-t border-zinc-700 pt-1.5 mt-1">
                    <span>TOTAL FACTURADO:</span>
                    <span>{formatMoney(checkoutPreview.finalTotal)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-400 pt-1">
                    <span>MÉTODO DE PAGO:</span>
                    <span className="font-bold text-white uppercase">{checkoutPreview.paymentMethod}</span>
                  </div>
                </div>

                {/* CAE AFIP/ARCA */}
                {checkoutPreview.isFiscal && (
                  <div className="border-t border-dashed border-zinc-700 pt-2 text-center text-[9px] text-emerald-400 bg-emerald-950/50 p-2 rounded border border-emerald-500/30 space-y-0.5">
                    <div className="font-bold">✓ AUTORIZADO ELECTRÓNICAMENTE POR ARCA</div>
                    <div>CAE N°: <span className="font-mono font-bold text-white">{checkoutPreview.cae}</span></div>
                    <div>VTO CAE: <span className="font-mono text-white">{checkoutPreview.caeDueDate}</span></div>
                  </div>
                )}
              </div>

              {/* BOTONES DE CONFIRMACIÓN */}
              <div className="space-y-2 pt-2">
                <Button
                  onClick={() => handleConfirmCheckout(true)}
                  className="w-full gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg transition-all"
                >
                  <Printer className="size-4" /> Imprimir Ticket 80mm y Liberar Mesa
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleConfirmCheckout(false)}
                    className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs"
                  >
                    <CheckCircle className="size-4" /> Finalizar y Liberar Mesa
                  </Button>

                  <Button
                    onClick={() => setCheckoutPreview(null)}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2 rounded-xl text-xs"
                  >
                    Cancelar (Mantener Mesa)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE ARQUEO / CIERRE DE TURNO Z CON CONCILIACIÓN Y AUDITORÍA */}
        {zModalOpen && (() => {
          const cashSalesVal = (orders.filter((o) => o.status === 'closed') || []).reduce(
            (sum, o) => (o.payment_method === 'efectivo' ? sum + Number(o.total || 0) : sum),
            0
          )
          const initialCashVal = Number(activeShift?.initial_cash || 0)
          const expectedCashVal = initialCashVal + cashSalesVal
          const cashDifferenceVal = Number(initialCashInput || expectedCashVal) - expectedCashVal

          const handleExecuteZClose = async () => {
            const finalCashCounted = Number(initialCashInput || expectedCashVal)
            if (activeShift && dbConnected) {
              const res = await closeCashRegisterShiftAction(
                {
                  shiftId: activeShift.id,
                  finalCashReal: finalCashCounted,
                  notes: `Cierre Z asentado por ${activeUser?.name || 'Operador'}`,
                },
                activeUser!
              )
              if (res.success) {
                showNotification(`Turno "${activeShift.shift_name}" cerrado con éxito por ${activeUser?.name || 'Operador'}.`, 'success')
                setActiveShift(null)
                try {
                  localStorage.removeItem('fuego_live_shift')
                } catch {}
                broadcastAction({ type: 'SHIFT_CLOSED' })
              } else {
                showNotification(res.error || 'Error al asentar cierre de turno.', 'warn')
              }
            } else {
              showNotification(`Cierre registrado en memoria por ${activeUser?.name || 'Operador'}.`, 'success')
              setActiveShift(null)
              try {
                localStorage.removeItem('fuego_live_shift')
              } catch {}
              broadcastAction({ type: 'SHIFT_CLOSED' })
            }

            if (printMode === 'fiscal') {
              handlePrintZCloseFiscal()
            } else if (printMode === 'operational') {
              handlePrintCashSettlement(finalCashCounted)
            } else {
              handlePrintCashSettlement(finalCashCounted)
            }
            setZModalOpen(false)
          }

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200 print:hidden">
              <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Lock className="size-5 text-orange-400" />
                    <div>
                      <h3 className="text-base font-black">Cierre de Turno & Rendición</h3>
                      <p className="text-[10px] text-muted-foreground">Trazabilidad fiscal ARCA y control de caja física</p>
                    </div>
                  </div>
                  <button onClick={() => setZModalOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                    <X className="size-4" />
                  </button>
                </div>

                {activeShift ? (
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex justify-between font-bold text-primary">
                      <span>Turno: {activeShift.shift_name}</span>
                      <span>Estado: Abierto</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>Iniciado por: {activeShift.opened_by_user_name}</span>
                      <span>Fondo Inicial: {formatMoney(initialCashVal)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400 font-semibold">
                    <span>⚠️ No se detectó un turno formal abierto en BD. Se computará el acumulado del día.</span>
                  </div>
                )}

                <div className="space-y-3 bg-secondary/30 rounded-xl p-4 border border-border/50 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>Órdenes Cerradas Totales:</span>
                    <span className="font-mono font-bold text-foreground">
                      {adminMetrics?.ordersCountToday || orders.filter((o) => o.status === 'closed').length}
                    </span>
                  </div>
                  <hr className="border-border/60" />
                  <div className="space-y-1.5">
                    <span className="font-bold text-muted-foreground uppercase text-[10px]">Total Recaudado por Medio</span>
                    <div className="flex justify-between">
                      <span>Efectivo en Caja:</span>
                      <span className="font-mono font-bold text-emerald-400">{formatMoney(cashSalesVal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Débito:</span>
                      <span className="font-mono font-bold">{formatMoney(adminMetrics?.salesByMethod.debito || totalSalesVal * 0.3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Crédito:</span>
                      <span className="font-mono font-bold">{formatMoney(adminMetrics?.salesByMethod.credito || totalSalesVal * 0.2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transferencia / QR:</span>
                      <span className="font-mono font-bold">{formatMoney(adminMetrics?.salesByMethod.qr || totalSalesVal * 0.1)}</span>
                    </div>
                  </div>
                  <hr className="border-border/60" />
                  <div className="flex justify-between font-black text-sm text-primary">
                    <span>RECAUDACIÓN TOTAL SALÓN & CAJA:</span>
                    <span className="font-mono">{formatMoney(adminMetrics?.totalSalesToday || totalSalesVal)}</span>
                  </div>
                </div>

                {/* CONCILIACIÓN DE EFECTIVO */}
                <div className="bg-card border border-border rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between font-bold text-muted-foreground">
                    <span>Efectivo Esperado (Fondo + Cobros):</span>
                    <span className="font-mono text-foreground font-black">{formatMoney(expectedCashVal)}</span>
                  </div>
                  <label className="block text-muted-foreground font-bold">
                    Arqueo Real Físico en Billetes ($):
                    <input
                      type="number"
                      value={initialCashInput || ''}
                      onChange={(e) => setInitialCashInput(Number(e.target.value))}
                      placeholder={String(expectedCashVal)}
                      className="mt-1 w-full bg-background border border-border rounded-lg p-2 text-foreground font-mono font-bold text-sm"
                    />
                  </label>
                  <div className="flex justify-between items-center pt-1 font-bold">
                    <span>Diferencia de Caja:</span>
                    <span className={`font-mono text-sm ${cashDifferenceVal === 0 ? 'text-emerald-400' : cashDifferenceVal > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {cashDifferenceVal > 0 ? `+${formatMoney(cashDifferenceVal)}` : formatMoney(cashDifferenceVal)}
                      {cashDifferenceVal === 0 && ' (Caja Exacta ✓)'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground bg-secondary/20 p-2.5 rounded-lg border border-border/40">
                  <span className="font-semibold text-foreground">Operador que asienta el cierre:</span> {activeUser?.name || 'Operador'} ({activeUser?.legajo || 'S/L'})
                </div>

                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleExecuteZClose('fiscal')}
                      className="w-full gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-md"
                      title="Emite el Cierre Z Oficial con datos fiscales y CAE para ARCA"
                    >
                      <Printer className="size-4" /> Z Fiscal Oficial (ARCA)
                    </Button>
                    <Button
                      onClick={() => handleExecuteZClose('operational')}
                      className="w-full gap-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-md"
                      title="Emite la Rendición Operativa de Salón y Caja para conciliar dinero físico"
                    >
                      <Printer className="size-4" /> Rendición Operativa Caja
                    </Button>
                  </div>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setZModalOpen(false)
                        handleOpenPrintModal('z_close')
                      }}
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline"
                    >
                      🗓️ ¿Desea consultar o reimprimir Z o Rendición de otro día específico o período mensual?
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleExecuteZClose('both')}
                      className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg"
                      title="Asienta el cierre de turno y guarda los números definitivos"
                    >
                      <Lock className="size-4" /> Cerrar Turno Definitivo
                    </Button>
                    <Button
                      onClick={() => setZModalOpen(false)}
                      className="bg-secondary text-foreground hover:bg-zinc-800 font-bold px-4 py-2.5 rounded-xl text-xs"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </>
    )
  }

  // ==========================================
  // VISTA: ADMIN & FINANZAS & GESTIÓN DE MENÚ
  // ==========================================
  function AdminView() {
    const [adminSubTab, setAdminSubTab] = useState<'metrics' | 'stock' | 'menu' | 'audit' | 'shifts'>('metrics')

    // Estados para Auditoría y Trazabilidad
    const [auditLogsList, setAuditLogsList] = useState<AuditLogRow[]>([])
    const [auditLoading, setAuditLoading] = useState(false)
    const [shiftsList, setShiftsList] = useState<CashRegisterShiftRow[]>([])
    const [shiftsLoading, setShiftsLoading] = useState(false)

    const loadAuditLogs = async () => {
      setAuditLoading(true)
      try {
        const res = await getAuditLogsAction({ limit: 50 })
        if (res.success) {
          setAuditLogsList(res.logs)
        }
      } catch (err) {
        console.error('Error al cargar logs:', err)
      } finally {
        setAuditLoading(false)
      }
    }

    const loadShiftsList = async () => {
      setShiftsLoading(true)
      try {
        const res = await getRecentCashRegisterShiftsAction(20)
        if (res.success) {
          setShiftsList(res.shifts)
        }
      } catch (err) {
        console.error('Error al cargar turnos:', err)
      } finally {
        setShiftsLoading(false)
      }
    }

    const [menuCatFilter, setMenuCatFilter] = useState<string>('Todas')
    const [menuSearch, setMenuSearch] = useState('')
    const [newProductModalOpen, setNewProductModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
    const [zModalOpenAdmin, setZModalOpenAdmin] = useState(false)
    const [metricsScope, setMetricsScope] = useState<'all' | 'fiscal' | 'operational'>('all')

    // Formulario Nuevo / Editar Producto
    const [prodName, setProdName] = useState('')
    const [prodCatId, setProdCatId] = useState(categories[0]?.id || '')
    const [prodPrice, setProdPrice] = useState<number>(0)
    const [prodDetail, setProdDetail] = useState('')
    const [prodVat, setProdVat] = useState<number>(21.0)
    const [prodActive, setProdActive] = useState(true)
    const [isSavingProd, setIsSavingProd] = useState(false)

    // Estados para Abastecimiento
    const [selectedItemId, setSelectedItemId] = useState('')
    const [purchaseQty, setPurchaseQty] = useState<number>(0)
    const [purchasePrice, setPurchasePrice] = useState<number>(0)
    const [supplier, setSupplier] = useState('')
    const [isRestocking, setIsRestocking] = useState(false)

    const lowStockItems = inventory.filter((item) => Number(item.current_quantity) <= Number(item.min_stock))

    const openCreateModal = () => {
      setEditingProduct(null)
      setProdName('')
      setProdCatId(categories[0]?.id || '')
      setProdPrice(0)
      setProdDetail('')
      setProdVat(21.0)
      setProdActive(true)
      setNewProductModalOpen(true)
    }

    const openEditModal = (p: ProductRow) => {
      setEditingProduct(p)
      setProdName(p.name)
      setProdCatId(p.category_id || categories[0]?.id || '')
      setProdPrice(Number(p.price))
      setProdDetail(p.detail || '')
      setProdVat(Number(p.vat_rate || 21.0))
      setProdActive(p.is_active)
      setNewProductModalOpen(true)
    }

    const handleSaveProduct = async () => {
      if (!prodName.trim() || prodPrice < 0) {
        showNotification('Debe ingresar un nombre válido y precio no negativo.', 'warn')
        return
      }

      setIsSavingProd(true)

      if (editingProduct) {
        const res = await updateProductAction(editingProduct.id, {
          categoryId: prodCatId,
          name: prodName,
          price: prodPrice,
          detail: prodDetail,
          vatRate: prodVat,
          isActive: prodActive,
        })

        if (res.success) {
          const updated = res.product || {
            ...editingProduct,
            category_id: prodCatId,
            name: prodName,
            price: prodPrice,
            detail: prodDetail,
            vat_rate: prodVat,
            is_active: prodActive,
          }
          setProducts((curr) => curr.map((p) => (p.id === editingProduct.id ? updated : p)))
          showNotification('Producto actualizado con éxito.', 'success')
          setNewProductModalOpen(false)
        } else {
          showNotification(res.error || 'Error al actualizar producto.', 'warn')
        }
      } else {
        const res = await createProductAction({
          categoryId: prodCatId,
          name: prodName,
          price: prodPrice,
          detail: prodDetail,
          vatRate: prodVat,
          isActive: prodActive,
        })

        if (res.success && res.product) {
          setProducts((curr) => [res.product!, ...curr])
          showNotification('Nuevo producto creado y disponible.', 'success')
          setNewProductModalOpen(false)
        } else {
          showNotification(res.error || 'Error al crear producto.', 'warn')
        }
      }

      setIsSavingProd(false)
    }

    const handleToggleAvailability = async (p: ProductRow) => {
      const nextActive = !p.is_active
      setProducts((curr) => curr.map((item) => (item.id === p.id ? { ...item, is_active: nextActive } : item)))

      const res = await toggleProductAvailabilityAction(p.id, nextActive)
      if (res.success) {
        showNotification(`Producto "${p.name}" marcado como ${nextActive ? 'Disponible' : 'Agotado'}.`, 'info')
      } else {
        setProducts((curr) => curr.map((item) => (item.id === p.id ? { ...item, is_active: p.is_active } : item)))
        showNotification(res.error || 'Error al cambiar disponibilidad.', 'warn')
      }
    }

    const handleRestock = async () => {
      if (!selectedItemId || purchaseQty <= 0 || purchasePrice <= 0) {
        showNotification('Debe ingresar valores válidos para la reposición.', 'warn')
        return
      }

      setIsRestocking(true)
      const res = await registerStockPurchaseAction({
        inventoryItemId: selectedItemId,
        quantity: purchaseQty,
        unitPrice: purchasePrice,
        supplier: supplier || undefined,
      })

      if (res.success) {
        showNotification('Ingreso de stock registrado con éxito.', 'success')
        setSelectedItemId('')
        setPurchaseQty(0)
        setPurchasePrice(0)
        setSupplier('')
        loadDashboardData()
      } else {
        setInventory((curr) =>
          curr.map((item) =>
            item.id === selectedItemId
              ? { ...item, current_quantity: Number(item.current_quantity) + purchaseQty }
              : item
          )
        )
        showNotification('Reposición registrada en memoria local.', 'success')
        setSelectedItemId('')
        setPurchaseQty(0)
        setPurchasePrice(0)
      }
      setIsRestocking(false)
    }

    const metrics: AdminMetrics = adminMetrics || {
      totalSalesToday: totalSalesVal,
      totalSalesMonth: totalSalesVal * 12.4,
      averageTicketToday: avgTicket,
      ordersCountToday: orders.filter((o) => o.status === 'closed').length,
      salesByMethod: {
        efectivo: totalSalesVal * 0.4,
        debito: totalSalesVal * 0.3,
        credito: totalSalesVal * 0.2,
        qr: totalSalesVal * 0.1,
      },
      fiscal: {
        netAmount: totalSalesVal / 1.21,
        vatAmount: totalSalesVal - totalSalesVal / 1.21,
        totalInvoiced: totalSalesVal,
        invoicesCount: orders.filter((o) => o.status === 'closed').length,
      },
      operational: {
        totalNonInvoiced: 0,
        nonInvoicedCount: 0,
      },
    }

    const filteredProductsForABM = useMemo(() => {
      return products.filter((p) => {
        const matchesSearch = p.name.toLowerCase().includes(menuSearch.toLowerCase()) || (p.detail && p.detail.toLowerCase().includes(menuSearch.toLowerCase()))
        const matchesCat = menuCatFilter === 'Todas' || p.category_id === menuCatFilter
        return matchesSearch && matchesCat
      })
    }, [products, menuSearch, menuCatFilter])

    return (
      <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Control del negocio</p>
            <h2 className="page-title">Admin & Finanzas</h2>
            <p className="subtle">Gestión de menú, precios, métricas e inventario.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl">
              <Button
                onClick={() => handleOpenPrintModal('z_close')}
                className="gap-1.5 bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-800 text-xs font-bold rounded-lg py-1.5 px-3 h-auto"
                title="Imprimir Cierre Z Oficial eligiendo día puntual o período"
              >
                <ShieldAlert className="size-3.5 text-blue-400" /> Z Fiscal (ARCA)
              </Button>
              <Button
                onClick={() => handleOpenPrintModal('cash_settlement')}
                className="gap-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 text-xs font-bold rounded-lg py-1.5 px-3 h-auto"
                title="Imprimir Rendición Operativa eligiendo día puntual o período"
              >
                <Printer className="size-3.5 text-emerald-400" /> Rendición Salón & Caja
              </Button>
            </div>

            <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
              <button
                onClick={() => setAdminSubTab('metrics')}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition-all ${
                  adminSubTab === 'metrics' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Métricas & Finanzas
              </button>
              <button
                onClick={() => setAdminSubTab('menu')}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition-all ${
                  adminSubTab === 'menu' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Gestión de Menú & Precios
              </button>
              <button
                onClick={() => setAdminSubTab('stock')}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition-all ${
                  adminSubTab === 'stock' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Abastecimiento & Stock
              </button>
              <button
                onClick={() => {
                  setAdminSubTab('audit')
                  loadAuditLogs()
                }}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition-all ${
                  adminSubTab === 'audit' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Auditoría & Trazabilidad
              </button>
              <button
                onClick={() => {
                  setAdminSubTab('shifts')
                  loadShiftsList()
                }}
                className={`rounded-lg px-4 py-2 text-xs font-extrabold transition-all ${
                  adminSubTab === 'shifts' ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Historial de Turnos
              </button>
            </div>
          </div>
        </div>

        {adminSubTab === 'metrics' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* SELECTOR DE ENFOQUE DE MÉTRICAS */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card/60 p-2 rounded-xl border border-border/70">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMetricsScope('all')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    metricsScope === 'all'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📊 Consolidado (100% Salón & Mostrador)
                </button>
                <button
                  onClick={() => setMetricsScope('fiscal')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    metricsScope === 'fiscal'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🏛️ Declarado ARCA (Fiscal Oficial)
                </button>
                <button
                  onClick={() => setMetricsScope('operational')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    metricsScope === 'operational'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  🧾 Comprobantes Salón (Operativo X)
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground font-medium pr-2">
                {metricsScope === 'all' && 'Vista global unificada para toma de decisiones y rentabilidad total.'}
                {metricsScope === 'fiscal' && 'Libro de IVA Ventas y Cierre Z auditable ante inspectores de ARCA.'}
                {metricsScope === 'operational' && 'Rendición interna de salón y control de efectivo sin incidencia fiscal directa.'}
              </div>
            </div>

            {/* TARJETAS DE IMPACTO SEGÚN ENFOQUE SELECCIONADO */}
            {metricsScope === 'all' && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="stat">
                  <span>Total Ventas Hoy</span>
                  <strong>{formatMoney(metrics.totalSalesToday)}</strong>
                  <em className="positive">Salón + Mostrador (100%)</em>
                </div>
                <div className="stat">
                  <span>Ventas del Mes</span>
                  <strong>{formatMoney(metrics.totalSalesMonth)}</strong>
                  <em>Acumulado período</em>
                </div>
                <div className="stat">
                  <span>Ticket Promedio</span>
                  <strong>{formatMoney(metrics.averageTicketToday)}</strong>
                  <em>Hoy</em>
                </div>
                <div className="stat">
                  <span>Órdenes Cerradas</span>
                  <strong>{metrics.ordersCountToday}</strong>
                  <em>Operaciones concretadas</em>
                </div>
              </div>
            )}

            {metricsScope === 'fiscal' && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="stat border-blue-500/40 bg-blue-950/20">
                  <span className="text-blue-300 font-bold">Total Facturado ARCA</span>
                  <strong className="text-blue-200">{formatMoney(metrics.fiscal?.totalInvoiced || 0)}</strong>
                  <em className="text-blue-400">100% con CAE Otorgado</em>
                </div>
                <div className="stat border-blue-500/40 bg-blue-950/20">
                  <span className="text-blue-300 font-bold">Facturas Emitidas</span>
                  <strong className="text-blue-200">{metrics.fiscal?.invoicesCount || 0}</strong>
                  <em className="text-blue-400">Comprobantes A / B / C</em>
                </div>
                <div className="stat">
                  <span>Subtotal Neto Gravado</span>
                  <strong>{formatMoney(metrics.fiscal?.netAmount || 0)}</strong>
                  <em>Base imponible (21%)</em>
                </div>
                <div className="stat">
                  <span>Débito Fiscal IVA</span>
                  <strong className="text-primary">{formatMoney(metrics.fiscal?.vatAmount || 0)}</strong>
                  <em>Impuesto liquidado</em>
                </div>
              </div>
            )}

            {metricsScope === 'operational' && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="stat border-emerald-500/40 bg-emerald-950/20">
                  <span className="text-emerald-300 font-bold">Comprobantes Salón (X)</span>
                  <strong className="text-emerald-200">{formatMoney(metrics.operational?.totalNonInvoiced || 0)}</strong>
                  <em className="text-emerald-400">Rendición interna de mesas</em>
                </div>
                <div className="stat border-emerald-500/40 bg-emerald-950/20">
                  <span className="text-emerald-300 font-bold">Mesas / Cuentas X</span>
                  <strong className="text-emerald-200">{metrics.operational?.nonInvoicedCount || 0}</strong>
                  <em>Sin comprobante fiscal</em>
                </div>
                <div className="stat">
                  <span>Efectivo en Caja</span>
                  <strong className="text-emerald-400">{formatMoney(metrics.salesByMethod.efectivo)}</strong>
                  <em>Cobrado en efectivo hoy</em>
                </div>
                <div className="stat">
                  <span>Fondo Inicial Turno</span>
                  <strong>{formatMoney(Number(activeShift?.initial_cash || 0))}</strong>
                  <em>{activeShift ? activeShift.shift_name : 'Sin turno activo'}</em>
                </div>
              </div>
            )}

            {/* PANELES DE DETALLE */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="panel">
                <h3 className="section-title">Ventas por método de pago (Hoy)</h3>
                <div className="mt-6 flex flex-col gap-4">
                  {[
                    { label: 'Efectivo', val: metrics.salesByMethod.efectivo },
                    { label: 'Débito', val: metrics.salesByMethod.debito },
                    { label: 'Crédito', val: metrics.salesByMethod.credito },
                    { label: 'Transferencia / QR', val: metrics.salesByMethod.qr },
                  ].map((x) => {
                    const maxVal = Math.max(
                      metrics.salesByMethod.efectivo,
                      metrics.salesByMethod.debito,
                      metrics.salesByMethod.credito,
                      metrics.salesByMethod.qr,
                      1
                    )
                    const pct = (x.val / maxVal) * 100
                    return (
                      <div key={x.label}>
                        <div className="mb-2 flex justify-between text-xs font-semibold">
                          <span>{x.label}</span>
                          <span className="font-mono text-muted-foreground">{formatMoney(x.val)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary/70">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* PANEL COMPARATIVO O FISCAL */}
              <div className="panel">
                {metricsScope === 'fiscal' ? (
                  <>
                    <h3 className="section-title text-blue-400">Libro de IVA Ventas Resumido (ARCA)</h3>
                    <div className="mt-4 flex flex-col gap-3 text-xs">
                      <div className="order-line">
                        <span>Punto de Venta Autorizado</span>
                        <b className="font-mono">0001 (Webservice Fiscal)</b>
                      </div>
                      <div className="order-line">
                        <span>Régimen Impositivo</span>
                        <b>{FISCAL_REGIME.taxCondition}</b>
                      </div>
                      <div className="order-line">
                        <span>Subtotal Neto Gravado (21%)</span>
                        <b>{formatMoney(metrics.fiscal?.netAmount || 0)}</b>
                      </div>
                      <div className="order-line text-primary">
                        <span>Débito Fiscal IVA (21.00%)</span>
                        <b>{formatMoney(metrics.fiscal?.vatAmount || 0)}</b>
                      </div>
                      <div className="order-line total border-t border-border pt-3 mt-1 font-bold text-sm text-blue-300">
                        <span>Total Facturado Declarado</span>
                        <b>{formatMoney(metrics.fiscal?.totalInvoiced || 0)}</b>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-[11px] text-blue-200">
                      🛡️ <b>Blindaje ante Inspección ARCA:</b> El ticket "Z Fiscal Oficial" exportado desde este módulo refleja únicamente comprobantes válidos con CAE otorgado. No expone cierres de mesa operativos ni movimientos internos.
                    </div>
                  </>
                ) : metricsScope === 'operational' ? (
                  <>
                    <h3 className="section-title text-emerald-400">Rendición Interna de Salón & Mostrador</h3>
                    <div className="mt-4 flex flex-col gap-3 text-xs">
                      <div className="order-line">
                        <span>Turno de Caja</span>
                        <b className="font-mono">{activeShift ? activeShift.shift_name : 'No iniciado'}</b>
                      </div>
                      <div className="order-line">
                        <span>Fondo Inicial de Apertura</span>
                        <b>{formatMoney(Number(activeShift?.initial_cash || 0))}</b>
                      </div>
                      <div className="order-line">
                        <span>Efectivo Cobrado en Mostrador & Salón</span>
                        <b className="text-emerald-400">{formatMoney(metrics.salesByMethod.efectivo)}</b>
                      </div>
                      <div className="order-line">
                        <span>Efectivo Total Esperado en Cajón</span>
                        <b className="text-emerald-300 font-bold">
                          {formatMoney(Number(activeShift?.initial_cash || 0) + metrics.salesByMethod.efectivo)}
                        </b>
                      </div>
                      <div className="order-line total border-t border-border pt-3 mt-1 font-bold text-sm">
                        <span>Total Rendición Comprobantes X</span>
                        <b>{formatMoney(metrics.operational?.totalNonInvoiced || 0)}</b>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-[11px] text-emerald-200">
                      📋 <b>Control Operativo Interno:</b> Estos valores corresponden al control físico del dinero y consumo en salón, permitiendo realizar el arqueo de billetes sin mezclarlo con las declaraciones impositivas formales.
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="section-title">Conciliación General (Fiscal vs Operativo)</h3>
                    <div className="mt-4 flex flex-col gap-3 text-xs">
                      <div className="order-line">
                        <span>Facturado Oficial ARCA (Con CAE)</span>
                        <b className="text-blue-400">{formatMoney(metrics.fiscal?.totalInvoiced || 0)} ({metrics.fiscal?.invoicesCount || 0} facturas)</b>
                      </div>
                      <div className="order-line">
                        <span>Comprobantes de Salón (Ticket X)</span>
                        <b className="text-emerald-400">{formatMoney(metrics.operational?.totalNonInvoiced || 0)} ({metrics.operational?.nonInvoicedCount || 0} mesas)</b>
                      </div>
                      <div className="order-line text-muted-foreground">
                        <span>Subtotal Neto Fiscal Gravado</span>
                        <b>{formatMoney(metrics.fiscal?.netAmount || 0)}</b>
                      </div>
                      <div className="order-line text-primary">
                        <span>IVA Débito a Declarar (21%)</span>
                        <b>{formatMoney(metrics.fiscal?.vatAmount || 0)}</b>
                      </div>
                      <div className="order-line total border-t border-border pt-3 mt-1 font-bold text-sm">
                        <span>Facturación Real Consolidada (100%)</span>
                        <b className="text-orange-400">{formatMoney(metrics.totalSalesToday)}</b>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between p-2.5 bg-secondary/50 rounded-xl text-[11px] text-muted-foreground">
                      <span>Proporción Facturada Fiscalmente:</span>
                      <span className="font-bold text-foreground">
                        {metrics.totalSalesToday > 0
                          ? `${Math.round(((metrics.fiscal?.totalInvoiced || 0) / metrics.totalSalesToday) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {adminSubTab === 'menu' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border/80 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre o descripción..."
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={openCreateModal} className="gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl">
                  <PlusCircle className="size-4" /> Nuevo Producto
                </Button>
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setMenuCatFilter('Todas')}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  menuCatFilter === 'Todas' ? 'bg-secondary text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas las categorías
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setMenuCatFilter(cat.id)}
                  className={`whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                    menuCatFilter === cat.id ? 'bg-primary text-white' : 'bg-card text-muted-foreground border border-border/60 hover:text-foreground'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="panel overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/60 text-muted-foreground border-b border-border uppercase font-mono text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">Producto</th>
                      <th className="p-4">Categoría</th>
                      <th className="p-4">Precio Actual ($)</th>
                      <th className="p-4">Alícuota IVA</th>
                      <th className="p-4">Disponibilidad</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 font-medium">
                    {filteredProductsForABM.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-zinc-500 py-12">
                          No se encontraron productos coincidentes.
                        </td>
                      </tr>
                    ) : (
                      filteredProductsForABM.map((prod) => {
                        const cat = categories.find((c) => c.id === prod.category_id)
                        return (
                          <tr key={prod.id} className={`hover:bg-secondary/30 transition-colors ${!prod.is_active ? 'opacity-60 bg-zinc-950/20' : ''}`}>
                            <td className="p-4">
                              <p className="font-bold text-sm text-foreground">{prod.name}</p>
                              <p className="text-[11px] text-muted-foreground">{prod.detail || 'Sin detalles'}</p>
                            </td>
                            <td className="p-4 font-semibold text-muted-foreground">
                              <span className="rounded bg-secondary/80 px-2 py-1 border border-border/40">
                                {cat?.name || 'General'}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-bold text-sm text-primary">
                              <div className="flex items-center gap-1.5">
                                <span>{formatMoney(Number(prod.price))}</span>
                              </div>
                            </td>
                            <td className="p-4 font-mono text-muted-foreground">{prod.vat_rate || 21}%</td>
                            <td className="p-4">
                              <button
                                onClick={() => handleToggleAvailability(prod)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black transition-all ${
                                  prod.is_active
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-900/80'
                                    : 'bg-red-950/80 text-red-400 border border-red-800/40 hover:bg-red-900/80'
                                }`}
                              >
                                <span className={`size-2 rounded-full ${prod.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                                {prod.is_active ? 'DISPONIBLE' : 'AGOTADO'}
                              </button>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => openEditModal(prod)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg"
                              >
                                <Edit className="size-3" /> Editar
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {adminSubTab === 'stock' && (
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] animate-in fade-in duration-200">
            <div className="panel flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
                  <h3 className="section-title">Abastecer Inventario</h3>
                  {lowStockItems.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-black text-amber-500 animate-pulse bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                      <AlertTriangle className="size-3" /> STOCK CRÍTICO ({lowStockItems.length})
                    </span>
                  )}
                </div>

                <div className="grid gap-3 text-xs">
                  <label className="block font-bold text-muted-foreground">
                    Insumo / Producto
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                    >
                      <option value="">Seleccione...</option>
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({Number(item.current_quantity)} {item.unit} disp)
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block font-bold text-muted-foreground">
                      Cantidad a agregar
                      <input
                        type="number"
                        value={purchaseQty || ''}
                        onChange={(e) => setPurchaseQty(Number(e.target.value))}
                        className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                      />
                    </label>
                    <label className="block font-bold text-muted-foreground">
                      Precio unitario ($)
                      <input
                        type="number"
                        value={purchasePrice || ''}
                        onChange={(e) => setPurchasePrice(Number(e.target.value))}
                        className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                      />
                    </label>
                  </div>

                  <label className="block font-bold text-muted-foreground">
                    Proveedor
                    <input
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      placeholder="Ej. Frigorífico Central"
                      className="mt-1 w-full bg-background border border-border rounded p-2 text-foreground"
                    />
                  </label>
                </div>
              </div>

              <Button
                disabled={isRestocking}
                onClick={handleRestock}
                className="w-full bg-primary hover:bg-orange-600 text-white font-bold py-2 rounded-xl"
              >
                {isRestocking ? 'Guardando reposición...' : 'Registrar ingreso de mercadería'}
              </Button>
            </div>

            <div className="panel">
              <h3 className="section-title mb-3">Control de Stock Registrado</h3>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {inventory.map((item) => {
                  const isLow = Number(item.current_quantity) <= Number(item.min_stock)
                  return (
                    <div
                      key={item.id}
                      className={`flex justify-between items-center text-xs p-3 rounded-xl border ${
                        isLow ? 'bg-amber-950/20 border-amber-500/40' : 'bg-background/50 border-border/60'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">Unidad: {item.unit} | Mín: {Number(item.min_stock)}</p>
                      </div>
                      <span className={`font-mono font-bold text-sm ${isLow ? 'text-amber-400 font-extrabold' : 'text-primary'}`}>
                        {Number(item.current_quantity)} {item.unit}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB: AUDITORÍA & TRAZABILIDAD */}
        {adminSubTab === 'audit' && (
          <div className="panel space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="section-title">Bitácora de Auditoría y Trazabilidad Operativa</h3>
                <p className="text-xs text-muted-foreground">Registro inmutable de quién operó cada acción clave (cobros, facturas, pre-cuentas, anulaciones y turnos).</p>
              </div>
              <Button
                onClick={loadAuditLogs}
                className="gap-2 bg-secondary text-foreground hover:bg-zinc-800 text-xs py-1.5 px-3 rounded-xl border border-border"
              >
                Actualizar Bitácora
              </Button>
            </div>

            {auditLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Consultando registros de auditoría en base de datos...</div>
            ) : auditLogsList.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">No se registran eventos de auditoría previos.</p>
                <p className="text-[11px]">Las acciones sensibles realizadas por los operadores se asentarán aquí automáticamente en tiempo real.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border font-bold text-muted-foreground uppercase text-[10px]">
                      <th className="py-2.5 px-2">Fecha y Hora</th>
                      <th className="py-2.5 px-2">Acción</th>
                      <th className="py-2.5 px-2">Entidad</th>
                      <th className="py-2.5 px-2">Operador Responsable</th>
                      <th className="py-2.5 px-2">Detalles Registrados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {auditLogsList.map((log) => (
                      <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-2.5 px-2 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {new Date(log.created_at).toLocaleString('es-AR')}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            log.action.includes('CLOSE') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            log.action.includes('CANCEL') ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            log.action.includes('OPEN') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-zinc-400">{log.entity}</td>
                        <td className="py-2.5 px-2 font-semibold text-foreground">{log.user_name}</td>
                        <td className="py-2.5 px-2 text-muted-foreground max-w-sm truncate font-mono text-[11px]">
                          {log.details ? JSON.stringify(log.details) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB: HISTORIAL DE TURNOS DE CAJA */}
        {adminSubTab === 'shifts' && (
          <div className="panel space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="section-title">Historial de Turnos de Caja (Arqueos Z)</h3>
                <p className="text-xs text-muted-foreground">Control de aperturas, cierres, fondos iniciales, recaudaciones y diferencias de caja.</p>
              </div>
              <Button
                onClick={loadShiftsList}
                className="gap-2 bg-secondary text-foreground hover:bg-zinc-800 text-xs py-1.5 px-3 rounded-xl border border-border"
              >
                Actualizar Turnos
              </Button>
            </div>

            {shiftsLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Consultando turnos en base de datos...</div>
            ) : shiftsList.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No se registran turnos de caja asentados aún.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border font-bold text-muted-foreground uppercase text-[10px]">
                      <th className="py-2.5 px-2">Turno</th>
                      <th className="py-2.5 px-2">Estado</th>
                      <th className="py-2.5 px-2">Apertura</th>
                      <th className="py-2.5 px-2">Cierre</th>
                      <th className="py-2.5 px-2 text-right">Fondo Inicial</th>
                      <th className="py-2.5 px-2 text-right">Ventas Totales</th>
                      <th className="py-2.5 px-2 text-right">Arqueo Real</th>
                      <th className="py-2.5 px-2 text-right">Diferencia</th>
                      <th className="py-2.5 px-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {shiftsList.map((s) => {
                      const diff = Number(s.cash_difference || 0)
                      return (
                        <tr key={s.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="py-2.5 px-2 font-bold">{s.shift_name}</td>
                          <td className="py-2.5 px-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              s.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {s.status === 'open' ? 'Abierto' : 'Cerrado'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="text-[11px] font-semibold">{s.opened_by_user_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{new Date(s.opened_at).toLocaleString('es-AR')}</div>
                          </td>
                          <td className="py-2.5 px-2">
                            {s.closed_at ? (
                              <>
                                <div className="text-[11px] font-semibold">{s.closed_by_user_name || '-'}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{new Date(s.closed_at).toLocaleString('es-AR')}</div>
                              </>
                            ) : (
                              <span className="text-emerald-400 font-bold italic">En curso...</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono">{formatMoney(Number(s.initial_cash))}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold">{formatMoney(Number(s.total_sales_amount || 0))}</td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-foreground">
                            {s.final_cash_real !== null ? formatMoney(Number(s.final_cash_real)) : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold">
                            {s.cash_difference !== null ? (
                              <span className={diff >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {diff > 0 ? `+${formatMoney(diff)}` : formatMoney(diff)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => {
                                  handlePrint('z_close', {
                                    periodLabel: `Turno: ${s.shift_name} (${new Date(s.opened_at).toLocaleDateString('es-AR')})`,
                                    ordersCount: s.total_orders_count || 0,
                                    fiscalInvoicesCount: s.total_orders_count || 0,
                                    totalSalesToday: Number(s.total_fiscal_net || 0) + Number(s.total_fiscal_vat || 0) || Number(s.total_sales_amount || 0),
                                    netFiscalToday: Number(s.total_fiscal_net || 0),
                                    vatFiscalToday: Number(s.total_fiscal_vat || 0),
                                    operatorName: s.closed_by_user_name || s.opened_by_user_name || 'Operador',
                                  })
                                }}
                                className="h-7 px-2 text-[10px] font-bold bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-800 rounded-lg"
                                title="Reimprimir Cierre Z Fiscal de este turno"
                              >
                                <ShieldAlert className="size-3 text-blue-400 mr-0.5" /> Z
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  handlePrint('cash_settlement', {
                                    shiftName: s.shift_name,
                                    periodLabel: `Turno: ${s.shift_name} (${new Date(s.opened_at).toLocaleDateString('es-AR')})`,
                                    ordersCount: s.total_orders_count || 0,
                                    totalSalesToday: Number(s.total_sales_amount || 0),
                                    salesByMethod: {
                                      efectivo: Number(s.total_cash_amount || 0),
                                      debito: Number(s.total_debit_amount || 0),
                                      credito: Number(s.total_credit_amount || 0),
                                      qr: Number(s.total_qr_amount || 0),
                                    },
                                    initialCash: Number(s.initial_cash || 0),
                                    expectedCash: Number(s.final_cash_expected || 0),
                                    realCash: Number(s.final_cash_real || 0),
                                    cashDifference: Number(s.cash_difference || 0),
                                    operatorName: s.closed_by_user_name || s.opened_by_user_name || 'Operador',
                                  })
                                }}
                                className="h-7 px-2 text-[10px] font-bold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 rounded-lg"
                                title="Reimprimir Rendición Operativa de este turno"
                              >
                                <Printer className="size-3 text-emerald-400 mr-0.5" /> Rendición
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL: CREAR / EDITAR PRODUCTO */}
        {newProductModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200 print:hidden">
            <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-black">{editingProduct ? 'Editar Producto' : 'Nuevo Producto en Carta'}</h3>
                <button onClick={() => setNewProductModalOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid gap-3 text-xs">
                <label className="block font-bold text-muted-foreground">
                  Nombre del Producto *
                  <input
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="Ej. T-Bone Steak 500g"
                    className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-semibold"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block font-bold text-muted-foreground">
                    Categoría *
                    <select
                      value={prodCatId}
                      onChange={(e) => setProdCatId(e.target.value)}
                      className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-semibold"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block font-bold text-muted-foreground">
                    Precio ($) *
                    <input
                      type="number"
                      value={prodPrice || ''}
                      onChange={(e) => setProdPrice(Number(e.target.value))}
                      placeholder="Ej. 19500"
                      className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-semibold"
                    />
                  </label>
                </div>

                <label className="block font-bold text-muted-foreground">
                  Detalle / Descripción
                  <input
                    value={prodDetail}
                    onChange={(e) => setProdDetail(e.target.value)}
                    placeholder="Ej. 500g · corte con hueso a la leña"
                    className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block font-bold text-muted-foreground">
                    Alícuota IVA
                    <select
                      value={prodVat}
                      onChange={(e) => setProdVat(Number(e.target.value))}
                      className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-semibold"
                    >
                      <option value="21.0">21.00% (General)</option>
                      <option value="10.5">10.50% (Reducido)</option>
                    </select>
                  </label>

                  <label className="block font-bold text-muted-foreground">
                    Estado Inicial
                    <select
                      value={prodActive ? 'true' : 'false'}
                      onChange={(e) => setProdActive(e.target.value === 'true')}
                      className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-semibold"
                    >
                      <option value="true">Disponible</option>
                      <option value="false">Agotado</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 border-t border-border pt-4">
                <Button
                  onClick={() => setNewProductModalOpen(false)}
                  className="flex-1 bg-secondary text-foreground hover:bg-zinc-800 font-bold py-2 rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  disabled={isSavingProd}
                  onClick={handleSaveProduct}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 rounded-xl text-xs"
                >
                  {isSavingProd ? 'Guardando...' : editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // PANTALLA DE LOGIN CON USUARIO Y CONTRASEÑA
  function LoginScreen() {
    const [idInput, setIdInput] = useState('')
    const [passInput, setPassInput] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [errMsg, setErrMsg] = useState<string | null>(null)
    const [loadingAuth, setLoadingAuth] = useState(false)

    const handleSubmit = async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      if (!idInput.trim() || !passInput.trim()) {
        setErrMsg('Por favor ingrese usuario o legajo y contraseña.')
        return
      }
      setLoadingAuth(true)
      setErrMsg(null)
      try {
        const res = await loginUserAction(idInput, passInput)
        if (res.success && res.user) {
          setActiveUser(res.user)
          setRole(res.user.defaultView || 'salon')
          try {
            sessionStorage.setItem('fuego_active_user', JSON.stringify(res.user))
            localStorage.setItem('fuego_active_user', JSON.stringify(res.user))
          } catch {}
          showNotification(`Sesión iniciada: ${res.user.name} (${res.user.legajo})`, 'success')
        } else {
          setErrMsg(res.error || 'Credenciales inválidas. Verifique usuario y contraseña.')
        }
      } catch (err: any) {
        setErrMsg(err?.message || 'Error al autenticar.')
      } finally {
        setLoadingAuth(false)
      }
    }

    const quickFill = (u: string, p: string) => {
      setIdInput(u)
      setPassInput(p)
      setErrMsg(null)
    }

    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-white overflow-hidden">
        {/* Marca de agua de fondo */}
        <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center select-none opacity-20 filter brightness-110">
          <img src="/logo.png" alt="1847" className="w-[600px] h-[600px] object-contain" />
        </div>

        <div className="relative z-10 w-full max-w-md bg-zinc-900/90 border border-zinc-800 rounded-3xl p-7 shadow-2xl backdrop-blur-md space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto size-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center p-2 shadow-inner">
              <img src="/logo.png" alt="1847 Logo" className="h-full w-full object-contain" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              1847 <span className="text-primary">-</span> parrilla & cerveceria
            </h1>
            <p className="text-xs text-zinc-400 font-medium">
              Control de Acceso Operativo & Auditoría
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errMsg && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs font-semibold animate-in shake">
                <AlertTriangle className="size-4 flex-shrink-0 text-red-400" />
                <span>{errMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Usuario o Legajo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <User className="size-4" />
                </div>
                <input
                  type="text"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  placeholder="natalia, cajero, parrillero..."
                  autoComplete="username"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-primary rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="size-4" />
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-primary rounded-xl pl-10 pr-12 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-zinc-500 hover:text-zinc-300 font-bold"
                >
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loadingAuth}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black py-3 rounded-xl text-sm shadow-lg shadow-orange-600/20 transition-all active:scale-[0.98]"
            >
              {loadingAuth ? 'Iniciando sesión...' : 'Ingresar al Sistema'}
            </Button>
          </form>

          {/* ACCESO RÁPIDO PARA EL PERSONAL */}
          <div className="border-t border-zinc-800/80 pt-4 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold text-center">
              Personal Registrado (Click para auto-completar):
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => quickFill('natalia', 'admin1847')}
                className="flex items-center justify-between p-2 rounded-xl bg-purple-950/20 border border-purple-500/30 hover:bg-purple-950/40 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-[10px]">NA</span>
                  <div>
                    <span className="font-bold text-white">Natalia (Admin)</span>
                    <span className="text-[10px] text-purple-300 font-mono ml-1.5">[ADM-001]</span>
                  </div>
                </div>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded">Acceso Total</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('cajero', 'caja1847')}
                className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30 hover:bg-emerald-950/40 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">CA</span>
                  <div>
                    <span className="font-bold text-white">Cajero</span>
                    <span className="text-[10px] text-emerald-300 font-mono ml-1.5">[CAJ-001]</span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded">Solo Caja</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('parrillero', 'fuego1847')}
                className="flex items-center justify-between p-2 rounded-xl bg-orange-950/20 border border-orange-500/30 hover:bg-orange-950/40 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-lg bg-orange-600 text-white flex items-center justify-center font-bold text-[10px]">PA</span>
                  <div>
                    <span className="font-bold text-white">Parrillero</span>
                    <span className="text-[10px] text-orange-300 font-mono ml-1.5">[PAR-001]</span>
                  </div>
                </div>
                <span className="text-[10px] bg-orange-500/20 text-orange-300 font-bold px-2 py-0.5 rounded">Solo KDS Carnes</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('cocinero', 'cocina1847')}
                className="flex items-center justify-between p-2 rounded-xl bg-sky-950/20 border border-sky-500/30 hover:bg-sky-950/40 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-[10px]">CO</span>
                  <div>
                    <span className="font-bold text-white">Cocinero</span>
                    <span className="text-[10px] text-sky-300 font-mono ml-1.5">[COC-001]</span>
                  </div>
                </div>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 font-bold px-2 py-0.5 rounded">Solo KDS Cocina</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('mozo', 'salon1847')}
                className="flex items-center justify-between p-2 rounded-xl bg-indigo-950/20 border border-indigo-500/30 hover:bg-indigo-950/40 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="size-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">MO</span>
                  <div>
                    <span className="font-bold text-white">Mozo</span>
                    <span className="text-[10px] text-indigo-300 font-mono ml-1.5">[MOZ-001]</span>
                  </div>
                </div>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded">Solo Salón</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // RENDER GENERAL DEL DASHBOARD
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white p-4">
        <Loader2 />
      </div>
    )
  }

  // SI NO HAY USUARIO AUTENTICADO, MOSTRAR LOGIN
  if (!activeUser) {
    return <LoginScreen />
  }

  const content = {
    salon: <SalonView />,
    takeaway: <TakeAwayView />,
    cashier: <CashierView />,
    kitchen: <KitchenView />,
    admin: <AdminView />,
  }[role]

  return (
    <main className="relative min-h-screen bg-background overflow-hidden">
      {/* BRAND WATERMARK BACKGROUND */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center p-8 select-none print:hidden">
        <img
          src="/logo.png"
          alt="1847 Marca de Agua"
          className="w-[750px] h-[750px] max-w-[88vw] max-h-[88vh] object-contain opacity-[0.35] filter brightness-125 transition-opacity"
        />
      </div>

      <Header />

      {notification && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 duration-200 print:hidden">
          <div
            className={`flex items-center gap-2 rounded-xl border p-4 shadow-xl text-xs font-bold ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/55 text-emerald-400'
                : notification.type === 'warn'
                ? 'bg-amber-950/90 border-amber-500/55 text-amber-400'
                : 'bg-zinc-900/90 border-zinc-800 text-white'
            }`}
          >
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-[1500px] p-4 lg:p-8 print:hidden">{content}</div>

      {orderOpen && <OrderDialogComponent close={() => setOrderOpen(false)} />}

      {/* MODAL DE SELECCIÓN DE DÍA PUNTUAL O PERÍODO PARA IMPRESIÓN (Z FISCAL O RENDICIÓN) */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200 print:hidden">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                {printReportType === 'z_close' ? (
                  <div className="p-2 rounded-xl bg-blue-950/80 border border-blue-800 text-blue-400">
                    <ShieldAlert className="size-5" />
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                    <Printer className="size-5" />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-black">
                    {printReportType === 'z_close' ? 'Cierre Z Fiscal Oficial (ARCA)' : 'Rendición Operativa de Salón & Caja'}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {printReportType === 'z_close'
                      ? 'Auditoría impositiva con CAE emitido ante inspectores'
                      : 'Conciliación de recaudación física, comandas y arqueo'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPrintModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* SELECTOR DE MODO: DÍA PUNTUAL O PERÍODO DE DÍAS */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Modalidad de Selección
              </label>
              <div className="grid grid-cols-2 gap-2 bg-secondary/40 p-1 rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setPrintRangeType('day')}
                  className={`py-2 rounded-lg text-xs font-extrabold transition-all ${
                    printRangeType === 'day'
                      ? 'bg-primary text-white shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📌 Día Puntual
                </button>
                <button
                  type="button"
                  onClick={() => setPrintRangeType('range')}
                  className={`py-2 rounded-lg text-xs font-extrabold transition-all ${
                    printRangeType === 'range'
                      ? 'bg-primary text-white shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  📆 Período de Días (Rango)
                </button>
              </div>
            </div>

            {/* SELECTOR DE FECHAS */}
            {printRangeType === 'day' ? (
              <div className="space-y-3 bg-card border border-border rounded-xl p-3.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-foreground">
                    Seleccionar Día Específico:
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={printDateSingle}
                      onChange={(e) => setPrintDateSingle(e.target.value)}
                      max={todayIsoDate}
                      className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* SELECTOR DE TURNO ESPECÍFICO (MEDIODÍA / NOCHE / DÍA COMPLETO) */}
                <div className="space-y-1.5 pt-2 border-t border-border/60">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-foreground">
                      Franja / Turno a Auditar:
                    </label>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {printShiftFilter === 'mediodia' && 'Almuerzos (10:00 a 17:30 hs)'}
                      {printShiftFilter === 'noche' && 'Cenas (17:30 a cierre)'}
                      {printShiftFilter === 'all' && 'Ambos turnos sumados'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 bg-secondary/40 p-1 rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setPrintShiftFilter('mediodia')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                        printShiftFilter === 'mediodia'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ☀️ Mediodía
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintShiftFilter('noche')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                        printShiftFilter === 'noche'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      🌙 Noche
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintShiftFilter('all')}
                      className={`py-1.5 px-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                        printShiftFilter === 'all'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      🔄 Día Completo
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 bg-card border border-border rounded-xl p-3.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-foreground">
                    Desde Fecha:
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={printDateStart}
                      onChange={(e) => setPrintDateStart(e.target.value)}
                      max={printDateEnd}
                      className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-foreground">
                    Hasta Fecha:
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <input
                      type="date"
                      value={printDateEnd}
                      onChange={(e) => setPrintDateEnd(e.target.value)}
                      min={printDateStart}
                      max={todayIsoDate}
                      className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* BOTONES PREESTABLECIDOS RÁPIDOS */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground mr-1">Accesos rápidos:</span>
              <button
                type="button"
                onClick={() => {
                  setPrintRangeType('day')
                  setPrintDateSingle(todayIsoDate)
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  printRangeType === 'day' && printDateSingle === todayIsoDate
                    ? 'bg-primary text-white border-primary'
                    : 'bg-secondary/60 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintRangeType('day')
                  const y = new Date(Date.now() - 86400000).toISOString().split('T')[0]
                  setPrintDateSingle(y)
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  printRangeType === 'day' && printDateSingle !== todayIsoDate
                    ? 'bg-primary text-white border-primary'
                    : 'bg-secondary/60 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Ayer
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintRangeType('range')
                  const now = new Date()
                  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
                  setPrintDateStart(d7)
                  setPrintDateEnd(todayIsoDate)
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                  printRangeType === 'range' && printDateEnd === todayIsoDate && printDateStart !== todayIsoDate
                    ? 'bg-primary text-white border-primary'
                    : 'bg-secondary/60 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Últimos 7 Días
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintRangeType('range')
                  const now = new Date()
                  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
                  setPrintDateStart(firstDayOfMonth)
                  setPrintDateEnd(todayIsoDate)
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-secondary/60 text-muted-foreground border-border hover:text-foreground transition-all"
              >
                Mes en Curso
              </button>
            </div>

            {/* VISTA PREVIA EN VIVO DE LOS DATOS QUE SALDRÁN EN EL TICKET */}
            <div className="bg-secondary/20 border border-border/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                <span className="font-bold text-muted-foreground">Datos Calculados a Imprimir:</span>
                <span className="font-mono font-bold text-primary">
                  {periodMetrics?.periodLabel || (activeStartDate === activeEndDate ? `Día: ${activeStartDate}` : `Período: ${activeStartDate} al ${activeEndDate}`)}
                </span>
              </div>

              {isCalculatingPeriod ? (
                <div className="py-4 text-center text-muted-foreground animate-pulse font-medium">
                  Calculando cifras del período seleccionado...
                </div>
              ) : (
                <>
                  {printReportType === 'z_close' ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span>Comprobantes con CAE Emitidos:</span>
                        <span className="font-mono font-bold text-blue-400">
                          {periodMetrics?.fiscal?.invoicesCount || periodMetrics?.ordersCountToday || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Subtotal Neto Gravado (21%):</span>
                        <span className="font-mono font-bold">{formatMoney(periodMetrics?.fiscal?.netAmount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-primary">
                        <span>IVA Débito Fiscal a Ingresar:</span>
                        <span className="font-mono font-bold">{formatMoney(periodMetrics?.fiscal?.vatAmount || 0)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1.5 font-bold text-sm text-blue-300">
                        <span>Total Oficial Declarado ARCA:</span>
                        <span className="font-mono">{formatMoney(periodMetrics?.fiscal?.totalInvoiced || periodMetrics?.totalSalesToday || 0)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span>Comandas / Cuentas de Salón & Barra:</span>
                        <span className="font-mono font-bold text-foreground">{periodMetrics?.ordersCountToday || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Efectivo Cobrado en Mano:</span>
                        <span className="font-mono font-bold text-emerald-400">{formatMoney(periodMetrics?.salesByMethod?.efectivo || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tarjetas Débito / Crédito / QR:</span>
                        <span className="font-mono font-bold">
                          {formatMoney((periodMetrics?.salesByMethod?.debito || 0) + (periodMetrics?.salesByMethod?.credito || 0) + (periodMetrics?.salesByMethod?.qr || 0))}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1.5 font-bold text-sm text-emerald-300">
                        <span>Recaudación Total del Período:</span>
                        <span className="font-mono">{formatMoney(periodMetrics?.totalSalesToday || 0)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* BOTONES DE ACCIÓN */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleExecutePrintCustomPeriod}
                disabled={isCalculatingPeriod}
                className={`flex-1 gap-2 text-white font-black py-2.5 rounded-xl text-xs shadow-lg transition-all ${
                  printReportType === 'z_close'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <Printer className="size-4" /> Imprimir Ticket Térmico ({printReportType === 'z_close' ? 'Z Fiscal' : 'Rendición'})
              </Button>
              <Button
                onClick={() => setPrintModalOpen(false)}
                className="bg-secondary text-foreground hover:bg-zinc-800 font-bold px-4 py-2.5 rounded-xl text-xs"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONTENEDOR DE IMPRESIÓN TÉRMICA (MOSTRADO SOLO EN WINDOW.PRINT) */}
      {receiptData && <ThermalReceipt type={receiptData.type} data={receiptData.data} />}

      {/* BARRA FLOTANTE DE CONTROL DE SIMULACIÓN / PRUEBAS DEMO (COLAPSABLE EN MOBILE/TABLET) */}
      <div className="fixed bottom-3 left-3 z-40 print:hidden">
        {!demoPanelExpanded ? (
          <button
            onClick={() => setDemoPanelExpanded(true)}
            className="flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-zinc-950/85 hover:bg-zinc-900 text-orange-400 px-3 py-1.5 text-xs font-bold shadow-lg backdrop-blur-md transition-all active:scale-95"
            title="Abrir panel de simulación de pruebas"
          >
            <Flame className="size-3.5 text-orange-500 animate-pulse" />
            <span>Simulador</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-orange-500/40 bg-zinc-950/95 p-3 sm:p-3.5 text-white shadow-2xl backdrop-blur-md max-w-[280px] sm:max-w-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="flex size-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-mono text-xs font-black tracking-wider text-orange-400 uppercase">Simulación</span>
              </div>
              <button
                onClick={() => setDemoPanelExpanded(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800 text-xs font-bold leading-none"
                title="Minimizar panel"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">Flujo en vivo sin depender de BD:</p>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={runFullShiftSimulation}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs p-2.5 shadow transition-all active:scale-95"
                title="Carga mesas ocupadas, comandas KDS con tiempos y métricas de admin"
              >
                <Flame className="size-4" /> Turno
              </button>

              <button
                onClick={runCustomerOrderSimulation}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs p-2.5 shadow transition-all active:scale-95"
                title="Simula un nuevo cliente enviando un pedido por QR con sonido de alerta"
              >
                <Bell className="size-4" /> Cliente
              </button>
            </div>
          </div>
        )}
      </div>



      {/* FUNCIÓN UNIFICADA DE APERTURA FORMAL DE TURNO DE CAJA */}
      {(() => {
        return null
      })()}

      {/* CARTEL GRANDE BLOQUEANTE: APERTURA DE TURNO OBLIGATORIA (NO PERMITE CONTINUAR SIN ABRIR TURNO) */}
      {!activeShift && role !== 'kitchen' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-in fade-in duration-200 print:hidden">
          <div className="w-full max-w-lg rounded-3xl bg-zinc-950 border-2 border-amber-500/80 p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.25)] space-y-6 text-white animate-in zoom-in-95 duration-250">
            <div className="flex flex-col items-center text-center space-y-2.5">
              <div className="size-20 rounded-2xl bg-amber-500/20 border-2 border-amber-500/50 flex items-center justify-center text-amber-400 mb-1 shadow-inner">
                <AlertTriangle className="size-11 animate-pulse" />
              </div>
              <span className="font-mono text-xs font-black tracking-widest text-amber-400 uppercase bg-amber-500/15 border border-amber-500/40 px-3.5 py-1 rounded-full">
                Control de Caja & Operaciones · 1847
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Turno de Caja Cerrado
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 max-w-md leading-relaxed">
                Para comenzar la jornada (cargar pedidos en Salón, despachar Take Away o realizar cobros en Caja), es <b>obligatorio</b> abrir el turno e ingresar el fondo inicial de caja.
              </p>
            </div>

            <div className="space-y-4 bg-zinc-900/90 p-4 sm:p-5 rounded-2xl border border-zinc-800">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300">
                  Nombre o Identificador del Turno:
                  <input
                    value={shiftNameInput}
                    onChange={(e) => setShiftNameInput(e.target.value)}
                    placeholder="Ej. Turno Almuerzo / Turno Noche"
                    className="mt-1.5 w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl p-3 text-white font-semibold text-sm outline-none transition-colors"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShiftNameInput('Turno Mediodía')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      shiftNameInput === 'Turno Mediodía'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    ☀️ Mediodía (Almuerzos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftNameInput('Turno Noche')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      shiftNameInput === 'Turno Noche'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    🌙 Noche (Cenas)
                  </button>
                </div>
              </div>

              <label className="block text-xs font-bold text-zinc-300">
                Fondo Inicial de Caja en Efectivo ($):
                <input
                  type="number"
                  value={initialCashInput || ''}
                  onChange={(e) => setInitialCashInput(Number(e.target.value))}
                  placeholder="Ej. 50000"
                  className="mt-1.5 w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl p-3 text-emerald-400 font-mono font-bold text-base outline-none transition-colors"
                />
              </label>

              <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span>Operador responsable:</span>
                  <span className="font-bold text-zinc-200">{activeUser?.name || 'Operador'} ({activeUser?.legajo || 'S/L'})</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Fecha y Hora:</span>
                  <span className="font-mono text-zinc-300">{new Date().toLocaleString('es-AR')}</span>
                </div>
              </div>
            </div>

            <Button
              disabled={isOpeningShift}
              onClick={async () => {
                setIsOpeningShift(true)
                try {
                  if (dbConnected) {
                    const res = await openCashRegisterShiftAction(
                      {
                        shiftName: shiftNameInput || 'Turno General',
                        initialCash: initialCashInput || 0,
                      },
                      activeUser!
                    )
                    if (res.success && res.shift) {
                      setActiveShift(res.shift)
                      try {
                        localStorage.setItem('fuego_live_shift', JSON.stringify(res.shift))
                      } catch {}
                      broadcastAction({
                        type: 'SHIFT_OPENED',
                        payload: { shift: res.shift },
                      })
                      showNotification(`Turno "${res.shift.shift_name}" abierto con éxito. ¡Actividad habilitada!`, 'success')
                      setOpenShiftModalOpen(false)
                    } else {
                      showNotification(res.error || 'Error al abrir turno.', 'warn')
                    }
                  } else {
                    const mockShift: CashRegisterShiftRow = {
                      id: `shift-${Date.now()}`,
                      shift_name: shiftNameInput || 'Turno General',
                      status: 'open',
                      opened_at: new Date().toISOString(),
                      opened_by_user_id: activeUser?.id || 'usr-demo',
                      opened_by_user_name: activeUser ? formatAuditUserLabel(activeUser) : 'Operador',
                      initial_cash: initialCashInput || 0,
                      closed_at: null,
                      closed_by_user_id: null,
                      closed_by_user_name: null,
                      final_cash_expected: null,
                      final_cash_real: null,
                      cash_difference: null,
                      total_orders_count: 0,
                      total_sales_amount: 0,
                      total_cash_amount: 0,
                      total_debit_amount: 0,
                      total_credit_amount: 0,
                      total_qr_amount: 0,
                      total_fiscal_net: 0,
                      total_fiscal_vat: 0,
                      notes: null,
                      created_at: new Date().toISOString(),
                    }
                    setActiveShift(mockShift)
                    try {
                      localStorage.setItem('fuego_live_shift', JSON.stringify(mockShift))
                    } catch {}
                    broadcastAction({
                      type: 'SHIFT_OPENED',
                      payload: { shift: mockShift },
                    })
                    showNotification(`Turno "${mockShift.shift_name}" abierto en memoria local. ¡Actividad habilitada!`, 'success')
                    setOpenShiftModalOpen(false)
                  }
                } catch (e: any) {
                  showNotification(e?.message || 'Error al abrir turno', 'warn')
                } finally {
                  setIsOpeningShift(false)
                }
              }}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-4 rounded-2xl text-sm sm:text-base shadow-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
            >
              {isOpeningShift ? (
                <span>Abriendo turno...</span>
              ) : (
                <>
                  <Lock className="size-5" />
                  <span>ABRIR TURNO E INICIAR ACTIVIDAD</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* MODAL DE APERTURA MANUAL DE TURNO DE CAJA (CUANDO YA HAY UN TURNO ACTIVO) */}
      {openShiftModalOpen && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="size-5 text-emerald-400" />
                <h3 className="text-base font-black">Apertura de Turno de Caja</h3>
              </div>
              <button onClick={() => setOpenShiftModalOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Ya existe un turno activo. Si desea abrir uno nuevo, cierre el turno actual mediante el Cierre Z.
            </p>

            <div className="border-t border-border pt-4">
              <Button
                onClick={() => setOpenShiftModalOpen(false)}
                className="w-full bg-secondary text-foreground hover:bg-zinc-800 font-bold py-2 rounded-xl text-xs"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ANULACIÓN DE ÍTEM CON JUSTIFICACIÓN */}
      {itemToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-card border border-destructive/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" />
                <h3 className="text-base font-black text-destructive">Anulación de Ítem con Auditoría</h3>
              </div>
              <button onClick={() => setItemToCancel(null)} className="rounded p-1 text-muted-foreground hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Esta operación reincorporará las porciones al inventario, recalculará el total de la comanda y registrará al usuario autorizante en la bitácora:
            </p>

            <div className="bg-secondary/40 p-3 rounded-xl border border-border text-xs space-y-1">
              <div className="flex justify-between font-bold text-foreground">
                <span>{itemToCancel.item.quantity}× {itemToCancel.item.products?.name || 'Producto'}</span>
                <span className="font-mono">{formatMoney(itemToCancel.item.quantity * itemToCancel.item.unit_price)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Precio unitario: {formatMoney(itemToCancel.item.unit_price)}</div>
            </div>

            <label className="block text-xs font-bold text-muted-foreground">
              Motivo de Anulación (Obligatorio) *:
              <select
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded-xl p-2.5 text-foreground font-semibold"
              >
                <option value="">Seleccione o escriba un motivo...</option>
                <option value="Error de tipeo / carga">Error de tipeo / carga</option>
                <option value="Comensal canceló plato">Comensal canceló plato</option>
                <option value="Demora excesiva en cocina">Demora excesiva en cocina</option>
                <option value="Falta de insumos / quiebre de stock">Falta de insumos / quiebre de stock</option>
                <option value="Plato devuelto / inconformidad">Plato devuelto / inconformidad</option>
              </select>
            </label>

            <input
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              placeholder="O detalle motivo personalizado..."
              className="w-full bg-background border border-border rounded-xl p-2.5 text-foreground text-xs"
            />

            <div className="bg-secondary/20 p-2.5 rounded-lg border border-border/40 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Operador responsable:</span> {activeUser?.name || 'Operador'} ({activeUser?.legajo || 'S/L'})
            </div>

            <div className="flex gap-2 border-t border-border pt-4">
              <Button
                onClick={() => setItemToCancel(null)}
                className="flex-1 bg-secondary text-foreground hover:bg-zinc-800 font-bold py-2 rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                disabled={isCancellingItem || !cancelReasonInput.trim()}
                onClick={async () => {
                  if (!cancelReasonInput.trim()) {
                    showNotification('Debe indicar el motivo de la anulación.', 'warn')
                    return
                  }
                  setIsCancellingItem(true)
                  try {
                    if (dbConnected) {
                      const res = await cancelOrderItemAction(
                        {
                          orderId: itemToCancel.orderId,
                          orderItemId: itemToCancel.item.id,
                          reason: cancelReasonInput.trim(),
                        },
                        activeUser!
                      )
                      if (res.success) {
                        showNotification('Ítem anulado con éxito. Stock restablecido y auditoría registrada.', 'success')
                        setItemToCancel(null)
                        await loadDashboardData()
                      } else {
                        showNotification(res.error || 'Error al anular ítem.', 'warn')
                      }
                    } else {
                      // Fallback local en memoria
                      setOrders((curr) =>
                        curr.map((o) => {
                          if (o.id !== itemToCancel.orderId) return o
                          const updatedItems = o.order_items.map((it) =>
                            it.id === itemToCancel.item.id
                              ? { ...it, status: 'cancelled' as const, cancel_reason: cancelReasonInput }
                              : it
                          )
                          const activeSub = updatedItems
                            .filter((it) => it.status !== 'cancelled')
                            .reduce((sum, it) => sum + it.quantity * it.unit_price, 0)
                          return {
                            ...o,
                            order_items: updatedItems,
                            subtotal: activeSub,
                            total: activeSub - activeSub * (Number(o.discount_pct || 0) / 100),
                          }
                        })
                      )
                      showNotification('Ítem anulado en memoria local.', 'success')
                      setItemToCancel(null)
                    }
                  } catch (e: any) {
                    showNotification(e?.message || 'Error al anular ítem.', 'warn')
                  } finally {
                    setIsCancellingItem(false)
                  }
                }}
                className="flex-1 bg-destructive hover:bg-red-700 text-white font-bold py-2 rounded-xl text-xs"
              >
                {isCancellingItem ? 'Anulando...' : 'Confirmar Anulación'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function Loader2() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <span className="text-xs text-muted-foreground font-semibold">Cargando 1847 - parrilla & cerveceria...</span>
    </div>
  )
}
