'use server'

import { supabaseAdmin } from '@/lib/supabase'
import {
  TableRow,
  CategoryRow,
  ProductRow,
  OrderRow,
  OrderItemRow,
  InventoryStockRow,
} from '@/types/database.types'

export interface InitialDashboardData {
  success: boolean
  tables: TableRow[]
  categories: CategoryRow[]
  products: ProductRow[]
  orders: (OrderRow & {
    order_items: (OrderItemRow & {
      products: { name: string; detail: string | null; price: number } | null
    })[]
  })[]
  inventory: (InventoryStockRow & {
    products: { name: string } | null
  })[]
  error?: string
}

/**
 * 1. Obtener todos los datos iniciales necesarios para el dashboard consolidados en una única petición.
 */
export async function getInitialDashboardData(): Promise<InitialDashboardData> {
  try {
    // A. Consultar mesas
    const { data: tables, error: tablesError } = await supabaseAdmin
      .from('tables')
      .select('*')
      .order('number', { ascending: true })

    if (tablesError || !tables) {
      throw new Error(`Error al cargar mesas: ${tablesError.message}`)
    }

    // B. Consultar categorías
    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('name', { ascending: true })

    if (categoriesError || !categories) {
      throw new Error(`Error al cargar categorías: ${categoriesError.message}`)
    }

    // C. Consultar todos los productos
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('name', { ascending: true })

    if (productsError || !products) {
      throw new Error(`Error al cargar productos: ${productsError.message}`)
    }

    // D. Consultar comandas abiertas (con sus ítems y datos de producto)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*, products(name, detail, price))')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (ordersError || !orders) {
      throw new Error(`Error al cargar comandas: ${ordersError.message}`)
    }

    // E. Consultar stock del inventario
    const { data: inventory, error: inventoryError } = await supabaseAdmin
      .from('inventory_stock')
      .select('*, products(name)')
      .order('name', { ascending: true })

    if (inventoryError || !inventory) {
      throw new Error(`Error al cargar inventario: ${inventoryError.message}`)
    }

    return {
      success: true,
      tables,
      categories,
      products,
      orders: orders as any,
      inventory: inventory as any,
    }
  } catch (error: any) {
    return {
      success: false,
      tables: [],
      categories: [],
      products: [],
      orders: [],
      inventory: [],
      error: error.message || 'Error inesperado del servidor.',
    }
  }
}

export interface AdminMetrics {
  success: boolean
  totalSalesToday: number
  totalSalesMonth: number
  averageTicketToday: number
  ordersCountToday: number
  salesByMethod: {
    efectivo: number
    debito: number
    credito: number
    qr: number
  }
  fiscal: {
    netAmount: number
    vatAmount: number
    totalInvoiced: number
    invoicesCount: number
  }
  operational: {
    totalNonInvoiced: number
    nonInvoicedCount: number
  }
  periodLabel?: string
  error?: string
}

/**
 * 2. Obtener métricas de negocio para el panel de administración
 * Basadas en las órdenes cerradas en el día o en el período solicitado.
 */
