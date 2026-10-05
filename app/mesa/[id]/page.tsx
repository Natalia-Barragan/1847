'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { Check, Flame, ShoppingBag, ShoppingCart, Plus, Minus, ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { openOrderAction } from '@/app/actions/orders'
import { getInitialDashboardData } from '@/app/actions/queries'
import { ProductRow, CategoryRow } from '@/types/database.types'

const formatMoney = (value: number) => `$ ${value.toLocaleString('es-AR')}`

interface CartItem {
  product: ProductRow
  qty: number
  notes?: string
}

export default function MesaQRPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const tableNumber = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderSent, setOrderSent] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Cargar datos del menú y validar que la mesa sea válida
  useEffect(() => {
    async function loadData() {
      try {
        const res = await getInitialDashboardData()
        if (!res.success) {
          setErrorMsg('Error al conectar con el servidor.')
          setLoading(false)
          return
        }

        // Validar si la mesa existe en la BD
        const tableExists = res.tables.some((t) => t.number === tableNumber)
        if (!tableExists) {
          setErrorMsg(`La mesa número "${tableNumber}" no está registrada en el sistema.`)
          setLoading(false)
          return
        }

        setCategories(res.categories)
        setProducts(res.products)
        if (res.categories.length > 0) {
          setActiveCategory(res.categories[0].id)
        }
      } catch (err) {
        setErrorMsg('Error inesperado al cargar el menú.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [tableNumber])

  // Filtrar productos por categoría activa
  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.category_id === activeCategory)
  }, [products, activeCategory])

  // Agregar al carrito
  const addToCart = (product: ProductRow) => {
    setCart((curr) => {
      const idx = curr.findIndex((item) => item.product.id === product.id)
      if (idx > -1) {
        const newCart = [...curr]
        newCart[idx].qty += 1
        return newCart
      } else {
        return [...curr, { product, qty: 1 }]
      }
    })
  }

  // Quitar / Restar del carrito
  const removeFromCart = (productId: string) => {
    setCart((curr) => {
      const idx = curr.findIndex((item) => item.product.id === productId)
      if (idx === -1) return curr
      const newCart = [...curr]
      if (newCart[idx].qty > 1) {
        newCart[idx].qty -= 1
        return newCart
      } else {
        return newCart.filter((item) => item.product.id !== productId)
      }
    })
  }

  // Cambiar notas del ítem
  const updateItemNotes = (productId: string, notes: string) => {
    setCart((curr) =>
      curr.map((item) =>
        item.product.id === productId ? { ...item, notes } : item
      )
    )
  }

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0)
  const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0)

  // Enviar pedido a cocina
  const handleSubmitOrder = async () => {
    if (cart.length === 0) return
    if (!customerName.trim()) {
      setErrorMsg('Por favor ingresá tu nombre para que identifiquemos tu pedido.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')

    try {
      const orderItems = cart.map((item) => ({
        productId: item.product.id,
        quantity: item.qty,
        notes: item.notes,
      }))

      const res = await openOrderAction({
        tableNumber: tableNumber,
        origin: 'qr',
        customerName: customerName.trim(),
        items: orderItems,
      })

      if (res.success) {
        setOrderSent(true)
        setCart([])
      } else {
        setErrorMsg(res.error || 'Error al enviar la comanda.')
      }
    } catch (err) {
      setErrorMsg('Error de red al enviar el pedido.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white p-4">
        <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
        <p className="mt-4 text-sm text-zinc-400 font-medium">Cargando la carta de 1847 - parrilla & cerveceria...</p>
      </div>
    )
  }

  if (errorMsg && !orderSent && products.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center">
        <div className="rounded-full bg-red-950/50 p-4 text-red-500 border border-red-900/50 mb-4">
          <Flame className="h-12 w-12" />
        </div>
        <h2 className="text-xl font-bold mb-2">Acceso Inválido</h2>
        <p className="text-zinc-400 max-w-sm mb-6 text-sm">{errorMsg}</p>
        <p className="text-xs text-zinc-600">Por favor, escaneá el código QR ubicado en tu mesa.</p>
      </div>
    )
  }

  if (orderSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center">
        <div className="rounded-full bg-emerald-950/50 p-4 text-emerald-500 border border-emerald-900/50 mb-6 animate-bounce">
          <Check className="h-12 w-12" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-white mb-2">¡Pedido Enviado!</h2>
        <p className="text-zinc-400 max-w-sm text-sm mb-8">
          Tu comanda ya está en Cocina. Prepararemos tus platos de inmediato para la <span className="font-bold text-orange-400">Mesa {tableNumber}</span>.
        </p>
        <Button onClick={() => setOrderSent(false)} className="bg-orange-500 text-white hover:bg-orange-600 font-semibold px-6 py-2 rounded-xl">
          Pedir algo más
        </Button>
      </div>
    )
  }

  return (
    <main className="relative min-h-screen bg-zinc-950 text-white pb-32 overflow-hidden">
      {/* BRAND WATERMARK BACKGROUND */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center p-6 select-none">
        <img
          src="/logo.png"
          alt="1847 Marca de Agua"
          className="w-[600px] h-[600px] max-w-[88vw] max-h-[80vh] object-contain opacity-[0.35] filter brightness-125"
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur px-4 py-4">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 p-1 border border-orange-500/30 overflow-hidden">
              <img src="/logo.png" alt="1847 - parrilla & cerveceria" className="h-full w-full object-contain" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-none">1847 - parrilla & cerveceria</h1>
              <p className="text-[10px] uppercase tracking-wider text-orange-500 font-bold mt-1">Mesa {tableNumber}</p>
            </div>
          </div>
          <span className="text-xs text-zinc-400 font-semibold">Carta Digital</span>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 mt-6">
        {/* Identificación */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-2">¿Quién pide en la mesa?</h3>
          <input
            type="text"
            placeholder="Ej. Juan Pérez / Familia Gómez"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </section>

        {/* Categorías */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-none sticky top-[68px] z-10 bg-zinc-950/95 py-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeCategory === cat.id
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-950/20'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Listado de Productos */}
        <section className="mt-4 space-y-3">
          {filteredProducts.length === 0 ? (
            <p className="text-center text-sm text-zinc-500 py-10">No hay productos disponibles en esta categoría.</p>
          ) : (
            filteredProducts.map((prod) => {
              const cartItem = cart.find((item) => item.product.id === prod.id)
              return (
                <div
                  key={prod.id}
                  className={`flex justify-between items-center gap-4 border rounded-2xl p-4 transition-colors ${
                    !prod.is_active
                      ? 'bg-zinc-950/40 border-zinc-900/60 opacity-60'
                      : 'bg-zinc-900/40 border-zinc-900 hover:border-zinc-800'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">{prod.name}</h4>
                      {!prod.is_active && (
                        <span className="text-[9px] font-black text-red-400 bg-red-950/60 border border-red-800/40 px-1.5 py-0.5 rounded">
                          AGOTADO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{prod.detail}</p>
                    <p className="font-bold text-sm text-orange-400 mt-2">{formatMoney(Number(prod.price))}</p>
                  </div>

                  <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-1.5">
                    {!prod.is_active ? (
                      <span className="px-3 py-1 text-xs font-bold text-zinc-600 cursor-not-allowed">
                        Agotado
                      </span>
                    ) : cartItem ? (
                      <>
                        <button
                          onClick={() => removeFromCart(prod.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white"
                          aria-label="Restar"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="font-bold text-sm px-1.5 min-w-[16px] text-center">{cartItem.qty}</span>
                        <button
                          onClick={() => addToCart(prod)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white"
                          aria-label="Sumar"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => addToCart(prod)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white hover:text-orange-400 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5 text-orange-500" /> Agregar
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </section>
      </div>

      {/* Carrito Flotante Inferior */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950 border-t border-zinc-900 px-4 py-4 backdrop-blur-md bg-zinc-950/95">
          <div className="max-w-md mx-auto">
            {/* Detalles de cocción para cortes de parrilla */}
            <div className="max-h-36 overflow-y-auto mb-4 space-y-2 pr-1">
              {cart.map((item) => {
                const isBeef = item.product.category_id === 'c1000000-0000-0000-0000-000000000001' // Cortes
                if (!isBeef) return null
                return (
                  <div key={item.product.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <p className="text-xs font-bold text-zinc-300">Punto de cocción para {item.product.name}:</p>
                    <div className="flex gap-2 mt-2">
                      {['Jugoso', 'A punto', 'Cocido'].map((pt) => (
                        <button
                          key={pt}
                          onClick={() => updateItemNotes(item.product.id, pt)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            item.notes === pt
                              ? 'bg-orange-600/20 text-orange-400 border-orange-500'
                              : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          {pt}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {errorMsg && <p className="text-xs font-bold text-red-500 mb-3 text-center">{errorMsg}</p>}

            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4" /> Resumen: {cartItemCount} ítems
              </span>
              <span className="font-bold text-lg text-white">{formatMoney(subtotal)}</span>
            </div>

            <Button
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-950/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando comanda...
                </>
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" /> Enviar a Cocina
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
