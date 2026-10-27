import { describe, it, expect } from 'vitest'
import { createArca } from '../../src/index.js'
import { PadronError } from '../../src/domain/errors.js'

/**
 * E2E del Padrón A13 contra homologación. Además de lo de `emitir.test.ts`, requiere:
 * - el cert autorizado para el servicio `ws_sr_padron_a13` en WSASS
 * - ARCA_PADRON_A13=1 (opt-in, para no fallar mientras no esté autorizado)
 * - ARCA_PADRON_CUIT=<cuit a consultar> (default ARCA_CUIT)
 */
const cuit = process.env.ARCA_CUIT

describe.skipIf(!cuit || process.env.ARCA_PADRON_A13 !== '1')('E2E homologación: Padrón A13', () => {
  const arca = createArca({
    cuit: Number(cuit),
    razonSocial: 'Test S.A.',
    domicilio: 'Av. Test 123',
    condicionIva: 'Responsable Inscripto',
    inicioActividades: '01/01/2020',
    ingresosBrutos: '123456789',
    ptoVtaDefault: 1,
    arcaEnv: 'homologacion',
    pdf: { enabled: false },
  })

  it('consulta un CUIT existente', async () => {
    const consultado = process.env.ARCA_PADRON_CUIT ?? String(cuit)
    const info = await arca.cuit.lookup(consultado)
    expect(info.cuit).toBe(consultado)
    expect(info.razonSocial).toBeTruthy()
  }, 60_000)

  it('CUIT inexistente → CUIT_NO_ENCONTRADO', async () => {
    const err = await arca.cuit.lookup('20000000001').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PadronError)
    expect((err as PadronError).code).toBe('CUIT_NO_ENCONTRADO')
  }, 60_000)
})
