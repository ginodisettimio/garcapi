/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import type { CbteTipo } from '../domain/index.js'
import type { Logger } from '../domain/logger.js'
import type { Emisor, EmisorProvider } from '../domain/types.js'
import type { WsaaClient } from '../core/wsaa.js'
import type { WsfeClient } from '../core/wsfe.js'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

export interface ComprobantesServiceDeps {
  emisor: EmisorProvider
  wsaa: WsaaClient
  wsfe: WsfeClient
  logger?: Logger
}

/**
 * Servicio de consulta de comprobantes.
 * - `ultimoAutorizado(ptoVta, cbteTipo)`: número del último comprobante.
 * - `consultar(ptoVta, cbteTipo, nro)`: XML completo del comprobante.
 */
export class ComprobantesService {
  constructor(private readonly deps: ComprobantesServiceDeps) {
    void this.deps
  }

  async ultimoAutorizado(_ptoVta: number, _cbteTipo: CbteTipo): Promise<number> {
    throw new Error(PLACEHOLDER)
  }

  async consultar(_ptoVta: number, _cbteTipo: CbteTipo, _nro: number): Promise<string> {
    throw new Error(PLACEHOLDER)
  }

  /** Helper para pedir un emisor sin hacer un round-trip a ARCA. */
  async getEmisor(): Promise<Emisor> {
    throw new Error(PLACEHOLDER)
  }
}
