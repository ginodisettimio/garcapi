import type { CbteTipo, CondicionIva, Moneda, DocTipo, Concepto } from './constants.js'

/**
 * Representa al emisor del comprobante.
 *
 * Este objeto DEBE ser provisto por el consumidor del módulo.
 * No se lee de la base de datos ni de variables de entorno
 * mágicamente: se inyecta. Ver {@link EmisorProvider} para más.
 */
export interface Emisor {
  /** CUIT del emisor (11 dígitos, sin guiones). */
  cuit: number
  /** Razón social. */
  razonSocial: string
  /** Domicilio fiscal (calle, número, ciudad, provincia, CP). */
  domicilio: string
  /** Condición frente al IVA del emisor (texto libre, ej. "Responsable Inscripto"). */
  condicionIva: string
  /** Fecha de inicio de actividades, formato DD/MM/AAAA. */
  inicioActividades: string
  /** Número de Ingresos Brutos. */
  ingresosBrutos: string
  /** Punto de venta por defecto para emisión. */
  ptoVtaDefault: number
  /** Datos bancarios para imprimir (opcional, ej. para transferencias). */
  datosBancarios?: string
}

/**
 * Interfaz para que el módulo pueda obtener el emisor en tiempo
 * de ejecución. Esto desacopla al módulo de cómo el usuario
 * almacena su configuración.
 *
 * Ejemplo de implementación:
 * ```ts
 * class DbEmisorProvider implements EmisorProvider {
 *   constructor(private pool: Pool) {}
 *   async getEmisor(): Promise<Emisor> {
 *     const { rows } = await this.pool.query('SELECT * FROM config WHERE id = 1')
 *     return mapRowToEmisor(rows[0])
 *   }
 * }
 * ```
 */
export interface EmisorProvider {
  getEmisor(): Promise<Emisor>
}

/**
 * Implementación trivial: provee siempre el mismo emisor.
 * Útil para casos de una sola empresa.
 */
export class StaticEmisorProvider implements EmisorProvider {
  constructor(private readonly emisor: Emisor) {}
  getEmisor(): Promise<Emisor> {
    return Promise.resolve(this.emisor)
  }
}

/**
 * Receptor del comprobante (cliente).
 */
export interface Receptor {
  /** Tipo de documento (80=CUIT, 96=DNI, 99=CF, ...). */
  docTipo: DocTipo
  /** Número de documento. Para docTipo=99, debe ser 0. */
  docNro: number
  /** Condición frente al IVA (1, 5, 6, ...). */
  condicionIVA: CondicionIva
  /** Razón social o nombre completo. */
  razonSocial: string
  /** Domicilio del receptor (opcional, default "-"). */
  domicilio?: string
}

/**
 * Ítem individual del comprobante.
 *
 * El precio unitario enviado a AFIP es SIEMPRE NETO (sin IVA incluido).
 * El módulo se encarga de calcular el IVA discriminado en el caso
 * de comprobantes A y B. Para comprobantes C, el precio se envía tal
 * cual (sin discriminar IVA).
 */
export interface Item {
  /** Código opcional del producto. */
  codigo?: string | number
  /** Descripción del producto/servicio. */
  descripcion: string
  /** Cantidad (debe ser > 0). */
  cantidad: number
  /** Precio unitario NETO (sin IVA). Para comprobantes C, es el total. */
  precioUnitario: number
  /**
   * Alícuota de IVA en porcentaje (0, 2.5, 5, 10.5, 21, 27).
   * Para comprobantes C, debe ser 0.
   */
  iva: number
}

/**
 * Comprobante asociado (requerido para NC y ND).
 */
export interface ComprobanteAsociado {
  /** Tipo del comprobante original (ej. 1 = Factura A). */
  tipo: CbteTipo
  /** Punto de venta del original. */
  ptoVta: number
  /** Número del comprobante original. */
  nro: number
  /** CUIT emisor del comprobante original (opcional, default = mismo emisor). */
  cuit?: number
}

/**
 * Request para emitir un comprobante.
 */
export interface EmitirComprobanteRequest {
  /** Punto de venta donde se emite. */
  ptoVta: number
  /** Tipo de comprobante (1=FA, 6=FB, 11=FC, 3=NCA, 8=NCB, 13=NCC, ...). */
  cbteTipo: CbteTipo
  /** Concepto: 1=Productos, 2=Servicios, 3=Ambos. Default 1. */
  concepto?: Concepto
  /** Fecha del comprobante en formato YYYYMMDD. Default = hoy. */
  fecha?: string
  /** Receptor del comprobante. */
  receptor: Receptor
  /** Ítems del comprobante. Mínimo 1. */
  items: Item[]
  /** Moneda. Default 'PES'. */
  moneda?: Moneda
  /** Cotización respecto al peso. Para PES, 1. */
  cotizacion?: number
  /** Comprobantes asociados (obligatorio para NC/ND). */
  cbtesAsoc?: ComprobanteAsociado[]
  /** Fechas del servicio (obligatorias si concepto = 2 o 3). */
  fchServDesde?: string
  fchServHasta?: string
  fchVtoPago?: string
  /**
   * Condición de venta (libre, se imprime en el PDF).
   * Ej: 'Contado', 'Cuenta Corriente', '30 días'.
   */
  condicionVenta: string
}

/**
 * Resultado de emitir un comprobante.
 */
export interface ComprobanteEmitido {
  /** CAE asignado por ARCA. */
  cae: string
  /** Fecha de vencimiento del CAE (YYYYMMDD). */
  vtoCae: string
  /** Número de comprobante asignado. */
  nroComprobante: number
  /** Tipo de comprobante emitido. */
  cbteTipo: CbteTipo
  /** Punto de venta. */
  ptoVta: number
  /** Importe total. */
  importeTotal: number
  /** Nombre sugerido para el archivo PDF. */
  fileName: string
  /** Buffer del PDF (opcional, presente si pdf.enabled). */
  pdfBuffer?: Buffer
  /** XML crudo devuelto por ARCA. */
  xml: string
}

/**
 * Credenciales ARCA (TA parseado).
 */
export interface ArcaAuth {
  token: string
  sign: string
  cuit: string
}

/**
 * Ticket de Acceso devuelto por WSAA.
 */
export interface TicketAcceso {
  token: string
  sign: string
  /** Path al archivo TA_wsfe.xml desde el que se leyó. */
  taPath: string
  /** ¿Está vigente? */
  valid: boolean
  /** Header parseado (incluye generationTime, expirationTime, etc). */
  header?: Record<string, unknown>
  /** Fecha de expiración. */
  expiration?: Date
}
