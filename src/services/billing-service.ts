/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import type { CbteTipo } from '../domain/index.js'
import type { Logger } from '../domain/logger.js'
import type { Emisor, EmisorProvider } from '../domain/types.js'
import type { WsaaClient } from '../core/wsaa.js'
import type { WsfeClient } from '../core/wsfe.js'
import type { PdfGenerator } from '../pdf/pdf-service.js'
import type { ComprobanteEmitido, EmitirComprobanteRequest } from '../domain/types.js'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

export interface BillingServiceDeps {
  emisor: EmisorProvider
  wsaa: WsaaClient
  wsfe: WsfeClient
  logger?: Logger
  /** Generador de PDF. Si está, se llama después de emitir. Si no, se omite. */
  pdf?: PdfGenerator
}

/**
 * Servicio principal de facturación. Emite comprobantes contra ARCA
 * y, opcionalmente, genera el PDF con CAE/QR.
 */
export class BillingService {
  constructor(private readonly deps: BillingServiceDeps) {
    void this.deps
  }

  /**
   * Emite un comprobante electrónico.
   *  1. Valida el input con Zod.
   *  2. Resuelve el emisor vía `EmisorProvider`.
   *  3. Obtiene un TA vigente vía `WsaaClient`.
   *  4. Pide el próximo número a `WsfeClient.feCompUltimoAutorizado`.
   *  5. Llama a `FECAESolicitar`.
   *  6. Parsea el CAE, errores, observaciones.
   *  7. Si hay `pdf`, genera el PDF.
   *  8. Devuelve el resultado.
   */
  async emitir(_input: EmitirComprobanteRequest | unknown): Promise<ComprobanteEmitido> {
    void _input
    throw new Error(PLACEHOLDER)
  }
}

// Re-exports de tipos para que las firmas de la versión pública sean completas
export type { CbteTipo, Emisor, EmisorProvider }
