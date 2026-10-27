import type { ArcaEnv } from './env.js'

/**
 * URLs de los servicios SOAP de ARCA/AFIP por entorno.
 * Homologación y producción son mutuamente excluyentes.
 */
export const ARCA_URLS = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    padronA13: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
    qr: 'https://www.afip.gob.ar/fe/qr/',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    padronA13: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
    qr: 'https://www.afip.gob.ar/fe/qr/',
  },
} as const satisfies Record<ArcaEnv, { wsaa: string; wsfe: string; padronA13: string; qr: string }>

/**
 * SOAPAction namespace para WSFEv1. Todas las operaciones de WSFEv1
 * cuelgan de este namespace + nombre de operación.
 */
export const WSFE_SOAP_NS = 'http://ar.gov.afip.dif.FEV1/'

/** Namespace del servicio Padrón A13 (`ws_sr_padron_a13`). */
export const PADRON_A13_SOAP_NS = 'http://a13.soap.ws.server.puc.sr/'

/**
 * Tipos de comprobante según RG-4291.
 * @see https://www.afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf
 */
export const CBTE_TIPO = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
} as const

export type CbteTipo = (typeof CBTE_TIPO)[keyof typeof CBTE_TIPO]

export const CBTE_TIPOS: readonly CbteTipo[] = Object.values(CBTE_TIPO)

export const CBTE_TIPO_NOMBRES: Record<CbteTipo, string> = {
  1: 'Factura A',
  2: 'Nota de Débito A',
  3: 'Nota de Crédito A',
  6: 'Factura B',
  7: 'Nota de Débito B',
  8: 'Nota de Crédito B',
  11: 'Factura C',
  12: 'Nota de Débito C',
  13: 'Nota de Crédito C',
}

/**
 * Letras y prefijo de tipo (para nombres de archivo PDF).
 */
export const CBTE_TIPO_LETRAS: Record<CbteTipo, 'A' | 'B' | 'C'> = {
  1: 'A', 2: 'A', 3: 'A',
  6: 'B', 7: 'B', 8: 'B',
  11: 'C', 12: 'C', 13: 'C',
}

/**
 * Tipos de documento del receptor según tabla AFIP.
 * @see FEParamGetTiposDoc
 */
export const DOC_TIPO = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  DNI: 96,
  PASAPORTE: 94,
  CONSUMIDOR_FINAL: 99,
} as const

export type DocTipo = (typeof DOC_TIPO)[keyof typeof DOC_TIPO]

/**
 * Condición frente al IVA del receptor.
 * @see FEParamGetCondicionIvaReceptor
 * - 1: Responsable Inscripto
 * - 3: IVA Liberado / No categorizado
 * - 4: IVA Sujeto Exento
 * - 5: Consumidor Final
 * - 6: Monotributo
 * - 7: Sujeto No Categorizado
 * - 8: Proveedor del Exterior
 * - 9: Cliente del Exterior
 * - 10: IVA Liberado — Ley Nº 19.640
 * - 13: Monotributista Social
 * - 15: IVA No Alcanzado
 * - 16: Monotributo Trabajador Independiente Promovido
 */
export const CONDICION_IVA = {
  RESPONSABLE_INSCRIPTO: 1,
  IVA_LIBERADO: 3,
  IVA_SUJETO_EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  SUJETO_NO_CATEGORIZADO: 7,
  PROVEEDOR_EXTERIOR: 8,
  CLIENTE_EXTERIOR: 9,
  IVA_LIBERADO_LEY_19640: 10,
  MONOTRIBUTO_SOCIAL: 13,
  IVA_NO_ALCANZADO: 15,
  MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO: 16,
} as const

export type CondicionIva = (typeof CONDICION_IVA)[keyof typeof CONDICION_IVA]

/**
 * Mapeo de IDs de condición IVA a etiquetas legibles.
 * Útil para mostrar al usuario o imprimir en PDF.
 */
export const CONDICION_IVA_LABELS: Record<number, string> = {
  1: 'Responsable Inscripto',
  3: 'IVA Liberado',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Monotributo',
  7: 'Sujeto No Categorizado',
  8: 'Proveedor del Exterior',
  9: 'Cliente del Exterior',
  10: 'IVA Liberado — Ley Nº 19.640',
  13: 'Monotributo Social',
  15: 'IVA No Alcanzado',
  16: 'Monotributo Trabajador Independiente Promovido',
}

/**
 * Condiciones IVA del receptor admitidas por clase de comprobante
 * (FEParamGetCondicionIvaReceptor, RG 5616):
 * - A: 1, 6, 13, 16
 * - B: 4, 5, 7, 8, 9, 10, 15
 * - C: todas (un monotributista le factura C también a un responsable inscripto)
 */
export const CONDICIONES_IVA_PARA_A: readonly CondicionIva[] = [1, 6, 13, 16]
export const CONDICIONES_IVA_PARA_B: readonly CondicionIva[] = [4, 5, 7, 8, 9, 10, 15]
export const CONDICIONES_IVA_PARA_C: readonly CondicionIva[] = [...CONDICIONES_IVA_PARA_A, ...CONDICIONES_IVA_PARA_B]
/** @deprecated Usar `CONDICIONES_IVA_PARA_B` (la clase C admite además las de A). */
export const CONDICIONES_IVA_PARA_BC = CONDICIONES_IVA_PARA_B

/**
 * Concepto del comprobante.
 * - 1: Productos
 * - 2: Servicios
 * - 3: Productos y Servicios
 */
export const CONCEPTO = {
  PRODUCTOS: 1,
  SERVICIOS: 2,
  PRODUCTOS_Y_SERVICIOS: 3,
} as const

export type Concepto = (typeof CONCEPTO)[keyof typeof CONCEPTO]

/**
 * Monedas. ARCA solo acepta PES por ahora, pero dejamos el enum
 * extensible para futuro.
 */
export const MONEDA = {
  PES: 'PES',
  DOL: 'DOL',
  EUR: 'EUR',
} as const

export type Moneda = (typeof MONEDA)[keyof typeof MONEDA]

/** Cotización respecto al peso argentino. Para PES, siempre 1. */
export const MONEDA_COTIZACION: Record<Moneda, number> = {
  PES: 1,
  DOL: 0, // el usuario debe especificar
  EUR: 0,
}

/**
 * Importe (en pesos) a partir del cual una factura a Consumidor Final
 * sin identificar (DocTipo 99) no es válida: hay que consignar DNI, CUIL o CDI
 * (RG 5700/2025: $10.000.000). ARCA lo actualiza: se sobrescribe con `ARCA_MONTO_MAX_CF`.
 */
export const MONTO_MAX_CONSUMIDOR_FINAL = 10_000_000

/** Formato de página del PDF: A4 o ticket de impresora térmica (ancho fijo, alto según contenido). */
export type PdfFormato = 'a4' | 'ticket'

export const PDF_FORMATOS: readonly PdfFormato[] = ['a4', 'ticket'] as const

export function isPdfFormato(value: unknown): value is PdfFormato {
  return (PDF_FORMATOS as readonly unknown[]).includes(value)
}
