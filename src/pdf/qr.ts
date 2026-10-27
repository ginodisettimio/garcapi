import QRCode from 'qrcode'
import { ARCA_URLS } from '../domain/constants.js'
import { ymdToIso } from '../services/date-utils.js'
import type { FacturaPdfData } from './pdf-service.js'

/**
 * Arma la URL del QR de AFIP (RG 4892): `<baseUrl>?p=<base64(JSON)>`.
 * @see https://www.afip.gob.ar/fe/qr/especificaciones.asp
 */
export function buildQrUrl(data: FacturaPdfData, baseUrl: string = ARCA_URLS.produccion.qr): string {
  const payload = {
    ver: 1,
    fecha: ymdToIso(data.fecha),
    cuit: data.cuit,
    ptoVta: data.ptoVta,
    tipoCmp: data.cbteTipo,
    nroCmp: data.nro,
    importe: data.importe,
    moneda: data.moneda,
    ctz: data.cotizacion,
    tipoDocRec: data.tipoDocRec,
    nroDocRec: data.nroDocRec,
    tipoCodAut: 'E',
    codAut: Number(data.cae),
  }
  return `${baseUrl}?p=${Buffer.from(JSON.stringify(payload)).toString('base64')}`
}

/** Genera la imagen del QR de AFIP como data URL PNG. */
export function buildQrDataUrl(data: FacturaPdfData, baseUrl?: string): Promise<string> {
  return QRCode.toDataURL(buildQrUrl(data, baseUrl), { margin: 0, width: 220 })
}
