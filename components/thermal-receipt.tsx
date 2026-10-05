'use client'

import React from 'react'

export interface ThermalReceiptProps {
  type: 'kitchen' | 'prebill' | 'fiscal' | 'z_close' | 'cash_settlement'
  data: {
    orderId?: string
    tableNumber?: string
    origin?: string
    customerName?: string
    createdAt?: string
    stationTickets?: {
      stationTitle: string
      stationBadge: string
      items: {
        quantity: number
        name: string
        unitPrice?: number
        notes?: string | null
      }[]
    }[]
    items?: {
      quantity: number
      name: string
      unitPrice: number
      notes?: string | null
    }[]
    subtotal?: number
    discountPct?: number
    discountAmount?: number
    total?: number
    paymentMethod?: string
    // Datos Fiscales ARCA
    invoiceType?: 'A' | 'B' | 'C'
    invoiceNumber?: string
    cae?: string
    caeDueDate?: string
    netAmount?: number
    vatAmount?: number
    docType?: number
    docNumber?: string
    // Datos Cierre Z Fiscal
    shiftDate?: string
    ordersCount?: number
    fiscalInvoicesCount?: number
    totalSalesToday?: number
    salesByMethod?: {
      efectivo: number
      debito: number
      credito: number
      qr: number
    }
    netFiscalToday?: number
    vatFiscalToday?: number
    operatorName?: string
    // Datos Rendición Operativa de Caja
    shiftName?: string
    initialCash?: number
    expectedCash?: number
    realCash?: number
    cashDifference?: number
    nonFiscalOrdersCount?: number
    periodLabel?: string
  }
}

const formatMoney = (val?: number) => `$ ${(val || 0).toLocaleString('es-AR')}`

