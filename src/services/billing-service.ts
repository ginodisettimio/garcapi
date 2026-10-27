import PQueue from 'p-queue'
import { CONDICION_IVA_LABELS, type CbteTipo } from '../domain/index.js'
import { letraComprobante, prefijoArchivo } from '../domain/comprobante.js'
import { ComprobanteRechazadoError, ValidationError } from '../domain/errors.js'
import { calcularImportes } from '../domain/iva.js'
import type { Logger } from '../domain/logger.js'
import { EmitirComprobanteRequestSchema } from '../domain/schemas.js'
import type { Emisor, EmisorProvider } from '../domain/types.js'
import type { WsaaClient } from '../core/wsaa.js'
import { parseErrores, parseObservaciones, type WsfeClient } from '../core/wsfe.js'
import { tag } from '../core/xml.js'
import type { PdfGenerator } from '../pdf/pdf-service.js'
import type { ComprobanteEmitido, EmitirComprobanteRequest } from '../domain/types.js'
import { todayYmd } from './date-utils.js'

export interface BillingServiceDeps {
  emisor: EmisorProvider
  wsaa: WsaaClient
  wsfe: WsfeClient
  logger?: Logger
  /** Generador de PDF. Si está, se llama después de emitir. Si no, se omite. */
  pdf?: PdfGenerator
}

/**
 * Servicio principal de facturación. Emite comprobantes contra ARCA
 * y, opcionalmente, genera el PDF con CAE/QR.
 */
export class BillingService {
  /**
   * Serializa "pedir número + FECAESolicitar": dos emisiones en paralelo
   * pedirían el mismo número y ARCA rechazaría una.
   * shortcut: cola por proceso; con varias réplicas emitiendo en el mismo ptoVta hace falta un lock distribuido.
   */
  private readonly queue = new PQueue({ concurrency: 1 })

  constructor(private readonly deps: BillingServiceDeps) {}

  /**
   * Emite un comprobante electrónico.
   *  1. Valida el input con Zod.
   *  2. Resuelve el emisor vía `EmisorProvider`.
   *  3. Obtiene un TA vigente vía `WsaaClient`.
   *  4. Pide el próximo número a `WsfeClient.feCompUltimoAutorizado`.
   *  5. Llama a `FECAESolicitar`.
   *  6. Parsea el CAE, errores, observaciones.
   *  7. Si hay `pdf`, genera el PDF.
   *  8. Devuelve el resultado.
   */
  async emitir(input: EmitirComprobanteRequest | unknown): Promise<ComprobanteEmitido> {
    const parsed = EmitirComprobanteRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new ValidationError(
        'Request de emisión inválido',
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      )
    }
    const req = parsed.data
    const cbteTipo = req.cbteTipo as CbteTipo
    const fecha = req.fecha ?? todayYmd()

    const emisor = await this.deps.emisor.getEmisor()
    const { auth } = await this.deps.wsaa.authenticate(emisor.cuit)

    const { nro, xml } = await this.queue.add(async () => {
      const nro = await this.deps.wsfe.getNextNumber(auth, req.ptoVta, cbteTipo)
      const xml = await this.deps.wsfe.fecaeSolicitar(auth, {
        ptoVta: req.ptoVta,
        cbteTipo,
        concepto: req.concepto,
        docTipo: req.receptor.docTipo,
        docNro: req.receptor.docNro,
        condIvaReceptor: req.receptor.condicionIVA,
        cbteDesde: nro,
        cbteHasta: nro,
        fecha,
        moneda: req.moneda,
        cotizacion: req.cotizacion,
        items: req.items,
        cbtesAsoc: req.cbtesAsoc as EmitirComprobanteRequest['cbtesAsoc'],
        fchServDesde: req.fchServDesde,
        fchServHasta: req.fchServHasta,
        fchVtoPago: req.fchVtoPago,
      })
      return { nro, xml }
    })

    const resultado = tag(xml, 'Resultado')
    const cae = tag(xml, 'CAE') ?? ''
    const vtoCae = tag(xml, 'CAEFchVto') ?? ''
    const observaciones = parseObservaciones(xml)
    if (resultado !== 'A' || !cae) {
      throw new ComprobanteRechazadoError(cae || undefined, vtoCae || undefined, parseErrores(xml), observaciones)
    }
    if (observaciones.length > 0) {
      this.deps.logger?.warn({ event: 'arca.billing.observaciones', observaciones }, 'CAE con observaciones')
    }

    const importeTotal = calcularImportes(cbteTipo, req.items).impTotal
    const fileName =
      `${prefijoArchivo(cbteTipo)}_${letraComprobante(cbteTipo)}_` +
      `${String(req.ptoVta).padStart(5, '0')}-${String(nro).padStart(8, '0')}.pdf`
    this.deps.logger?.info(
      { event: 'arca.billing.emitido', cbteTipo, ptoVta: req.ptoVta, nro, cae },
      'Comprobante emitido',
    )

    const result: ComprobanteEmitido = {
      cae,
      vtoCae,
      nroComprobante: nro,
      cbteTipo,
      ptoVta: req.ptoVta,
      importeTotal,
      fileName,
      xml,
    }

    // El CAE ya está asignado: un fallo del PDF no puede perder el resultado
    if (this.deps.pdf) {
      try {
        result.pdfBuffer = await this.deps.pdf.generateFacturaPdf(
          {
            ptoVta: req.ptoVta,
            cbteTipo,
            nro,
            fecha,
            cuit: emisor.cuit,
            importe: importeTotal,
            moneda: req.moneda,
            cotizacion: req.cotizacion,
            tipoDocRec: req.receptor.docTipo,
            nroDocRec: req.receptor.docNro,
            cae,
            vtoCae,
            items: req.items,
            condicionIvaEmisor: emisor.condicionIva,
            razonSocialEmisor: emisor.razonSocial,
            domicilioEmisor: emisor.domicilio,
            inicioActividades: emisor.inicioActividades,
            ingresosBrutos: emisor.ingresosBrutos,
            razonSocialReceptor: req.receptor.razonSocial,
            domicilioReceptor: req.receptor.domicilio ?? '-',
            condicionIvaReceptor: CONDICION_IVA_LABELS[req.receptor.condicionIVA] ?? String(req.receptor.condicionIVA),
            condicionVenta: req.condicionVenta,
            datosBancarios: emisor.datosBancarios,
            cbtesAsoc: req.cbtesAsoc as EmitirComprobanteRequest['cbtesAsoc'],
          },
          fileName,
        )
      } catch (err) {
        this.deps.logger?.warn(
          { event: 'arca.billing.pdf_error', cae, nro, err: String(err) },
          'Comprobante emitido pero falló la generación del PDF',
        )
      }
    }

    return result
  }
}

// Re-exports de tipos usados en las firmas del servicio
export type { CbteTipo, Emisor, EmisorProvider }
