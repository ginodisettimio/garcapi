import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, it, expect } from 'vitest'
import { AxiosSoapClient, createArca, FileCaeaStore, NetworkError, type SoapClient } from '../../src/index.js'

/**
 * E2E de la contingencia CAEA contra homologación. Además de lo de `emitir.test.ts`, requiere:
 * - ARCA_CAEA_PTO_VTA=<punto de venta habilitado como CAEA en homologación>
 * Simula la caída de ARCA cortando FECompUltimoAutorizado del punto de venta normal.
 */
const cuit = process.env.ARCA_CUIT
const ptoVtaCaea = Number(process.env.ARCA_CAEA_PTO_VTA)

describe.skipIf(!cuit || !ptoVtaCaea)('E2E homologación: contingencia CAEA', () => {
  let dir = ''
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('emite con CAEA cuando ARCA no responde y lo informa cuando vuelve', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'arca-caea-e2e-'))
    const real = new AxiosSoapClient()
    let caido = false
    const soap: SoapClient = {
      post: (a) =>
        caido && a.action === 'FECompUltimoAutorizado' ? Promise.reject(new NetworkError('ARCA caído (simulado)')) : real.post(a),
    }
    const arca = createArca({
      cuit: Number(cuit),
      razonSocial: 'Test S.A.',
      domicilio: 'Av. Test 123',
      condicionIva: 'Responsable Inscripto',
      inicioActividades: '01/01/2020',
      ingresosBrutos: '123456789',
      ptoVtaDefault: Number(process.env.ARCA_PTO_VTA ?? 1),
      arcaEnv: 'homologacion',
      pdf: { enabled: false },
      soapClient: soap,
      contingencia: { ptoVta: ptoVtaCaea, store: new FileCaeaStore(dir) },
    })
    try {
      const [caea] = await arca.contingencia!.prepararCaea()
      expect(caea!.caea).toMatch(/^\d{14}$/)

      caido = true
      const r = await arca.billing.emitir({
        ptoVta: Number(process.env.ARCA_PTO_VTA ?? 1),
        cbteTipo: 6,
        receptor: { docTipo: 99, docNro: 0, condicionIVA: 5, razonSocial: 'Consumidor Final' },
        items: [{ descripcion: 'Venta en contingencia', cantidad: 1, precioUnitario: 100, iva: 21 }],
        condicionVenta: 'Contado',
      })
      expect(r).toMatchObject({ tipoAutorizacion: 'CAEA', pendienteInformar: true, ptoVta: ptoVtaCaea, cae: caea!.caea })

      caido = false
      const informe = await arca.contingencia!.informarPendientes()
      expect(informe.rechazados).toEqual([])
      expect(informe.informados).toEqual([`${ptoVtaCaea}-6-${r.nroComprobante}`])
    } finally {
      await arca.close()
    }
  }, 120_000)
})