export function ThermalReceipt({ type, data }: ThermalReceiptProps) {
  const nowStr = data.createdAt
    ? new Date(data.createdAt).toLocaleString('es-AR')
    : new Date().toLocaleString('es-AR')

  return (
    <div id="thermal-receipt" className="hidden print:block font-mono text-[11px] leading-tight text-black bg-white p-2 w-[80mm] mx-auto">
      {/* ------------------------------------------------------------- */}
      {/* 1. TICKET DE COCINA / PARRILLA (CON SOPORTE DE ESTACIONES SEPARADAS) */}
      {/* ------------------------------------------------------------- */}
      {type === 'kitchen' && (
        <div className="space-y-4">
          {data.stationTickets && data.stationTickets.length > 0 ? (
            data.stationTickets.map((st, sIdx) => (
              <div key={sIdx} className="space-y-2 border-b-2 border-dashed border-black pb-4 mb-4 break-after-page">
                <div className="text-center border-b border-black pb-1">
                  <h2 className="text-sm font-black uppercase">*** {st.stationTitle} ***</h2>
                  <p className="font-bold text-[10px]">1847 - PARRILLA & CERVECERIA</p>
                  <p className="font-extrabold text-[11px] mt-0.5 uppercase tracking-wide">
                    [ ESTACIÓN: {st.stationBadge} ]
                  </p>
                </div>

                <div className="flex justify-between font-bold text-xs border-b border-black pb-1">
                  <span>
                    {data.tableNumber ? `MESA ${data.tableNumber}` : (data.origin || 'DESPACHO').toUpperCase()}
                  </span>
                  <span>ORD #{data.orderId?.slice(0, 5).toUpperCase()}</span>
                </div>

                <div className="text-[10px]">
                  <p>CLIENTE: <span className="font-bold">{data.customerName || 'COMENSAL'}</span></p>
                  {data.operatorName && <p>OPERADOR / CAJERO: <span className="font-bold">{data.operatorName}</span></p>}
                  <p>HORA: {nowStr}</p>
                </div>

                <hr className="border-dashed border-black" />

                {/* LISTADO DE ITEMS DE LA ESTACIÓN */}
                <div className="space-y-1.5 font-bold text-xs">
                  {st.items.map((it, idx) => (
                    <div key={idx} className="border-b border-gray-300 pb-1">
                      <div className="flex justify-between">
                        <span className="text-sm font-extrabold">{it.quantity}x {it.name}</span>
                      </div>
                      {it.notes && (
                        <p className="text-xs font-black uppercase bg-gray-200 px-1 mt-0.5 w-fit">
                          &gt;&gt; PUNTO / NOTA: {it.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <hr className="border-black border-2" />
                <div className="text-center font-bold text-[10px]">
                  <p>-- FIN TICKET {st.stationBadge} --</p>
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-2">
              <div className="text-center border-b border-black pb-1">
                <h2 className="text-sm font-black uppercase">*** COMANDA GENERAL ***</h2>
                <p className="font-bold">1847 - PARRILLA & CERVECERIA</p>
              </div>

              <div className="flex justify-between font-bold text-xs border-b border-black pb-1">
                <span>
                  {data.tableNumber ? `MESA ${data.tableNumber}` : (data.origin || 'DESPACHO').toUpperCase()}
                </span>
                <span>ORD #{data.orderId?.slice(0, 5).toUpperCase()}</span>
              </div>

              <div className="text-[10px]">
                <p>CLIENTE: <span className="font-bold">{data.customerName || 'COMENSAL'}</span></p>
                {data.operatorName && <p>OPERADOR: <span className="font-bold">{data.operatorName}</span></p>}
                <p>HORA: {nowStr}</p>
              </div>

              <hr className="border-dashed border-black" />

              {/* LISTADO DE ITEMS */}
              <div className="space-y-1.5 font-bold text-xs">
                {data.items?.map((it, idx) => (
                  <div key={idx} className="border-b border-gray-300 pb-1">
                    <div className="flex justify-between">
                      <span className="text-sm font-extrabold">{it.quantity}x {it.name}</span>
                    </div>
                    {it.notes && (
                      <p className="text-xs font-black uppercase bg-gray-200 px-1 mt-0.5 w-fit">
                        &gt;&gt; PUNTO / NOTA: {it.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <hr className="border-black border-2" />
              <div className="text-center font-bold text-[10px]">
                <p>-- FIN COMANDA --</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. PRE-CUENTA / COMANDA DE SALÓN */}
      {/* ------------------------------------------------------------- */}
      {type === 'prebill' && (
        <div className="space-y-2">
          <div className="text-center border-b border-black pb-1">
            <h2 className="text-sm font-black uppercase">PRE-CUENTA / CONSUMO</h2>
            <p className="font-bold">1847 - PARRILLA & CERVECERIA</p>
            <p className="text-[9px]">DOCUMENTO NO VÁLIDO COMO FACTURA</p>
          </div>

          <div className="flex justify-between font-bold text-xs border-b border-black pb-1">
            <span>
              {data.tableNumber ? `MESA ${data.tableNumber}` : 'MOSTRADOR'}
            </span>
            <span>FECHA: {nowStr}</span>
          </div>

          <div className="flex justify-between text-[10px]">
            <p>CLIENTE: <span className="font-bold">{data.customerName || 'MOZO'}</span></p>
            {data.operatorName && <p className="font-semibold text-right">EMISOR: {data.operatorName}</p>}
          </div>

          <hr className="border-dashed border-black" />

          {/* DETALLE CONSUMO */}
          <table className="w-full text-[10px] text-left">
            <thead>
              <tr className="border-b border-black font-bold">
                <th>CANT / DESCRIPCIÓN</th>
                <th className="text-right">P.UNIT</th>
                <th className="text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items?.map((it, idx) => (
                <tr key={idx}>
                  <td className="py-0.5">
                    <span className="font-bold">{it.quantity}x</span> {it.name}
                  </td>
                  <td className="text-right font-mono">{formatMoney(it.unitPrice)}</td>
                  <td className="text-right font-mono font-bold">{formatMoney(it.quantity * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr className="border-black" />

          <div className="space-y-1 text-right text-xs">
            <div className="flex justify-between">
              <span>SUBTOTAL:</span>
              <span className="font-mono">{formatMoney(data.subtotal)}</span>
            </div>
            {Number(data.discountAmount) > 0 && (
              <div className="flex justify-between font-bold">
                <span>DESCUENTO ({data.discountPct}%):</span>
                <span className="font-mono">-{formatMoney(data.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black border-t border-black pt-1">
              <span>TOTAL PRE-CUENTA:</span>
              <span className="font-mono">{formatMoney(data.total)}</span>
            </div>
          </div>

          <div className="text-center font-bold text-[9px] border-t border-dashed border-black pt-2">
            <p>¡Gracias por visitar 1847 - parrilla & cerveceria!</p>
            <p>Solicitá tu factura fiscal al mozo/cajero.</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. COMPROBANTE FISCAL ARCA / AFIP */}
      {/* ------------------------------------------------------------- */}
      {type === 'fiscal' && (
        <div className="space-y-2">
          <div className="text-center border-b border-black pb-1">
            <h1 className="text-base font-black tracking-widest">1847 - PARRILLA & CERVECERIA</h1>
            <p className="font-bold text-[10px]">PARRILLA ARTESANAL S.A.</p>
            <p className="text-[9px]">Av. Corrientes 1234, CABA</p>
            <p className="text-[9px]">CUIT: 30-71234567-8 | IVA RESPONSABLE INSCRIPTO</p>
          </div>

          <div className="border border-black p-1 text-center font-bold text-xs">
            <p className="text-sm">FACTURA {data.invoiceType || 'B'}</p>
            <p>N° {data.invoiceNumber || '0001-00000001'}</p>
          </div>

          <div className="text-[10px] space-y-0.5 border-b border-black pb-1">
            <div className="flex justify-between">
              <span>FECHA EMISIÓN:</span>
              <span className="font-bold">{nowStr}</span>
            </div>
            <div className="flex justify-between">
              <span>RECEPTOR:</span>
              <span className="font-bold">{data.docType === 80 ? `CUIT ${data.docNumber}` : 'CONSUMIDOR FINAL'}</span>
            </div>
            <div className="flex justify-between">
              <span>FORMA PAGO:</span>
              <span className="font-bold uppercase">{data.paymentMethod || 'EFECTIVO'}</span>
            </div>
            {data.operatorName && (
              <div className="flex justify-between">
                <span>OPERADOR / CAJERO:</span>
                <span className="font-bold">{data.operatorName}</span>
              </div>
            )}
          </div>

          {/* ITMS FACTURADOS */}
          <table className="w-full text-[10px] text-left">
            <thead>
              <tr className="border-b border-black font-bold">
                <th>CANT / DETALLE</th>
                <th className="text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.items?.map((it, idx) => (
                <tr key={idx}>
                  <td className="py-0.5">{it.quantity}x {it.name}</td>
                  <td className="text-right font-mono font-bold">{formatMoney(it.quantity * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr className="border-black" />

          {/* DESGLOSE FISCAL ARCA */}
          <div className="space-y-0.5 text-right text-[10px]">
            <div className="flex justify-between">
              <span>NETO GRAVADO (21%):</span>
              <span className="font-mono">{formatMoney(data.netAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>IVA DÉBITO FISCAL (21%):</span>
              <span className="font-mono">{formatMoney(data.vatAmount)}</span>
            </div>
            <div className="flex justify-between text-xs font-black border-t border-black pt-1">
              <span>TOTAL FACTURADO:</span>
              <span className="font-mono">{formatMoney(data.total)}</span>
            </div>
          </div>

          <hr className="border-dashed border-black" />

          {/* DATOS CAE ARCA */}
          <div className="bg-gray-100 p-1 text-center text-[9px] space-y-0.5 font-bold">
            <p>CAE N°: {data.cae || '74123456789012'}</p>
            <p>VENCIMIENTO CAE: {data.caeDueDate || '13/09/2026'}</p>
          </div>

          {/* REPRESENTACIÓN SIMULADA DE CÓDIGO QR FISCAL */}
          <div className="text-center pt-1">
            <div className="mx-auto w-24 h-8 bg-black text-white text-[8px] flex items-center justify-center font-bold tracking-widest">
              ||| |||| | |||||| ARCA QR
            </div>
            <p className="text-[8px] text-gray-500 mt-0.5">Comprobante Autorizado por ARCA / AFIP</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. CIERRE Z FISCAL OFICIAL (EXCLUSIVO DECLARADO ANTE ARCA) */}
      {/* ------------------------------------------------------------- */}
      {type === 'z_close' && (
        <div className="space-y-2">
          <div className="text-center border-b border-black pb-1">
            <h2 className="text-sm font-black uppercase">*** CIERRE Z FISCAL (ARCA) ***</h2>
            <p className="font-bold text-[11px]">1847 - PARRILLA & CERVECERIA</p>
            <p className="text-[9px] uppercase tracking-wider font-semibold">Registro Oficial de Facturación Electrónica</p>
          </div>

          <div className="text-[10px] space-y-0.5 border-b border-black pb-1">
            <div className="flex justify-between">
              <span>PTO VENTA:</span>
              <span className="font-bold">0001 (ELECTRÓNICO ARCA)</span>
            </div>
            {data.periodLabel && (
              <div className="flex justify-between border-t border-dashed border-gray-400 pt-0.5 text-black">
                <span>AUDITORÍA:</span>
                <span className="font-bold">{data.periodLabel}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>FECHA / HORA CIERRE:</span>
              <span className="font-bold">{nowStr}</span>
            </div>
            <div className="flex justify-between">
              <span>COMPROBANTES FISCALES CON CAE:</span>
              <span className="font-bold">{data.fiscalInvoicesCount || data.ordersCount || 0}</span>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-black text-center text-[10px] border-b border-black pb-0.5 uppercase">
              Desglose Impositivo Oficial
            </p>
            <div className="flex justify-between text-[11px]">
              <span>NETO TOTAL FACTURADO (21.00%):</span>
              <span className="font-mono font-bold">{formatMoney(data.netFiscalToday)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>IVA DÉBITO FISCAL ACUMULADO:</span>
              <span className="font-mono font-bold">{formatMoney(data.vatFiscalToday)}</span>
            </div>
            <hr className="border-black border-2" />
            <div className="flex justify-between text-sm font-black">
              <span>TOTAL DECLARADO ARCA:</span>
              <span className="font-mono">{formatMoney((data.netFiscalToday || 0) + (data.vatFiscalToday || 0) || data.totalSalesToday)}</span>
            </div>
          </div>

          <hr className="border-dashed border-black" />
          <div className="text-[9px] text-center font-bold space-y-0.5">
            <p>COMPROBANTES ELECTRÓNICOS AUTORIZADOS CON CAE</p>
            <p>DOCUMENTO VÁLIDO PARA INSPECCIÓN Y CONTROL FISCAL</p>
          </div>

          <hr className="border-black border-2" />
          <div className="text-center font-bold text-[9px] pt-1">
            <p>FIRMA RESPONSABLE ({data.operatorName || 'ADMINISTRACIÓN'}): __________________</p>
            <p className="mt-1">-- FIN CIERRE Z FISCAL OFICIAL --</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. CONTROL DE RENDICIÓN OPERATIVA DE CAJA (ARQUEO INTERNO) */}
      {/* ------------------------------------------------------------- */}
      {type === 'cash_settlement' && (
        <div className="space-y-2">
          <div className="text-center border-b border-black pb-1">
            <h2 className="text-sm font-black uppercase">*** RENDICIÓN OPERATIVA DE CAJA ***</h2>
            <p className="font-bold text-[11px]">1847 - PARRILLA & CERVECERIA</p>
            <p className="text-[9px] uppercase tracking-wider font-semibold">Control de Recaudación y Fondo de Turno</p>
          </div>

          <div className="text-[10px] space-y-0.5 border-b border-black pb-1">
            <div className="flex justify-between">
              <span>TURNO:</span>
              <span className="font-bold">{data.shiftName || 'Turno General'}</span>
            </div>
            {data.periodLabel && (
              <div className="flex justify-between border-t border-dashed border-gray-400 pt-0.5 text-black">
                <span>RANGO / DÍA:</span>
                <span className="font-bold">{data.periodLabel}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>FECHA / HORA:</span>
              <span className="font-bold">{nowStr}</span>
            </div>
            <div className="flex justify-between">
              <span>TOTAL MESAS / COMANDAS:</span>
              <span className="font-bold">{data.ordersCount || 0}</span>
            </div>
            {data.operatorName && (
              <div className="flex justify-between">
                <span>RESPONSABLE DE CAJA:</span>
                <span className="font-bold">{data.operatorName}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 text-xs">
            <p className="font-black text-center text-[10px] border-b border-black pb-0.5 uppercase">
              Ingresos Totales por Medio de Cobro
            </p>
            <div className="flex justify-between">
              <span>EFECTIVO COBRADO:</span>
              <span className="font-mono font-bold">{formatMoney(data.salesByMethod?.efectivo)}</span>
            </div>
            <div className="flex justify-between">
              <span>DÉBITO:</span>
              <span className="font-mono font-bold">{formatMoney(data.salesByMethod?.debito)}</span>
            </div>
            <div className="flex justify-between">
              <span>CRÉDITO:</span>
              <span className="font-mono font-bold">{formatMoney(data.salesByMethod?.credito)}</span>
            </div>
            <div className="flex justify-between">
              <span>TRANSFERENCIA / QR:</span>
              <span className="font-mono font-bold">{formatMoney(data.salesByMethod?.qr)}</span>
            </div>
            <hr className="border-black" />
            <div className="flex justify-between text-sm font-black">
              <span>TOTAL RECAUDADO SALÓN & CAJA:</span>
              <span className="font-mono">{formatMoney(data.totalSalesToday)}</span>
            </div>
          </div>

          <hr className="border-dashed border-black" />

          {/* ARQUEO DE CAJA FÍSICO */}
          <div className="space-y-1 text-[10px]">
            <p className="font-black text-center border-b border-black pb-0.5 uppercase">Conciliación de Billetes en Cajón</p>
            <div className="flex justify-between">
              <span>(+) FONDO INICIAL DE TURNO:</span>
              <span className="font-mono">{formatMoney(data.initialCash)}</span>
            </div>
            <div className="flex justify-between">
              <span>(+) EFECTIVO COBRADO:</span>
              <span className="font-mono">{formatMoney(data.salesByMethod?.efectivo)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-gray-300 pt-0.5">
              <span>(=) EFECTIVO ESPERADO EN CAJÓN:</span>
              <span className="font-mono">{formatMoney(data.expectedCash)}</span>
            </div>
            <div className="flex justify-between font-extrabold text-[11px] border-t border-black pt-0.5">
              <span>EFECTIVO CONTADO REAL:</span>
              <span className="font-mono">{formatMoney(data.realCash)}</span>
            </div>
            {typeof data.cashDifference === 'number' && (
              <div className={`flex justify-between font-black text-[11px] ${data.cashDifference < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                <span>{data.cashDifference < 0 ? 'DIFERENCIA (FALTANTE):' : data.cashDifference > 0 ? 'DIFERENCIA (SOBRANTE):' : 'DIFERENCIA DE CAJA:'}</span>
                <span className="font-mono">{formatMoney(data.cashDifference)}</span>
              </div>
            )}
          </div>

          <hr className="border-black border-2" />
          <div className="text-center font-bold text-[9px] pt-1">
            <p>FIRMA CAJERO: ____________________</p>
            <p className="mt-1">FIRMA RESPONSABLE / ADMIN: ____________________</p>
            <p className="mt-1">-- FIN RENDICIÓN OPERATIVA DE CAJA --</p>
          </div>
        </div>
      )}
    </div>
  )
}
