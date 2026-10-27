import { ARCA_URLS, PADRON_A13_SOAP_NS } from '../domain/constants.js'
import type { ArcaEnv } from '../domain/env.js'
import { PadronError } from '../domain/errors.js'
import type { ArcaAuth } from '../domain/types.js'
import type { SoapClient } from './soap-client.js'
import { escapeXml, tag } from './xml.js'

/**
 * Cliente de bajo nivel para el Padrón A13 (`ws_sr_padron_a13`).
 *
 * Como `WsfeClient`, no maneja autenticación: recibe un `ArcaAuth`
 * de un TA emitido para el servicio `ws_sr_padron_a13`.
 */
export class PadronA13Client {
  constructor(
    private readonly soap: SoapClient,
    private readonly arcaEnv: ArcaEnv,
  ) {}

  /**
   * getPersona. Devuelve el XML crudo de la respuesta.
   * @throws PadronError `CUIT_NO_ENCONTRADO` si la persona no existe, `PADRON_FAULT` ante otro fault.
   */
  async getPersona(auth: ArcaAuth, idPersona: string | number): Promise<string> {
    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="${PADRON_A13_SOAP_NS}">` +
      '<soapenv:Header/>' +
      '<soapenv:Body><a13:getPersona>' +
      `<token>${escapeXml(auth.token)}</token>` +
      `<sign>${escapeXml(auth.sign)}</sign>` +
      `<cuitRepresentada>${escapeXml(auth.cuit)}</cuitRepresentada>` +
      `<idPersona>${escapeXml(String(idPersona))}</idPersona>` +
      '</a13:getPersona></soapenv:Body>' +
      '</soapenv:Envelope>'
    const res = await this.soap.post({
      url: ARCA_URLS[this.arcaEnv].padronA13,
      action: '',
      soapActionNs: '',
      envelope,
    })

    const faultstring = tag(res, 'faultstring')
    if (faultstring) {
      const noExiste = /no existe persona/i.test(faultstring)
      throw new PadronError(
        noExiste ? `No existe persona con CUIT ${idPersona}` : `Padrón A13: ${faultstring}`,
        noExiste ? 'CUIT_NO_ENCONTRADO' : 'PADRON_FAULT',
        { idPersona: String(idPersona), faultcode: tag(res, 'faultcode'), faultstring },
      )
    }
    return res
  }
}
