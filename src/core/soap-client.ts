/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import type { AxiosRequestConfig } from 'axios'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

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

/** Cliente HTTP SOAP por defecto, basado en axios. */
export class AxiosSoapClient implements SoapClient {
  constructor(_defaults: AxiosRequestConfig = {}) {
    void _defaults
  }

  async post(_args: SoapPostArgs): Promise<string> {
    throw new Error(PLACEHOLDER)
  }
}
