/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import { ARCA_URLS } from '../domain/constants.js'
import type { ArcaService } from '../domain/env.js'
import type { Logger } from '../domain/logger.js'
import type { TicketAcceso, ArcaAuth } from '../domain/types.js'
import type { CmsSigner } from './cms-signer.js'
import type { SoapClient } from './soap-client.js'
import type { TaStorage } from './storage.js'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

/**
 * Cliente de bajo nivel para WSAA (Web Service de Autenticación).
 *
 * Responsabilidades:
 * - Construir el TRA (Ticket Request Access).
 * - Firmarlo con CMS (vía `CmsSigner`).
 * - Llamar a `loginCms` para obtener el TA.
 * - Persistir el TA en el `TaStorage`.
 * - Exponer `getCachedTA()` que devuelve un TA vigente, renovándolo
 *   automáticamente si está vencido o no existe.
 */
export class WsaaClient {
  constructor(
    private readonly deps: {
      arcaEnv: 'homologacion' | 'produccion'
      arcaService: ArcaService
      storage: TaStorage
      signer: CmsSigner
      soap: SoapClient
      certPath: string
      keyPath: string
      logger?: Logger
    },
  ) {
    void this.deps
  }

  /** Construye el XML del TRA. */
  buildTra(_service: string, _now: Date = new Date()): string {
    throw new Error(PLACEHOLDER)
  }

  /** Parsea un TA XML y devuelve sus componentes. */
  async parseTa(_xml: string): Promise<TicketAcceso> {
    throw new Error(PLACEHOLDER)
  }

  /** Renueva el TA contra WSAA. Firma un nuevo TRA, lo envía, y persiste la respuesta. */
  async refreshTA(): Promise<TicketAcceso> {
    throw new Error(PLACEHOLDER)
  }

  /**
   * Devuelve un TA vigente. Si el cacheado está vencido o no existe,
   * lo renueva automáticamente.
   */
  async getCachedTA(_opts: { forceRefresh?: boolean } = {}): Promise<TicketAcceso> {
    throw new Error(PLACEHOLDER)
  }

  /** Helper para tomar un `ArcaAuth` (token+sign+cuit) de un TA. */
  toAuth(ta: TicketAcceso, cuit: number | string): ArcaAuth {
    void ta
    void cuit
    throw new Error(PLACEHOLDER)
  }

  /**
   * Helper que combina `getCachedTA` + `toAuth`.
   * Útil para los servicios de facturación.
   */
  async authenticate(_cuit: number | string): Promise<{ ta: TicketAcceso; auth: ArcaAuth }> {
    throw new Error(PLACEHOLDER)
  }
}

// Re-export para que tipos auxiliares estén disponibles en el repo público
export { ARCA_URLS }
