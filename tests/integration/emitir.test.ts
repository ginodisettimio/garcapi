import { describe, it, expect } from 'vitest'
import { createArca, CBTE_TIPO, CONCEPTO, CONDICION_IVA, DOC_TIPO } from '../../src/index.js'

/**
 * E2E contra ARCA homologación. Requiere:
 * - certs/homologacion/cert.crt + private.key (o CERTS_DIR)
 * - ARCA_CUIT=<cuit del cert>
 * - ARCA_PTO_VTA=<punto de venta habilitado para WS> (default 1)
 */
const cuit = process.env.ARCA_CUIT

describe.skipIf(!cuit)('E2E homologación: emitir Factura B', () => {
  it('obtiene CAE', async () => {
    const ptoVta = Number(process.env.ARCA_PTO_VTA ?? 1)
    const arca = createArca({
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
    try {
      const ultimo = await arca.comprobantes.ultimoAutorizado(ptoVta, CBTE_TIPO.FACTURA_B)
      const r = await arca.billing.emitir({
        ptoVta,
        cbteTipo: CBTE_TIPO.FACTURA_B,
        concepto: CONCEPTO.PRODUCTOS,
        receptor: {
          docTipo: DOC_TIPO.CONSUMIDOR_FINAL,
          docNro: 0,
          condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL,
          razonSocial: 'Consumidor Final',
        },
        items: [{ descripcion: 'Producto 1', cantidad: 1, precioUnitario: 826.45, iva: 21 }],
        condicionVenta: 'Contado',
      })
      expect(r.cae).toMatch(/^\d{14}$/)
      expect(r.nroComprobante).toBe(ultimo + 1)
      expect(r.importeTotal).toBe(1000)
    } finally {
      await arca.close()
    }
  }, 60_000)
})
