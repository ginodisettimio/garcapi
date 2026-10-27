import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { CBTE_TIPO, IVA_ID_TO_PERCENT, letraComprobante, nombreComprobante, calcularImportes } from '../domain/index.js'
import type { ComprobanteAsociado, Item, CbteTipo, ImportesComprobante, PdfFormato } from '../domain/index.js'
import { escapeXml } from '../core/xml.js'
import { ymdToDmy } from '../services/date-utils.js'
import { setUtf8Content, resolveTemplatePath, type PuppeteerManager } from './puppeteer-manager.js'
import { buildQrDataUrl } from './qr.js'

export interface FacturaPdfData {
  ptoVta: number
  cbteTipo: CbteTipo
  nro: number
  fecha: string
  cuit: number
  importe: number
  moneda: string
  cotizacion: number
  tipoDocRec: number
  nroDocRec: number
  cae: string
  vtoCae: string
  /** 'E' = CAE (default), 'A' = CAEA de contingencia. */
  tipoCodAut?: 'E' | 'A'
  items: Item[]
  condicionIvaEmisor: string
  razonSocialEmisor: string
  domicilioEmisor: string
  inicioActividades: string
  ingresosBrutos: string
  razonSocialReceptor: string
  domicilioReceptor: string
  condicionIvaReceptor: string
  condicionVenta: string
  datosBancarios?: string
  cbtesAsoc?: ComprobanteAsociado[]
}

export interface PresupuestoPdfData {
  nro: number
  fecha: string
  cuit: number
  items: Item[]
  condicionIvaEmisor: string
  razonSocialEmisor: string
  domicilioEmisor: string
  inicioActividades: string
  ingresosBrutos: string
  razonSocialReceptor: string
  domicilioReceptor: string
  condicionIvaReceptor: string
  condicionVenta: string
  tipoDocRec?: number
  nroDocRec?: number
  tituloDocumento?: string
  referenciaOrigen?: string
}

/** Interfaz pública del generador de PDFs. */
export interface PdfGenerator {
  generateFacturaPdf(data: FacturaPdfData, fileName: string, opts?: { formato?: PdfFormato }): Promise<Buffer>
  generatePresupuestoPdf(data: PresupuestoPdfData, fileName: string): Promise<Buffer>
}

export interface PdfServiceOptions {
  /** Manager de Puppeteer (se puede compartir entre servicios). */
  puppeteer: PuppeteerManager
  /** Path al template de factura. Si está vacío, usa el default del paquete. */
  templateFactura?: string | null
  /** Path al template de presupuesto. Si está vacío, usa el default. */
  templatePresupuesto?: string | null
  /** Path al template de ticket. Si está vacío, usa el default. */
  templateTicket?: string | null
  /** Formato por defecto de las facturas. Default 'a4'. */
  formato?: PdfFormato
  /** Ancho del ticket en mm (80 o 58 en las térmicas habituales). Default 80. */
  anchoTicketMm?: number
  /** URL base del QR AFIP. Default: 'https://www.afip.gob.ar/fe/qr/'. */
  qrBaseUrl?: string
}

const DOC_TIPO_LABELS: Record<number, string> = {
  80: 'CUIT',
  86: 'CUIL',
  87: 'CDI',
  94: 'Pasaporte',
  96: 'DNI',
}

const MONEY = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DECIMAL = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 })

function money(n: number): string {
  return `$ ${MONEY.format(n)}`
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

function formatCuit(cuit: number | string): string {
  const s = String(cuit)
  return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s
}

function formatDocReceptor(tipo?: number, nro?: number): string {
  if (tipo === undefined || !nro) return 'Consumidor Final'
  const label = DOC_TIPO_LABELS[tipo] ?? `Doc. ${tipo}`
  return `${label}: ${label === 'CUIT' || label === 'CUIL' ? formatCuit(nro) : nro}`
}

/**
 * Reemplaza `{{campo}}` (texto, escapado) y `{{{campo}}}` (HTML crudo)
 * en una sola pasada, para que los datos del usuario no se re-interpreten.
 */
export function fillTemplate(
  template: string,
  text: Record<string, string | number>,
  raw: Record<string, string> = {},
): string {
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_m, rawKey?: string, textKey?: string) =>
    rawKey ? (raw[rawKey] ?? '') : escapeXml(String(text[textKey!] ?? '')),
  )
}

/**
 * Tabla de ítems según la letra:
 * - A (y presupuesto): precio neto + alícuota.
 * - B: precio con IVA incluido.
 * - C: precio tal cual.
 */
function lineAmounts(letra: 'A' | 'B' | 'C', it: Item): { unit: number; subtotal: number } {
  const factor = letra === 'B' ? 1 + it.iva / 100 : 1
  return { unit: round2(it.precioUnitario * factor), subtotal: round2(it.cantidad * it.precioUnitario * factor) }
}

