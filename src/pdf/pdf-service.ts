/**
 * Pendiente de implementación.
 */
import type { ComprobanteAsociado, Item } from '../domain/index.js'
import type { CbteTipo } from '../domain/index.js'
import type { PuppeteerManager } from './puppeteer-manager.js'

const PLACEHOLDER = 'No implementado todavía'

export interface FacturaPdfData {
  ptoVta: number
  cbteTipo: CbteTipo
  nro: number
  fecha: string
  cuit: number
  importe: number
  moneda: string
  cotizacion: number
  tipoDocRec: number
  nroDocRec: number
  cae: string
  vtoCae: string
  items: Item[]
  condicionIvaEmisor: string
  razonSocialEmisor: string
  domicilioEmisor: string
  inicioActividades: string
  ingresosBrutos: string
  razonSocialReceptor: string
  domicilioReceptor: string
  condicionIvaReceptor: string
  condicionVenta: string
  datosBancarios?: string
  cbtesAsoc?: ComprobanteAsociado[]
}

export interface PresupuestoPdfData {
  nro: number
  fecha: string
  cuit: number
  items: Item[]
  condicionIvaEmisor: string
  razonSocialEmisor: string
  domicilioEmisor: string
  inicioActividades: string
  ingresosBrutos: string
  razonSocialReceptor: string
  domicilioReceptor: string
  condicionIvaReceptor: string
  condicionVenta: string
  tipoDocRec?: number
  nroDocRec?: number
  tituloDocumento?: string
  referenciaOrigen?: string
}

/** Interfaz pública del generador de PDFs. */
export interface PdfGenerator {
  generateFacturaPdf(data: FacturaPdfData, fileName: string): Promise<Buffer>
  generatePresupuestoPdf(data: PresupuestoPdfData, fileName: string): Promise<Buffer>
}

export interface PdfServiceOptions {
  /** Manager de Puppeteer (se puede compartir entre servicios). */
  puppeteer: PuppeteerManager
  /** Path al template de factura. Si está vacío, usa el default del paquete. */
  templateFactura?: string | null
  /** Path al template de presupuesto. Si está vacío, usa el default. */
  templatePresupuesto?: string | null
  /** URL base del QR AFIP. Default: 'https://www.afip.gob.ar/fe/qr/'. */
  qrBaseUrl?: string
}

/**
 * Servicio de generación de PDFs. Usa Puppeteer para renderizar
 * los templates HTML por defecto (o los provistos por el usuario).
 */
export class PdfService implements PdfGenerator {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_opts: PdfServiceOptions) {}

  async generateFacturaPdf(_data: FacturaPdfData, _fileName: string): Promise<Buffer> {
    void _data
    void _fileName
    throw new Error(PLACEHOLDER)
  }

  async generatePresupuestoPdf(_data: PresupuestoPdfData, _fileName: string): Promise<Buffer> {
    void _data
    void _fileName
    throw new Error(PLACEHOLDER)
  }

  /** Cierra el browser subyacente. */
  async close(): Promise<void> {
    throw new Error(PLACEHOLDER)
  }
}
