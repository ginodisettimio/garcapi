import type { CbteTipo } from '../domain/index.js'
import type { Logger } from '../domain/logger.js'
import type { Emisor, EmisorProvider } from '../domain/types.js'
import type { WsaaClient } from '../core/wsaa.js'
import type { WsfeClient } from '../core/wsfe.js'

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
  constructor(private readonly deps: ComprobantesServiceDeps) {}

  async ultimoAutorizado(ptoVta: number, cbteTipo: CbteTipo): Promise<number> {
    const emisor = await this.deps.emisor.getEmisor()
    const { auth } = await this.deps.wsaa.authenticate(emisor.cuit)
    return this.deps.wsfe.feCompUltimoAutorizado(auth, ptoVta, cbteTipo)
  }

  async consultar(ptoVta: number, cbteTipo: CbteTipo, nro: number): Promise<string> {
    const emisor = await this.deps.emisor.getEmisor()
    const { auth } = await this.deps.wsaa.authenticate(emisor.cuit)
    return this.deps.wsfe.feCompConsultar(auth, ptoVta, cbteTipo, nro)
  }

  /** Helper para pedir un emisor sin hacer un round-trip a ARCA. */
  async getEmisor(): Promise<Emisor> {
    return this.deps.emisor.getEmisor()
  }
}
