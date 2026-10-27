import {
  ARCA_URLS,
  CONDICION_IVA_LABELS,
  CONCEPTO,
  WSFE_SOAP_NS,
  type CbteTipo,
} from '../domain/constants.js'
import { isC } from '../domain/comprobante.js'
import { WsfeError, type AfipError } from '../domain/errors.js'
import type { ComprobanteAsociado, Item } from '../domain/types.js'
import { IVA_ID_TO_PERCENT, calcularImportes } from '../domain/iva.js'
import type { ArcaAuth } from '../domain/types.js'
import type { SoapClient } from './soap-client.js'
import { escapeXml, tag, tags } from './xml.js'

/** Formatea un importe con 2 decimales, como lo espera ARCA. */
function money(n: number): string {
  return n.toFixed(2)
}

/** Extrae los `<Err>` (Code + Msg) de una respuesta de WSFEv1. */
export function parseErrores(xml: string): AfipError[] {
  return tags(xml, 'Err').map((e) => ({ Code: Number(tag(e, 'Code')), Msg: tag(e, 'Msg') ?? '' }))
}

/** Extrae las `<Obs>` de una respuesta de WSFEv1 como "Code: Msg". */
export function parseObservaciones(xml: string): string[] {
  return tags(xml, 'Obs').map((o) => `${tag(o, 'Code') ?? ''}: ${tag(o, 'Msg') ?? ''}`)
}

/** Lanza `WsfeError` si la respuesta es un SOAP fault. */
function assertSinFault(xml: string, action: string): void {
  const faultstring = tag(xml, 'faultstring')
  if (faultstring) {
    throw new WsfeError(`${action}: ${faultstring}`, {
      code: 'WSFE_FAULT',
      faultcode: tag(xml, 'faultcode') ?? undefined,
      faultstring,
    })
  }
}