function renderItems(letra: 'A' | 'B' | 'C', items: readonly Item[]): string {
  const head =
    '<tr><th class="num">Cant.</th><th>Descripción</th><th class="num">Precio unit.</th>' +
    (letra === 'A' ? '<th class="num">IVA</th>' : '') +
    '<th class="num">Subtotal</th></tr>'
  const rows = items
    .map((it) => {
      const { unit, subtotal } = lineAmounts(letra, it)
      return (
        '<tr>' +
        `<td class="num">${DECIMAL.format(it.cantidad)}</td>` +
        `<td>${escapeXml(it.codigo !== undefined ? `${it.codigo} - ${it.descripcion}` : it.descripcion)}</td>` +
        `<td class="num">${money(unit)}</td>` +
        (letra === 'A' ? `<td class="num">${DECIMAL.format(it.iva)} %</td>` : '') +
        `<td class="num">${money(subtotal)}</td>` +
        '</tr>'
      )
    })
    .join('')
  return `<table class="items"><thead>${head}</thead><tbody>${rows}</tbody></table>`
}

function renderTotales(
  letra: 'A' | 'B' | 'C',
  imp: ImportesComprobante,
  moneda = 'PES',
  cotizacion = 1,
): string {
  const row = (label: string, value: number, cls = '') =>
    `<tr class="${cls}"><td>${escapeXml(label)}</td><td class="num">${money(value)}</td></tr>`
  let rows = ''
  if (letra === 'A') {
    rows += row('Importe neto gravado', imp.impNeto)
    for (const a of imp.alicuotas) {
      rows += row(`IVA ${DECIMAL.format(IVA_ID_TO_PERCENT[a.id] ?? 0)} %`, a.importe)
    }
  }
  rows += row('Importe total', imp.impTotal, 'total')
  if (moneda !== 'PES') {
    rows += `<tr><td>Moneda</td><td class="num">${escapeXml(moneda)} (cotización ${MONEY.format(cotizacion)})</td></tr>`
  }
  let html = `<table class="totales">${rows}</table>`
  if (letra === 'B') {
    html +=
      '<p class="transparencia">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)<br>' +
      `IVA contenido: ${money(imp.impIva)}</p>`
  }
  return html
}

function renderItemsTicket(letra: 'A' | 'B' | 'C', items: readonly Item[]): string {
  return items
    .map((it) => {
      const { unit, subtotal } = lineAmounts(letra, it)
      const desc = it.codigo !== undefined ? `${it.codigo} - ${it.descripcion}` : it.descripcion
      const iva = letra === 'A' ? ` (IVA ${DECIMAL.format(it.iva)} %)` : ''
      return (
        '<div class="item">' +
        `<div class="desc">${escapeXml(desc)}</div>` +
        `<div class="linea"><span>${DECIMAL.format(it.cantidad)} x ${money(unit)}${iva}</span><span>${money(subtotal)}</span></div>` +
        '</div>'
      )
    })
    .join('')
}

function facturaFields(data: FacturaPdfData, qrDataUrl: string, titulo: string): Record<string, string> {
  const cbtesAsoc = (data.cbtesAsoc ?? [])
    .map((a) => `${nombreComprobante(a.tipo)} ${pad(a.ptoVta, 5)}-${pad(a.nro, 8)}`)
    .join(', ')
  return {
    titulo,
    letra: letraComprobante(data.cbteTipo),
    codigo: pad(data.cbteTipo, 3),
    tipoComprobante: nombreComprobante(data.cbteTipo).replace(/ [ABC]$/, '').toUpperCase(),
    ptoVta: pad(data.ptoVta, 5),
    nro: pad(data.nro, 8),
    fecha: ymdToDmy(data.fecha),
    razonSocialEmisor: data.razonSocialEmisor,
    domicilioEmisor: data.domicilioEmisor,
    condicionIvaEmisor: data.condicionIvaEmisor,
    cuitEmisor: formatCuit(data.cuit),
    ingresosBrutos: data.ingresosBrutos,
    inicioActividades: data.inicioActividades,
    razonSocialReceptor: data.razonSocialReceptor,
    domicilioReceptor: data.domicilioReceptor,
    condicionIvaReceptor: data.condicionIvaReceptor,
    docReceptor: formatDocReceptor(data.tipoDocRec, data.nroDocRec),
    condicionVenta: data.condicionVenta,
    cbtesAsoc: cbtesAsoc ? `Comprobantes asociados: ${cbtesAsoc}` : '',
    datosBancarios: data.datosBancarios ?? '',
    cae: data.cae,
    tipoAutorizacion: data.tipoCodAut === 'A' ? 'CAEA' : 'CAE',
    vtoCae: ymdToDmy(data.vtoCae),
    qr: qrDataUrl,
  }
}

