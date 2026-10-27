import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { buildQrUrl } from '../../src/pdf/qr.js'
import { fillTemplate, renderFacturaHtml, renderPresupuestoHtml, type FacturaPdfData } from '../../src/pdf/pdf-service.js'

const facturaTemplate = readFileSync(new URL('../../src/pdf/templates/factura.html', import.meta.url), 'utf8')
const presupuestoTemplate = readFileSync(new URL('../../src/pdf/templates/presupuesto.html', import.meta.url), 'utf8')

function facturaB(overrides: Partial<FacturaPdfData> = {}): FacturaPdfData {
  return {
    ptoVta: 1,
    cbteTipo: 6,
    nro: 42,
    fecha: '20261026',
    cuit: 20219478012,
    importe: 1000,
    moneda: 'PES',
    cotizacion: 1,
    tipoDocRec: 99,
    nroDocRec: 0,
    cae: '86431024007837',
    vtoCae: '20261105',
    items: [{ descripcion: 'Producto 1', cantidad: 1, precioUnitario: 826.45, iva: 21 }],
    condicionIvaEmisor: 'Responsable Inscripto',
    razonSocialEmisor: 'Test S.A.',
    domicilioEmisor: 'Av. Test 123',
    inicioActividades: '01/01/2020',
    ingresosBrutos: '123456789',
    razonSocialReceptor: 'Consumidor Final',
    domicilioReceptor: '-',
    condicionIvaReceptor: 'Consumidor Final',
    condicionVenta: 'Contado',
    ...overrides,
  }
}

describe('buildQrUrl', () => {
  it('codifica el JSON de AFIP en base64', () => {
    const url = new URL(buildQrUrl(facturaB()))
    expect(url.origin + url.pathname).toBe('https://www.afip.gob.ar/fe/qr/')
    const payload = JSON.parse(Buffer.from(url.searchParams.get('p')!, 'base64').toString())
    expect(payload).toEqual({
      ver: 1,
      fecha: '2026-10-26',
      cuit: 20219478012,
      ptoVta: 1,
      tipoCmp: 6,
      nroCmp: 42,
      importe: 1000,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 86431024007837,
    })
  })
})

describe('fillTemplate', () => {
  it('escapa {{texto}}, inserta {{{html}}} y no re-interpreta datos del usuario', () => {
    const out = fillTemplate('<p>{{a}}</p>{{{b}}}<i>{{c}}</i>', { a: '<b>x</b>', c: '{{a}}' }, { b: '<hr>' })
    expect(out).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p><hr><i>{{a}}</i>')
  })
})

describe('renderFacturaHtml', () => {
  it('Factura B: precio con IVA incluido y transparencia fiscal', () => {
    const html = renderFacturaHtml(facturaTemplate, facturaB(), 'data:image/png;base64,QR')
    expect(html).toContain('<div class="l">B</div>')
    expect(html).toContain('COD. 006')
    expect(html).toContain('00001')
    expect(html).toContain('00000042')
    expect(html).toContain('$ 1.000,00')
    expect(html).toContain('IVA contenido: $ 173,55')
    expect(html).not.toContain('Importe neto gravado')
    expect(html).toContain('86431024007837')
    expect(html).toContain('05/11/2026')
    expect(html).toContain('src="data:image/png;base64,QR"')
    expect(html).not.toMatch(/\{\{/)
  })

  it('Factura A: neto e IVA discriminado por alícuota', () => {
    const html = renderFacturaHtml(
      facturaTemplate,
      facturaB({
        cbteTipo: 1,
        tipoDocRec: 80,
        nroDocRec: 20111111112,
        items: [
          { descripcion: 'a', cantidad: 2, precioUnitario: 100, iva: 21 },
          { descripcion: 'b', cantidad: 1, precioUnitario: 200, iva: 10.5 },
        ],
      }),
      '',
    )
    expect(html).toContain('CUIT: 20-11111111-2')
    expect(html).toContain('Importe neto gravado')
    expect(html).toContain('IVA 21 %')
    expect(html).toContain('IVA 10,5 %')
    expect(html).toContain('$ 463,00')
    expect(html).not.toContain('IVA contenido')
  })

  it('Nota de Crédito: muestra comprobantes asociados', () => {
    const html = renderFacturaHtml(
      facturaTemplate,
      facturaB({ cbteTipo: 8, cbtesAsoc: [{ tipo: 6, ptoVta: 1, nro: 41 }] }),
      '',
    )
    expect(html).toContain('NOTA DE CRÉDITO')
    expect(html).toContain('Comprobantes asociados: Factura B 00001-00000041')
  })

  it('escapa HTML de los datos del receptor', () => {
    const html = renderFacturaHtml(facturaTemplate, facturaB({ razonSocialReceptor: '<script>x</script>' }), '')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderPresupuestoHtml', () => {
  it('usa el título y discrimina IVA', () => {
    const { cbteTipo: _t, cae: _c, ...rest } = facturaB()
    const html = renderPresupuestoHtml(presupuestoTemplate, { ...rest, nro: 7, referenciaOrigen: 'Pedido 123' })
    expect(html).toContain('PRESUPUESTO')
    expect(html).toContain('Referencia: Pedido 123')
    expect(html).toContain('IVA 21 %')
    expect(html).not.toMatch(/\{\{/)
  })
})
