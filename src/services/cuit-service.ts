import type { PadronA13Client } from '../core/padron-a13.js'
import type { WsaaClient } from '../core/wsaa.js'
import { tag, tags } from '../core/xml.js'
import { PadronError } from '../domain/errors.js'
import type { Logger } from '../domain/logger.js'
import type { EmisorProvider } from '../domain/types.js'

export interface CuitInfo {
  cuit: string
  razonSocial?: string
  tipoPersona?: 'FISICA' | 'JURIDICA'
  estado?: 'ACTIVO' | 'INACTIVO'
  domicilio?: string
}

export interface CuitService {
  /**
   * Consulta la información de un CUIT en el Padrón A13 de ARCA.
   */
  lookup(cuit: string): Promise<CuitInfo>
}

/** Servicio que siempre falla. Útil para deshabilitar la consulta de CUIT. */
export class NotImplementedCuitService implements CuitService {
  async lookup(cuit: string): Promise<CuitInfo> {
    throw new PadronError('Consulta de CUIT deshabilitada', 'CUIT_SERVICE_DISABLED', { cuit })
  }
}

export interface PadronA13CuitServiceDeps {
  emisor: EmisorProvider
  /** `WsaaClient` configurado con el servicio `ws_sr_padron_a13` (TA propio, no el de `wsfe`). */
  wsaa: WsaaClient
  padron: PadronA13Client
  logger?: Logger
}

/** `CuitService` sobre el Padrón A13. Consulta en nombre del CUIT del emisor. */
export class PadronA13CuitService implements CuitService {
  constructor(private readonly deps: PadronA13CuitServiceDeps) {}

  async lookup(cuit: string): Promise<CuitInfo> {
    const emisor = await this.deps.emisor.getEmisor()
    const { auth } = await this.deps.wsaa.authenticate(emisor.cuit)
    return parsePersonaA13(await this.deps.padron.getPersona(auth, cuit), cuit)
  }
}

/** Convierte la respuesta de getPersona en `CuitInfo`. Prioriza el domicilio fiscal. */
export function parsePersonaA13(xml: string, cuit: string): CuitInfo {
  const persona = tag(xml, 'persona')
  if (!persona) {
    throw new PadronError(`No existe persona con CUIT ${cuit}`, 'CUIT_NO_ENCONTRADO', { cuit })
  }

  const tipo = tag(persona, 'tipoPersona')
  const tipoPersona = tipo === 'FISICA' || tipo === 'JURIDICA' ? tipo : undefined
  const razonSocial =
    tag(persona, 'razonSocial') ??
    ([tag(persona, 'apellido'), tag(persona, 'nombre')].filter(Boolean).join(' ') || undefined)
  const estadoClave = tag(persona, 'estadoClave')

  const domicilios = tags(persona, 'domicilio')
  const dom = domicilios.find((d) => tag(d, 'tipoDomicilio') === 'FISCAL') ?? domicilios[0]
  let domicilio: string | undefined
  if (dom) {
    const cp = tag(dom, 'codPostal')
    domicilio =
      [tag(dom, 'direccion'), tag(dom, 'localidad'), tag(dom, 'descripcionProvincia')].filter(Boolean).join(', ') +
      (cp ? ` (CP ${cp})` : '')
  }

  return {
    cuit: tag(persona, 'idPersona') ?? cuit,
    razonSocial,
    tipoPersona,
    estado: estadoClave ? (estadoClave === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO') : undefined,
    domicilio: domicilio || undefined,
  }
}