/** Renderiza el HTML de una factura/nota a partir del template. Función pura, sin browser. */
export function renderFacturaHtml(template: string, data: FacturaPdfData, qrDataUrl: string, titulo = ''): string {
  const letra = letraComprobante(data.cbteTipo)
  const imp = calcularImportes(data.cbteTipo, data.items)
  return fillTemplate(template, facturaFields(data, qrDataUrl, titulo), {
    items: renderItems(letra, data.items),
    totales: renderTotales(letra, imp, data.moneda, data.cotizacion),
  })
}

/** Renderiza el HTML de una factura/nota en formato ticket. Función pura, sin browser. */
export function renderTicketHtml(template: string, data: FacturaPdfData, qrDataUrl: string, titulo = ''): string {
  const letra = letraComprobante(data.cbteTipo)
  const imp = calcularImportes(data.cbteTipo, data.items)
  return fillTemplate(template, facturaFields(data, qrDataUrl, titulo), {
    items: renderItemsTicket(letra, data.items),
    totales: renderTotales(letra, imp, data.moneda, data.cotizacion),
  })
}

/** Renderiza el HTML de un presupuesto (no fiscal, IVA discriminado). Función pura, sin browser. */
export function renderPresupuestoHtml(template: string, data: PresupuestoPdfData, titulo = ''): string {
  const imp = calcularImportes(CBTE_TIPO.FACTURA_A, data.items)
  return fillTemplate(
    template,
    {
      titulo,
      tituloDocumento: (data.tituloDocumento ?? 'Presupuesto').toUpperCase(),
      nro: pad(data.nro, 8),
      fecha: ymdToDmy(data.fecha),
      razonSocialEmisor: data.razonSocialEmisor,
      domicilioEmisor: data.domicilioEmisor,
      condicionIvaEmisor: data.condicionIvaEmisor,
      cuitEmisor: formatCuit(data.cuit),
      ingresosBrutos: data.ingresosBrutos,
      inicioActividades: data.inicioActividades,
      razonSocialReceptor: data.razonSocialReceptor,
      domicilioReceptor: data.domicilioReceptor,
      condicionIvaReceptor: data.condicionIvaReceptor,
      docReceptor: formatDocReceptor(data.tipoDocRec, data.nroDocRec),
      condicionVenta: data.condicionVenta,
      referenciaOrigen: data.referenciaOrigen ? `Referencia: ${data.referenciaOrigen}` : '',
    },
    {
      items: renderItems('A', data.items),
      totales: renderTotales('A', imp),
    },
  )
}

/**
 * Servicio de generación de PDFs. Usa Puppeteer para renderizar
 * los templates HTML por defecto (o los provistos por el usuario).
 */
export class PdfService implements PdfGenerator {
  constructor(private readonly opts: PdfServiceOptions) {}

  async generateFacturaPdf(data: FacturaPdfData, fileName: string, opts: { formato?: PdfFormato } = {}): Promise<Buffer> {
    const formato = opts.formato ?? this.opts.formato ?? 'a4'
    const qr = await buildQrDataUrl(data, this.opts.qrBaseUrl)
    if (formato === 'ticket') {
      const template = await loadTemplate(this.opts.templateTicket, 'ticket.html', 'ticket')
      return this.renderTicket(renderTicketHtml(template, data, qr, fileName))
    }
    const template = await loadTemplate(this.opts.templateFactura, 'factura.html', 'factura')
    return this.render(renderFacturaHtml(template, data, qr, fileName))
  }

  async generatePresupuestoPdf(data: PresupuestoPdfData, fileName: string): Promise<Buffer> {
    const template = await loadTemplate(this.opts.templatePresupuesto, 'presupuesto.html', 'presupuesto')
    return this.render(renderPresupuestoHtml(template, data, fileName))
  }

  /** Cierra el browser subyacente. */
  async close(): Promise<void> {
    await this.opts.puppeteer.close()
  }

  private render(html: string): Promise<Buffer> {
    return this.opts.puppeteer.withPage(async (page) => {
      await setUtf8Content(page, html)
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
    })
  }

  /** Ticket: ancho fijo en mm y alto medido del contenido, para que no corte ni deje papel en blanco. */
  private renderTicket(html: string): Promise<Buffer> {
    const mm = this.opts.anchoTicketMm ?? 80
    return this.opts.puppeteer.withPage(async (page) => {
      await page.setViewport({ width: Math.round((mm * 96) / 25.4), height: 600 })
      await page.emulateMediaType('print')
      await setUtf8Content(page, html)
      const alto = await page.evaluate(() => document.documentElement.scrollHeight)
      return Buffer.from(
        await page.pdf({
          width: `${mm}mm`,
          height: `${Math.ceil(alto) + 2}px`,
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        }),
      )
    })
  }
}

function loadTemplate(custom: string | null | undefined, file: string, label: string): Promise<string> {
  const templatePath = custom
    ? resolveTemplatePath(custom, label)
    : fileURLToPath(new URL(`./templates/${file}`, import.meta.url))
  return readFile(templatePath, 'utf8')
}
