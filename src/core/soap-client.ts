import https from 'node:https'
import tls from 'node:tls'
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { NetworkError } from '../domain/errors.js'

/** Argumentos para `SoapClient.post`. Exportado para tests y mocks. */
export interface SoapPostArgs {
  url: string
  action: string
  soapActionNs: string
  envelope: string
  timeoutMs?: number
}

/**
 * Contrato minimalista para un cliente SOAP. La implementación
 * por default usa axios, pero se puede sustituir (por ejemplo,
 * por `undici`, `got`, un mock para tests, etc.).
 */
export interface SoapClient {
  /** POSTea un envelope SOAP y devuelve el body de la respuesta como string. */
  post(args: SoapPostArgs): Promise<string>
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Agente HTTPS para ARCA: solo intercambio de claves ECDHE.
 * - servicios1.afip.gov.ar (WSFE producción) prefiere DHE con una clave que OpenSSL 3
 *   rechaza ("dh key too small"); sin DHE ni RSA estático todos los hosts negocian ECDHE (con PFS).
 * - Sin keep-alive: reusar un socket que ARCA ya cerró cortaría FECAESolicitar a mitad de camino.
 */
const ARCA_HTTPS_AGENT = new https.Agent({ ciphers: `${tls.DEFAULT_CIPHERS}:!kDHE:!kRSA`, keepAlive: false })

/** Cliente HTTP SOAP por defecto, basado en axios. */
export class AxiosSoapClient implements SoapClient {
  private readonly http: AxiosInstance

  constructor(defaults: AxiosRequestConfig = {}) {
    this.http = axios.create({ httpsAgent: ARCA_HTTPS_AGENT, ...defaults })
  }

  async post(args: SoapPostArgs): Promise<string> {
    let status: number
    let body: string
    try {
      const res = await this.http.post<string>(args.url, args.envelope, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `${args.soapActionNs}${args.action}`,
        },
        timeout: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        responseType: 'text',
        // Los SOAP faults vienen con HTTP 500: los devolvemos para que el caller los parsee
        validateStatus: () => true,
      })
      status = res.status
      body = String(res.data ?? '')
    } catch (err) {
      throw new NetworkError(`Error de red llamando a ${args.url}: ${String(err)}`, {
        url: args.url,
        action: args.action,
      })
    }
    if (status < 400 || /Fault>/.test(body)) return body
    throw new NetworkError(`HTTP ${status} llamando a ${args.url}`, {
      url: args.url,
      action: args.action,
      status,
      body: body.slice(0, 500),
    })
  }
}
