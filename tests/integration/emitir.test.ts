import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { createArca, CBTE_TIPO, CONCEPTO, CONDICION_IVA, DOC_TIPO, type ArcaModule } from '../../src/index.js'
import { todayYmd } from '../../src/services/date-utils.js'

/**
 * E2E contra ARCA homologación. Requiere:
 * - certs/homologacion/cert.crt + private.key (o CERTS_DIR)
 * - ARCA_CUIT=<cuit del cert>
 * - ARCA_PTO_VTA=<punto de venta habilitado para WS> (default 1)
 * - ARCA_CUIT_RECEPTOR=<cuit receptor de la Factura A> (default 20111111112; ARCA rechaza el mismo CUIT del emisor)
 */
const cuit = process.env.ARCA_CUIT
const ptoVta = Number(process.env.ARCA_PTO_VTA ?? 1)
const cuitReceptor = Number(process.env.ARCA_CUIT_RECEPTOR ?? 20111111112)

const consumidorFinal = {
  docTipo: DOC_TIPO.CONSUMIDOR_FINAL,
  docNro: 0,
  condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL,
  razonSocial: 'Consumidor Final',
}

describe.skipIf(!cuit)('E2E homologación', () => {
  let arca: ArcaModule
  let facturaBNro = 0

  beforeAll(() => {
    arca = createArca({
      cuit: Number(cuit),
      razonSocial: 'Test S.A.',
      domicilio: 'Av. Test 123',
      condicionIva: 'Responsable Inscripto',
      inicioActividades: '01/01/2020',
      ingresosBrutos: '123456789',
      ptoVtaDefault: ptoVta,
      arcaEnv: 'homologacion',
      pdf: { enabled: false },
    })
  })

  afterAll(async () => {
    await arca.close()
  })

  it('Factura B a Consumidor Final', async () => {
    const ultimo = await arca.comprobantes.ultimoAutorizado(ptoVta, CBTE_TIPO.FACTURA_B)
    const r = await arca.billing.emitir({
      ptoVta,
      cbteTipo: CBTE_TIPO.FACTURA_B,
      concepto: CONCEPTO.PRODUCTOS,
      receptor: consumidorFinal,
      items: [{ descripcion: 'Producto 1', cantidad: 1, precioUnitario: 826.45, iva: 21 }],
      condicionVenta: 'Contado',
    })
    expect(r.cae).toMatch(/^\d{14}$/)
    expect(r.nroComprobante).toBe(ultimo + 1)
    expect(r.importeTotal).toBe(1000)
    facturaBNro = r.nroComprobante
  }, 60_000)

  it('Factura A a CUIT con dos alícuotas', async () => {
    const r = await arca.billing.emitir({
      ptoVta,
      cbteTipo: CBTE_TIPO.FACTURA_A,
      concepto: CONCEPTO.PRODUCTOS,
      receptor: {
        docTipo: DOC_TIPO.CUIT,
        docNro: cuitReceptor,
        condicionIVA: CONDICION_IVA.RESPONSABLE_INSCRIPTO,
        razonSocial: 'Cliente RI S.A.',
      },
      items: [
        { descripcion: 'Producto 21', cantidad: 2, precioUnitario: 100, iva: 21 },
        { descripcion: 'Producto 10.5', cantidad: 1, precioUnitario: 200, iva: 10.5 },
      ],
      condicionVenta: 'Cuenta Corriente',
    })
    expect(r.cae).toMatch(/^\d{14}$/)
    expect(r.importeTotal).toBe(463)
  }, 60_000)

  it('Nota de Crédito B asociada a la Factura B', async () => {
    expect(facturaBNro).toBeGreaterThan(0)
    const r = await arca.billing.emitir({
      ptoVta,
      cbteTipo: CBTE_TIPO.NOTA_CREDITO_B,
      concepto: CONCEPTO.PRODUCTOS,
      receptor: consumidorFinal,
      items: [{ descripcion: 'Devolución Producto 1', cantidad: 1, precioUnitario: 826.45, iva: 21 }],
      cbtesAsoc: [{ tipo: CBTE_TIPO.FACTURA_B, ptoVta, nro: facturaBNro }],
      condicionVenta: 'Contado',
    })
    expect(r.cae).toMatch(/^\d{14}$/)
    expect(r.fileName).toMatch(/^F_NC_B_/)
  }, 60_000)

  it('Factura B de servicios (concepto 2) con fechas', async () => {
    const hoy = todayYmd()
    const r = await arca.billing.emitir({
      ptoVta,
      cbteTipo: CBTE_TIPO.FACTURA_B,
      concepto: CONCEPTO.SERVICIOS,
      receptor: consumidorFinal,
      items: [{ descripcion: 'Servicio mensual', cantidad: 1, precioUnitario: 1000, iva: 21 }],
      fchServDesde: hoy,
      fchServHasta: hoy,
      fchVtoPago: hoy,
      condicionVenta: 'Contado',
    })
    expect(r.cae).toMatch(/^\d{14}$/)
    expect(r.importeTotal).toBe(1210)
  }, 60_000)
})
