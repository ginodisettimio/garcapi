/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import {
  ARCA_URLS,
  CONDICION_IVA_LABELS,
  WSFE_SOAP_NS,
  type CbteTipo,
} from '../domain/constants.js'
import type { ComprobanteAsociado, Item } from '../domain/types.js'
import { IVA_ID_TO_PERCENT } from '../domain/iva.js'
import type { ArcaAuth } from '../domain/types.js'
import type { SoapClient } from './soap-client.js'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

/**
 * Cliente de bajo nivel para WSFEv1 (Web Service de Factura Electrónica).
 * Construye los envelopes SOAP y llama al endpoint vía `SoapClient`.
 *
 * Esta clase NO maneja autenticación: la recibe en cada método vía
 * `auth: ArcaAuth`. La gestión del TA la hace `WsaaClient`.
 */
export class WsfeClient {
  constructor(
    private readonly soap: SoapClient,
    private readonly arcaEnv: 'homologacion' | 'produccion',
  ) {
    void this.soap
    void this.arcaEnv
  }

  /**
   * Construye un envelope SOAP genérico con Auth para WSFEv1.
   */
  buildAuthEnvelope(_action: string, _auth: ArcaAuth, _bodyInner: string): string {
    throw new Error(PLACEHOLDER)
  }

  /** FECompUltimoAutorizado. Devuelve el número del último comprobante autorizado. */
  async feCompUltimoAutorizado(
    _auth: ArcaAuth,
    _ptoVta: number,
    _cbteTipo: CbteTipo,
  ): Promise<number> {
    throw new Error(PLACEHOLDER)
  }

  /**
   * Devuelve `nro+1` para que el próximo comprobante a emitir sea `nro+1`.
   * Convenience sobre `feCompUltimoAutorizado`.
   */
  async getNextNumber(_auth: ArcaAuth, _ptoVta: number, _cbteTipo: CbteTipo): Promise<number> {
    throw new Error(PLACEHOLDER)
  }

  /** FECompConsultar. Recupera un comprobante ya emitido. */
  async feCompConsultar(
    _auth: ArcaAuth,
    _ptoVta: number,
    _cbteTipo: CbteTipo,
    _nro: number,
  ): Promise<string> {
    throw new Error(PLACEHOLDER)
  }

  /**
   * FECAESolicitar. Emite un comprobante.
   * Devuelve el XML crudo; el caller (BillingService) se encarga
   * de parsear CAE, errores, etc.
   */
  async fecaeSolicitar(
    _auth: ArcaAuth,
    _req: {
      ptoVta: number
      cbteTipo: CbteTipo
      concepto: number
      docTipo: number
      docNro: number
      condIvaReceptor: number
      cbteDesde: number
      cbteHasta: number
      fecha: string
      moneda: string
      cotizacion: number
      items: Item[]
      cbtesAsoc?: ComprobanteAsociado[]
      fchServDesde?: string
      fchServHasta?: string
      fchVtoPago?: string
    },
  ): Promise<string> {
    throw new Error(PLACEHOLDER)
  }
}

// Re-export de constantes útiles al consumidor
export { IVA_ID_TO_PERCENT, CONDICION_IVA_LABELS, ARCA_URLS, WSFE_SOAP_NS }
