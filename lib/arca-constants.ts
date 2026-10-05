export type FiscalRegime = 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO'

// Régimen fiscal activo (toma la variable de entorno o cae en MONOTRIBUTO por defecto)
export const FISCAL_REGIME: FiscalRegime =
  (process.env.NEXT_PUBLIC_FISCAL_REGIME as FiscalRegime) || 'MONOTRIBUTO'

// Códigos Oficiales de Comprobantes AFIP / ARCA
export const AFIP_COMPROBANTE_CODES = {
  FACTURA_A: 1,  // Responsable Inscripto a Responsable Inscripto
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,  // Responsable Inscripto a Consumidor Final / Exento
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11, // Monotributo a Cualquier Receptor
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
} as const

// Códigos Oficiales de Documento Receptor AFIP / ARCA
export const AFIP_DOC_TYPES = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  LE: 89,
  LC: 90,
  CI_EXTRANJERA: 91,
  PASAPORTE: 94,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const