export async function getAdminMetricsAction(dateFilter?: {
  startDate?: string
  endDate?: string
}): Promise<AdminMetrics> {
  try {
    let startIso: string
    let endIso: string
    let periodLabel: string

    if (dateFilter?.startDate) {
      const [sYear, sMonth, sDay] = dateFilter.startDate.split('-').map(Number)
      const sDate = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0)
      startIso = sDate.toISOString()

      if (dateFilter.endDate && dateFilter.endDate !== dateFilter.startDate) {
        const [eYear, eMonth, eDay] = dateFilter.endDate.split('-').map(Number)
        const eDate = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999)
        endIso = eDate.toISOString()
        periodLabel = `Período: ${sDay.toString().padStart(2, '0')}/${sMonth.toString().padStart(2, '0')}/${sYear} al ${eDay.toString().padStart(2, '0')}/${eMonth.toString().padStart(2, '0')}/${eYear}`
      } else {
        const eDate = new Date(sYear, sMonth - 1, sDay, 23, 59, 59, 999)
        endIso = eDate.toISOString()
        periodLabel = `Día: ${sDay.toString().padStart(2, '0')}/${sMonth.toString().padStart(2, '0')}/${sYear}`
      }
    } else {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      startIso = startOfToday.toISOString()

      const endOfToday = new Date()
      endOfToday.setHours(23, 59, 59, 999)
      endIso = endOfToday.toISOString()
      periodLabel = `Hoy (${new Date().toLocaleDateString('es-AR')})`
    }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfMonthIso = startOfMonth.toISOString()

    // A. Consultar órdenes cerradas en el rango solicitado
    const { data: ordersToday, error: errorToday } = await supabaseAdmin
      .from('orders')
      .select('total, payment_method, id')
      .eq('status', 'closed')
      .gte('closed_at', startIso)
      .lte('closed_at', endIso)

    if (errorToday || !ordersToday) {
      throw new Error(`Error al consultar ventas del período: ${errorToday.message}`)
    }

    // B. Consultar ventas totales del mes
    const { data: ordersMonth, error: errorMonth } = await supabaseAdmin
      .from('orders')
      .select('total')
      .eq('status', 'closed')
      .gte('closed_at', startOfMonthIso)

    if (errorMonth || !ordersMonth) {
      throw new Error(`Error al consultar ventas del mes: ${errorMonth.message}`)
    }

    // C. Consultar facturación fiscal en el rango solicitado (invoices_arca)
    const { data: invoicesToday, error: errorInvoices } = await supabaseAdmin
      .from('invoices_arca')
      .select('net_amount, vat_amount, total_amount')
      .eq('status', 'approved')
      .gte('created_at', startIso)
      .lte('created_at', endIso)

    if (errorInvoices || !invoicesToday) {
      throw new Error(`Error al consultar facturación fiscal: ${errorInvoices.message}`)
    }

    // 1. Cálculos de ventas
    const totalSalesToday = ordersToday.reduce((sum, o) => sum + Number(o.total), 0)
    const totalSalesMonth = ordersMonth.reduce((sum, o) => sum + Number(o.total), 0)
    const ordersCountToday = ordersToday.length
    const averageTicketToday = ordersCountToday > 0 ? totalSalesToday / ordersCountToday : 0

    // 2. Desglose por método de pago
    const salesByMethod = {
      efectivo: 0,
      debito: 0,
      credito: 0,
      qr: 0,
    }

    ordersToday.forEach((o) => {
      const method = o.payment_method as keyof typeof salesByMethod
      if (method && method in salesByMethod) {
        salesByMethod[method] += Number(o.total)
      }
    })

    // 3. Resumen fiscal del período (ARCA)
    const totalFiscalInvoiced = invoicesToday.reduce((sum, inv) => sum + Number(inv.total_amount), 0)
    const fiscal = {
      netAmount: invoicesToday.reduce((sum, inv) => sum + Number(inv.net_amount), 0),
      vatAmount: invoicesToday.reduce((sum, inv) => sum + Number(inv.vat_amount), 0),
      totalInvoiced: totalFiscalInvoiced,
      invoicesCount: invoicesToday.length,
    }

    // 4. Resumen operativo de salón (Comprobantes X)
    const totalNonInvoiced = Math.max(0, totalSalesToday - totalFiscalInvoiced)
    const nonInvoicedCount = Math.max(0, ordersCountToday - invoicesToday.length)
    const operational = {
      totalNonInvoiced,
      nonInvoicedCount,
    }

    return {
      success: true,
      totalSalesToday,
      totalSalesMonth,
      averageTicketToday,
      ordersCountToday,
      periodLabel,
      salesByMethod,
      fiscal,
      operational,
    }
  } catch (error: any) {
    return {
      success: false,
      totalSalesToday: 0,
      totalSalesMonth: 0,
      averageTicketToday: 0,
      ordersCountToday: 0,
      salesByMethod: { efectivo: 0, debito: 0, credito: 0, qr: 0 },
      fiscal: { netAmount: 0, vatAmount: 0, totalInvoiced: 0, invoicesCount: 0 },
      operational: { totalNonInvoiced: 0, nonInvoicedCount: 0 },
      error: error.message || 'Error al compilar métricas.',
    }
  }
}
