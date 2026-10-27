import PQueue from 'p-queue'
import { CONDICION_IVA_LABELS, DOC_TIPO, MONTO_MAX_CONSUMIDOR_FINAL, type CbteTipo } from '../domain/index.js'
import { letraComprobante, prefijoArchivo } from '../domain/comprobante.js'
import { ArcaError, ComprobanteRechazadoError, NetworkError, ValidationError } from '../domain/errors.js'
import { calcularImportes } from '../domain/iva.js'
import type { Logger } from '../domain/logger.js'
import { EmitirComprobanteRequestSchema } from '../domain/schemas.js'
import type { Emisor, EmisorProvider } from '../domain/types.js'
import type { WsaaClient } from '../core/wsaa.js'
import { parseErrores, parseObservaciones, type FeDetalle, type WsfeClient } from '../core/wsfe.js'
import { tag } from '../core/xml.js'
import type { PdfGenerator } from '../pdf/pdf-service.js'
import type { ComprobanteEmitido, EmitirComprobanteRequest } from '../domain/types.js'
import type { ContingenciaService } from './contingencia-service.js'
import { todayYmd } from './date-utils.js'

export interface BillingServiceDeps {
  emisor: EmisorProvider
  wsaa: WsaaClient
  wsfe: WsfeClient
  logger?: Logger
  /** Generador de PDF. Si está, se llama después de emitir. Si no, se omite. */
  pdf?: PdfGenerator
  /**
   * Importe (en pesos) desde el cual se rechaza Consumidor Final sin identificar (DocTipo 99).
   * Default `MONTO_MAX_CONSUMIDOR_FINAL`; `0` desactiva la validación.
   */
  montoMaxConsumidorFinal?: number
  /**
   * Contingencia CAEA. Si está y ARCA no responde antes de pedir el CAE
   * (login o número), el comprobante se autoriza con CAEA y queda pendiente de informar.
   */
  contingencia?: ContingenciaService
}

interface Autorizacion {
  tipo: 'CAE' | 'CAEA'
  ptoVta: number
  nro: number
  codigo: string
  vencimiento: string
  xml: string
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
    const importeTotal = calcularImportes(cbteTipo, req.items).impTotal

    const limiteCf = this.deps.montoMaxConsumidorFinal ?? MONTO_MAX_CONSUMIDOR_FINAL
    if (limiteCf > 0 && req.receptor.docTipo === DOC_TIPO.CONSUMIDOR_FINAL && importeTotal * req.cotizacion >= limiteCf) {
      throw new ValidationError(
        `Desde $${limiteCf.toLocaleString('es-AR')} el Consumidor Final debe identificarse con DNI, CUIL o CDI`,
        [{ path: ['receptor', 'docTipo'], message: 'receptor_debe_identificarse_por_monto' }],
      )
    }

    if (this.deps.contingencia && req.ptoVta === this.deps.contingencia.ptoVta) {
      throw new ValidationError(`El punto de venta ${req.ptoVta} es el de contingencia (CAEA): no se usa para emitir con CAE`, [
        { path: ['ptoVta'], message: 'ptoVta_es_de_contingencia' },
      ])
    }

    const emisor = await this.deps.emisor.getEmisor()
    const detalle: FeDetalle = {
      cbteTipo,
      concepto: req.concepto,
      docTipo: req.receptor.docTipo,
      docNro: req.receptor.docNro,
      condIvaReceptor: req.receptor.condicionIVA,
      fecha,
      moneda: req.moneda,
      cotizacion: req.cotizacion,
      items: req.items,
      cbtesAsoc: req.cbtesAsoc as EmitirComprobanteRequest['cbtesAsoc'],
      fchServDesde: req.fchServDesde,
      fchServHasta: req.fchServHasta,
      fchVtoPago: req.fchVtoPago,
    }
    const aut = await this.queue.add(() => this.autorizar(emisor.cuit, req.ptoVta, detalle))
    const { ptoVta, nro, codigo: cae, vencimiento: vtoCae } = aut

    const fileName =
      `${prefijoArchivo(cbteTipo)}_${letraComprobante(cbteTipo)}_` +
      `${String(ptoVta).padStart(5, '0')}-${String(nro).padStart(8, '0')}.pdf`
    this.deps.logger?.info(
      { event: 'arca.billing.emitido', cbteTipo, ptoVta, nro, cae, tipoAutorizacion: aut.tipo },
      'Comprobante emitido',
    )

    const result: ComprobanteEmitido = {
      cae,
      vtoCae,
      nroComprobante: nro,
      cbteTipo,
      ptoVta,
      importeTotal,
      fileName,
      xml: aut.xml,
      tipoAutorizacion: aut.tipo,
      pendienteInformar: aut.tipo === 'CAEA',
    }

    // El CAE ya está asignado: un fallo del PDF no puede perder el resultado
    if (this.deps.pdf) {
      try {
        result.pdfBuffer = await this.deps.pdf.generateFacturaPdf(
          {
            ptoVta,
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
            tipoCodAut: aut.tipo === 'CAEA' ? 'A' : 'E',
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

  /**
   * Pide número + CAE. Si ARCA no responde antes de mandar FECAESolicitar y hay
   * contingencia, autoriza con CAEA. Si se corta durante FECAESolicitar no cae a CAEA:
   * ARCA pudo haberlo autorizado y se duplicaría la venta.
   */
  private async autorizar(cuit: number, ptoVta: number, detalle: FeDetalle): Promise<Autorizacion> {
    const { wsaa, wsfe, contingencia, logger } = this.deps
    let auth
    let nro: number
    try {
      auth = (await wsaa.authenticate(cuit)).auth
      nro = await wsfe.getNextNumber(auth, ptoVta, detalle.cbteTipo)
    } catch (err) {
      if (!(err instanceof NetworkError) || !contingencia) throw err
      logger?.warn({ event: 'arca.billing.contingencia', err: err.message }, 'ARCA no responde: se emite con CAEA')
      const c = await contingencia.emitirConCaea(detalle)
      return { tipo: 'CAEA', ptoVta: c.ptoVta, nro: c.nro, codigo: c.caea.caea, vencimiento: c.caea.fchVigHasta, xml: '' }
    }

    let xml: string
    try {
      xml = await wsfe.fecaeSolicitar(auth, { ...detalle, ptoVta, cbteDesde: nro, cbteHasta: nro })
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err
      throw new ArcaError(
        `No se sabe si ARCA autorizó el comprobante ${ptoVta}-${nro}: consultalo con comprobantes.consultar() antes de reintentar`,
        'CAE_RESULTADO_INCIERTO',
        { ptoVta, cbteTipo: detalle.cbteTipo, nro, err: err.message },
      )
    }

    const cae = tag(xml, 'CAE') ?? ''
    const vtoCae = tag(xml, 'CAEFchVto') ?? ''
    const observaciones = parseObservaciones(xml)
    if (tag(xml, 'Resultado') !== 'A' || !cae) {
      throw new ComprobanteRechazadoError(cae || undefined, vtoCae || undefined, parseErrores(xml), observaciones)
    }
    if (observaciones.length > 0) {
      logger?.warn({ event: 'arca.billing.observaciones', observaciones }, 'CAE con observaciones')
    }
    return { tipo: 'CAE', ptoVta, nro, codigo: cae, vencimiento: vtoCae, xml }
  }
}

// Re-exports de tipos usados en las firmas del servicio
export type { CbteTipo, Emisor, EmisorProvider }