/** Lanza `WsfeError` si la respuesta trae un SOAP fault o errores de ARCA. */
function assertSinErrores(xml: string, action: string): void {
  assertSinFault(xml, action)
  const errores = parseErrores(xml)
  if (errores.length > 0) {
    throw new WsfeError(`${action}: ${errores.map((e) => `${e.Code} ${e.Msg}`).join('; ')}`, {
      code: 'WSFE_ERRORES',
      errores,
    })
  }
}

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
  ) {}

  /**
   * Construye un envelope SOAP genérico con Auth para WSFEv1.
   */
  buildAuthEnvelope(action: string, auth: ArcaAuth, bodyInner: string): string {
    return (
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body>' +
      `<${action} xmlns="${WSFE_SOAP_NS}">` +
      `<Auth><Token>${escapeXml(auth.token)}</Token><Sign>${escapeXml(auth.sign)}</Sign><Cuit>${escapeXml(auth.cuit)}</Cuit></Auth>` +
      bodyInner +
      `</${action}>` +
      '</soap:Body>' +
      '</soap:Envelope>'
    )
  }

  /** POSTea una operación de WSFEv1 y devuelve el XML crudo. */
  private call(action: string, auth: ArcaAuth, bodyInner: string): Promise<string> {
    return this.soap.post({
      url: ARCA_URLS[this.arcaEnv].wsfe,
      action,
      soapActionNs: WSFE_SOAP_NS,
      envelope: this.buildAuthEnvelope(action, auth, bodyInner),
    })
  }

  /** FEDummy. Verifica la conectividad con WSFEv1 (no requiere autenticación). */
  async feDummy(): Promise<{ appServer: string; dbServer: string; authServer: string }> {
    const action = 'FEDummy'
    const res = await this.soap.post({
      url: ARCA_URLS[this.arcaEnv].wsfe,
      action,
      soapActionNs: WSFE_SOAP_NS,
      envelope:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
        `<soap:Body><${action} xmlns="${WSFE_SOAP_NS}"/></soap:Body>` +
        '</soap:Envelope>',
    })
    assertSinFault(res, action)
    return {
      appServer: tag(res, 'AppServer') ?? '',
      dbServer: tag(res, 'DbServer') ?? '',
      authServer: tag(res, 'AuthServer') ?? '',
    }
  }

  /**
   * FEParamGetPtosVenta. Puntos de venta habilitados para el CUIT.
   * Devuelve `[]` si ARCA responde "sin resultados" (error 602).
   */
  async feParamGetPtosVenta(
    auth: ArcaAuth,
  ): Promise<{ nro: number; emisionTipo: string; bloqueado: boolean; fchBaja: string | null }[]> {
    const action = 'FEParamGetPtosVenta'
    const res = await this.call(action, auth, '')
    assertSinFault(res, action)
    const errores = parseErrores(res)
    if (errores.length > 0 && errores.every((e) => e.Code === 602)) return []
    assertSinErrores(res, action)
    return tags(res, 'PtoVenta').map((p) => {
      const fchBaja = tag(p, 'FchBaja')
      return {
        nro: Number(tag(p, 'Nro')),
        emisionTipo: tag(p, 'EmisionTipo') ?? '',
        bloqueado: tag(p, 'Bloqueado') === 'S',
        fchBaja: fchBaja && fchBaja !== 'NULL' ? fchBaja : null,
      }
    })
  }

  /** FECompUltimoAutorizado. Devuelve el número del último comprobante autorizado. */
  async feCompUltimoAutorizado(
    auth: ArcaAuth,
    ptoVta: number,
    cbteTipo: CbteTipo,
  ): Promise<number> {
    const action = 'FECompUltimoAutorizado'
    const res = await this.call(action, auth, `<PtoVta>${ptoVta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`)
    assertSinErrores(res, action)
    const nro = Number(tag(res, 'CbteNro') ?? 0)
    return Number.isFinite(nro) ? nro : 0
  }

  /**
   * Devuelve `nro+1` para que el próximo comprobante a emitir sea `nro+1`.
   * Convenience sobre `feCompUltimoAutorizado`.
   */
  async getNextNumber(auth: ArcaAuth, ptoVta: number, cbteTipo: CbteTipo): Promise<number> {
    return (await this.feCompUltimoAutorizado(auth, ptoVta, cbteTipo)) + 1
  }

  /** FECompConsultar. Recupera un comprobante ya emitido. */
  async feCompConsultar(
    auth: ArcaAuth,
    ptoVta: number,
    cbteTipo: CbteTipo,
    nro: number,
  ): Promise<string> {
    const action = 'FECompConsultar'
    const res = await this.call(
      action,
      auth,
      `<FeCompConsReq><CbteTipo>${cbteTipo}</CbteTipo><CbteNro>${nro}</CbteNro><PtoVta>${ptoVta}</PtoVta></FeCompConsReq>`,
    )
    assertSinErrores(res, action)
    return res
  }

  /**
   * FECAESolicitar. Emite un comprobante.
   * Devuelve el XML crudo; el caller (BillingService) se encarga
   * de parsear CAE, errores, etc. Lanza `WsfeError` solo ante un SOAP fault.
   */
  async fecaeSolicitar(
    auth: ArcaAuth,
    req: {
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
    const imp = calcularImportes(req.cbteTipo, req.items)

    // El orden de los elementos respeta la secuencia del WSDL de FECAEDetRequest
    let det =
      `<Concepto>${req.concepto}</Concepto>` +
      `<DocTipo>${req.docTipo}</DocTipo>` +
      `<DocNro>${req.docNro}</DocNro>` +
      `<CbteDesde>${req.cbteDesde}</CbteDesde>` +
      `<CbteHasta>${req.cbteHasta}</CbteHasta>` +
      `<CbteFch>${req.fecha}</CbteFch>` +
      `<ImpTotal>${money(imp.impTotal)}</ImpTotal>` +
      '<ImpTotConc>0.00</ImpTotConc>' +
      `<ImpNeto>${money(imp.impNeto)}</ImpNeto>` +
      '<ImpOpEx>0.00</ImpOpEx>' +
      '<ImpTrib>0.00</ImpTrib>' +
      `<ImpIVA>${money(imp.impIva)}</ImpIVA>`
    if (req.concepto !== CONCEPTO.PRODUCTOS) {
      det +=
        `<FchServDesde>${req.fchServDesde ?? ''}</FchServDesde>` +
        `<FchServHasta>${req.fchServHasta ?? ''}</FchServHasta>` +
        `<FchVtoPago>${req.fchVtoPago ?? ''}</FchVtoPago>`
    }
    det +=
      `<MonId>${escapeXml(req.moneda)}</MonId>` +
      `<MonCotiz>${req.cotizacion}</MonCotiz>` +
      `<CondicionIVAReceptorId>${req.condIvaReceptor}</CondicionIVAReceptorId>`
    if (req.cbtesAsoc && req.cbtesAsoc.length > 0) {
      det +=
        '<CbtesAsoc>' +
        req.cbtesAsoc
          .map(
            (a) =>
              '<CbteAsoc>' +
              `<Tipo>${a.tipo}</Tipo><PtoVta>${a.ptoVta}</PtoVta><Nro>${a.nro}</Nro>` +
              `<Cuit>${a.cuit ?? auth.cuit}</Cuit>` +
              '</CbteAsoc>',
          )
          .join('') +
        '</CbtesAsoc>'
    }
    if (!isC(req.cbteTipo)) {
      det +=
        '<Iva>' +
        imp.alicuotas
          .map(
            (a) =>
              `<AlicIva><Id>${a.id}</Id><BaseImp>${money(a.baseImp)}</BaseImp><Importe>${money(a.importe)}</Importe></AlicIva>`,
          )
          .join('') +
        '</Iva>'
    }

    const body =
      '<FeCAEReq>' +
      `<FeCabReq><CantReg>1</CantReg><PtoVta>${req.ptoVta}</PtoVta><CbteTipo>${req.cbteTipo}</CbteTipo></FeCabReq>` +
      `<FeDetReq><FECAEDetRequest>${det}</FECAEDetRequest></FeDetReq>` +
      '</FeCAEReq>'
    const action = 'FECAESolicitar'
    const res = await this.call(action, auth, body)
    // Solo el fault es excepción acá: los rechazos (Err/Obs) los interpreta el caller
    assertSinFault(res, action)
    return res
  }
}

// Re-export de constantes útiles al consumidor
export { IVA_ID_TO_PERCENT, CONDICION_IVA_LABELS, ARCA_URLS, WSFE_SOAP_NS }
