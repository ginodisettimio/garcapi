import { ARCA_URLS } from '../domain/constants.js'
import type { ArcaService } from '../domain/env.js'
import { TaInvalidoError, WsaaError } from '../domain/errors.js'
import type { Logger } from '../domain/logger.js'
import type { TicketAcceso, ArcaAuth } from '../domain/types.js'
import type { CmsSigner } from './cms-signer.js'
import type { SoapClient } from './soap-client.js'
import type { TaStorage } from './storage.js'
import { escapeXml, tag, unescapeXml } from './xml.js'

/** Namespace del servicio LoginCms de WSAA. */
const WSAA_NS = 'http://wsaa.view.sua.dvadac.desein.afip.gov'

/** Margen antes del vencimiento a partir del cual el TA se considera vencido. */
const TA_EXPIRY_MARGIN_MS = 60_000

/** Ventana del TRA alrededor de `now` (tolera relojes desfasados). */
const TRA_WINDOW_MS = 10 * 60_000

/** Formatea un Date como xsd:dateTime en UTC sin milisegundos. */
function xsdDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

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
  /** Renovación en curso: WSAA rechaza un segundo login mientras haya un TA vigente. */
  private refreshing: Promise<TicketAcceso> | null = null

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
  ) {}

  /** Construye el XML del TRA. */
  buildTra(service: string, now: Date = new Date()): string {
    const uniqueId = Math.floor(now.getTime() / 1000)
    const generationTime = xsdDateTime(new Date(now.getTime() - TRA_WINDOW_MS))
    const expirationTime = xsdDateTime(new Date(now.getTime() + TRA_WINDOW_MS))
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<loginTicketRequest version="1.0">',
      '<header>',
      `<uniqueId>${uniqueId}</uniqueId>`,
      `<generationTime>${generationTime}</generationTime>`,
      `<expirationTime>${expirationTime}</expirationTime>`,
      '</header>',
      `<service>${escapeXml(service)}</service>`,
      '</loginTicketRequest>',
    ].join('')
  }

  /** Parsea un TA XML y devuelve sus componentes. */
  async parseTa(xml: string): Promise<TicketAcceso> {
    const token = tag(xml, 'token')
    const sign = tag(xml, 'sign')
    const generationTime = tag(xml, 'generationTime')
    const expirationTime = tag(xml, 'expirationTime')
    const taPath = this.deps.storage.pathFor(this.deps.arcaEnv)
    if (!token || !sign || !expirationTime) {
      throw new TaInvalidoError({ taPath, reason: 'faltan token, sign o expirationTime' })
    }
    const expiration = new Date(expirationTime)
    const valid =
      !Number.isNaN(expiration.getTime()) && expiration.getTime() > Date.now() + TA_EXPIRY_MARGIN_MS
    return {
      token,
      sign,
      taPath,
      valid,
      header: {
        source: tag(xml, 'source'),
        destination: tag(xml, 'destination'),
        uniqueId: tag(xml, 'uniqueId'),
        generationTime,
        expirationTime,
      },
      expiration,
    }
  }

  /** Renueva el TA contra WSAA. Firma un nuevo TRA, lo envía, y persiste la respuesta. */
  async refreshTA(): Promise<TicketAcceso> {
    const { arcaEnv, arcaService, storage, signer, soap, certPath, keyPath, logger } = this.deps
    const service = arcaService === 'wsfev1' ? 'wsfe' : arcaService
    logger?.info({ event: 'arca.wsaa.refresh', arcaEnv, service }, 'Renovando TA contra WSAA')

    const cms = await signer.sign(this.buildTra(service), certPath, keyPath)
    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="${WSAA_NS}">` +
      '<soapenv:Header/>' +
      `<soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>` +
      '</soapenv:Envelope>'
    const res = await soap.post({
      url: ARCA_URLS[arcaEnv].wsaa,
      action: '',
      soapActionNs: '',
      envelope,
    })

    const faultstring = tag(res, 'faultstring')
    if (faultstring) {
      throw new WsaaError(`WSAA rechazó el login: ${faultstring}`, 'WSAA_FAULT', {
        faultcode: tag(res, 'faultcode'),
        faultstring,
      })
    }
    const loginReturn = tag(res, 'loginCmsReturn')
    if (!loginReturn) {
      throw new WsaaError('Respuesta de WSAA sin loginCmsReturn', 'WSAA_RESPUESTA_INVALIDA', {
        body: res.slice(0, 500),
      })
    }

    const taXml = unescapeXml(loginReturn)
    const ta = await this.parseTa(taXml)
    await storage.write(arcaEnv, taXml)
    logger?.info(
      { event: 'arca.wsaa.refreshed', arcaEnv, expiration: ta.expiration?.toISOString() },
      'TA renovado',
    )
    return ta
  }

  /**
   * Devuelve un TA vigente. Si el cacheado está vencido o no existe,
   * lo renueva automáticamente.
   */
  async getCachedTA(opts: { forceRefresh?: boolean } = {}): Promise<TicketAcceso> {
    if (!opts.forceRefresh) {
      const cached = await this.deps.storage.read(this.deps.arcaEnv)
      if (cached) {
        try {
          const ta = await this.parseTa(cached)
          if (ta.valid) return ta
        } catch (err) {
          this.deps.logger?.warn(
            { event: 'arca.wsaa.ta_cache_invalido', err: String(err) },
            'TA cacheado ilegible, se renueva',
          )
        }
      }
    }
    if (!this.refreshing) {
      this.refreshing = this.refreshTA().finally(() => {
        this.refreshing = null
      })
    }
    return this.refreshing
  }

  /** Helper para tomar un `ArcaAuth` (token+sign+cuit) de un TA. */
  toAuth(ta: TicketAcceso, cuit: number | string): ArcaAuth {
    return { token: ta.token, sign: ta.sign, cuit: String(cuit) }
  }

  /**
   * Helper que combina `getCachedTA` + `toAuth`.
   * Útil para los servicios de facturación.
   */
  async authenticate(cuit: number | string): Promise<{ ta: TicketAcceso; auth: ArcaAuth }> {
    const ta = await this.getCachedTA()
    return { ta, auth: this.toAuth(ta, cuit) }
  }
}

// Re-export para que tipos auxiliares estén disponibles en el repo público
export { ARCA_URLS }
