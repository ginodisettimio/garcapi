import { describe, it, expect } from 'vitest'
import { createArca } from '../../src/index.js'

// Versión pública: la factory devuelve stubs. Tests completos en la versión pro.
describe.skip('createArca factory', () => {
  it('construye todas las dependencias con defaults', () => {
    const arca = createArca({
      cuit: 20223565078,
      razonSocial: 'Test S.A.',
      domicilio: 'Av. Test 123',
      condicionIva: 'Responsable Inscripto',
      inicioActividades: '01/01/2020',
      ingresosBrutos: '123456789',
      ptoVtaDefault: 1,
      pdf: { enabled: false },
    })
    expect(arca.billing).toBeDefined()
    expect(arca.comprobantes).toBeDefined()
    expect(arca.cuit).toBeDefined()
    expect(arca.wsaa).toBeDefined()
    expect(arca.wsfe).toBeDefined()
    expect(arca.puppeteer).toBeNull()
    expect(arca.pdf).toBeNull()
    expect(arca.config.arcaEnv).toBe('homologacion')
  })

  it('acepta emisorProvider custom', async () => {
    let calls = 0
    const arca = createArca({
      cuit: 1, // ignorado porque pasamos emisorProvider
      razonSocial: 'x',
      domicilio: 'x',
      condicionIva: 'x',
      inicioActividades: 'x',
      ingresosBrutos: 'x',
      ptoVtaDefault: 1,
      emisorProvider: {
        async getEmisor() {
          calls++
          return {
            cuit: 99999999999,
            razonSocial: 'Custom',
            domicilio: 'x',
            condicionIva: 'x',
            inicioActividades: 'x',
            ingresosBrutos: 'x',
            ptoVtaDefault: 1,
          }
        },
      },
      pdf: { enabled: false },
    })
    const emi = await arca.emisor.getEmisor()
    expect(emi.cuit).toBe(99999999999)
    expect(calls).toBeGreaterThanOrEqual(1)
    void arca
  })

  it('acepta logger custom', () => {
    const arca = createArca({
      cuit: 1,
      razonSocial: 'x',
      domicilio: 'x',
      condicionIva: 'x',
      inicioActividades: 'x',
      ingresosBrutos: 'x',
      ptoVtaDefault: 1,
      pdf: { enabled: false },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    })
    expect(arca.logger).toBeDefined()
  })

  it('pdf.enabled=true (default) crea puppeteer', () => {
    const arca = createArca({
      cuit: 1,
      razonSocial: 'x',
      domicilio: 'x',
      condicionIva: 'x',
      inicioActividades: 'x',
      ingresosBrutos: 'x',
      ptoVtaDefault: 1,
    })
    expect(arca.puppeteer).not.toBeNull()
    expect(arca.pdf).not.toBeNull()
    void arca
  })
})
