import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { FileCaeaStore, MemoryCaeaStore } from '../../src/core/caea-store.js'
import { MemoryTaStorage } from '../../src/core/storage.js'
import type { SoapClient, SoapPostArgs } from '../../src/core/soap-client.js'
import { WsaaClient } from '../../src/core/wsaa.js'
import { WsfeClient } from '../../src/core/wsfe.js'
import { ComprobanteRechazadoError, NetworkError } from '../../src/domain/errors.js'
import { SilentLogger } from '../../src/domain/logger.js'
import { StaticEmisorProvider } from '../../src/domain/types.js'
import { BillingService } from '../../src/services/billing-service.js'
import { ContingenciaService, quincenaDe, siguienteQuincena } from '../../src/services/contingencia-service.js'

const TA = `<loginTicketResponse><header><expirationTime>${new Date(Date.now() + 3600_000).toISOString()}</expirationTime></header><credentials><token>tok</token><sign>sig</sign></credentials></loginTicketResponse>`

const CAE_OK = '<FeCabResp><Resultado>A</Resultado></FeCabResp><FECAEDetResponse><Resultado>A</Resultado><CAE>74123456789012</CAE><CAEFchVto>20261105</CAEFchVto></FECAEDetResponse>'

const caeaXml = (periodo: string, orden: string) => {
  const desde = orden === '1' ? `${periodo}01` : `${periodo}16`
  const hasta = orden === '1' ? `${periodo}15` : `${periodo}31`
  return `<ResultGet><CAEA>9${periodo}${orden}0000</CAEA><Periodo>${periodo}</Periodo><Orden>${orden}</Orden><FchVigDesde>${desde}</FchVigDesde><FchVigHasta>${hasta}</FchVigHasta><FchTopeInf>${hasta}</FchTopeInf></ResultGet>`
}

type Responder = (args: SoapPostArgs) => string

/** Responde por operación; `caido` simula ARCA sin responder para esas operaciones. */
class FakeSoapClient implements SoapClient {
  public calls: SoapPostArgs[] = []
  public caido = new Set<string>()
  constructor(private readonly responders: Record<string, Responder> = {}) {}
  async post(args: SoapPostArgs): Promise<string> {
    this.calls.push(args)
    if (this.caido.has(args.action)) throw new NetworkError(`timeout ${args.action}`)
    const r = this.responders[args.action]
    if (r) return r(args)
    if (args.action === 'FECompUltimoAutorizado') return '<CbteNro>41</CbteNro>'
    if (args.action === 'FECAESolicitar') return CAE_OK
    if (args.action === 'FECAEASolicitar' || args.action === 'FECAEAConsultar') {
      return caeaXml(/<Periodo>(\d+)/.exec(args.envelope)![1]!, /<Orden>(\d)/.exec(args.envelope)![1]!)
    }
    if (args.action === 'FECAEARegInformativo') return '<FeCabResp><Resultado>A</Resultado></FeCabResp>'
    if (args.action === 'FECAEASinMovimientoInformar') return '<Resultado>A</Resultado>'
    throw new Error(`acción no esperada: ${args.action}`)
  }
  acciones(): string[] {
    return this.calls.map((c) => c.action)
  }
}

const emisor = new StaticEmisorProvider({
  cuit: 20219478012,
  razonSocial: 'Test S.A.',
  domicilio: 'x',
  condicionIva: 'Responsable Inscripto',
  inicioActividades: '01/01/2020',
  ingresosBrutos: 'x',
  ptoVtaDefault: 1,
})

async function setup(responders?: Record<string, Responder>, opts: { contingencia?: boolean } = {}) {
  const soap = new FakeSoapClient(responders)
  const storage = new MemoryTaStorage()
  await storage.write('homologacion', TA)
  const wsaa = new WsaaClient({
    arcaEnv: 'homologacion',
    arcaService: 'wsfe',
    storage,
    signer: { sign: async () => 'x' },
    soap,
    certPath: 'c',
    keyPath: 'k',
  })
  const wsfe = new WsfeClient(soap, 'homologacion')
  const store = new MemoryCaeaStore()
  const contingencia = new ContingenciaService({ emisor, wsaa, wsfe, store, arcaEnv: 'homologacion', ptoVta: 9, logger: new SilentLogger() })
  const billing = new BillingService({
    emisor,
    wsaa,
    wsfe,
    logger: new SilentLogger(),
    contingencia: opts.contingencia === false ? undefined : contingencia,
  })
  return { soap, store, contingencia, billing }
}

const facturaB = {
  ptoVta: 1,
  cbteTipo: 6,
  fecha: '20261026',
  receptor: { docTipo: 99, docNro: 0, condicionIVA: 5, razonSocial: 'Consumidor Final' },
  items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 21 }],
  condicionVenta: 'Contado',
}

describe('quincenas', () => {
  it('quincenaDe y siguienteQuincena (incluye cambio de año)', () => {
    expect(quincenaDe('20261015')).toEqual({ periodo: 202610, orden: 1 })
    expect(quincenaDe('20261016')).toEqual({ periodo: 202610, orden: 2 })
    expect(siguienteQuincena({ periodo: 202610, orden: 1 })).toEqual({ periodo: 202610, orden: 2, inicio: '20261016' })
    expect(siguienteQuincena({ periodo: 202612, orden: 2 })).toEqual({ periodo: 202701, orden: 1, inicio: '20270101' })
  })
})

describe('ContingenciaService.prepararCaea', () => {
  it('pide la quincena actual; la siguiente recién 5 días antes de su inicio', async () => {
    const { contingencia, store } = await setup()
    expect((await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))).map((c) => c.orden)).toEqual([2])
    expect((await contingencia.prepararCaea(new Date('2026-10-27T15:00:00-03:00'))).map((c) => c.periodo)).toEqual([202610, 202611])
    const state = await store.read('homologacion')
    expect(state.caeas).toHaveLength(2)
    expect(state.numeros['9-6']).toBe(41)
  })

  it('si ARCA rechaza el CAEA de la quincena siguiente, igual guarda el de la actual', async () => {
    const { contingencia, store } = await setup({
      FECAEASolicitar: (a) =>
        a.envelope.includes('<Periodo>202611</Periodo>')
          ? '<ResultGet><Periodo>0</Periodo><Orden>0</Orden></ResultGet><Errors><Err><Code>15006</Code><Msg>Fecha de envío</Msg></Err></Errors>'
          : caeaXml('202610', '2'),
    })
    expect((await contingencia.prepararCaea(new Date('2026-10-27T15:00:00-03:00'))).map((c) => c.periodo)).toEqual([202610])
    const state = await store.read('homologacion')
    expect(state.caeas.map((c) => c.periodo)).toEqual([202610])
    expect(state.numeros['9-6']).toBe(41)
  })

  it('si ARCA dice que ya fue otorgado (15008) lo recupera con FECAEAConsultar', async () => {
    const { contingencia, soap } = await setup({
      FECAEASolicitar: () => '<ResultGet><Periodo>0</Periodo><Orden>0</Orden></ResultGet><Errors><Err><Code>15008</Code><Msg>Existe un CAEA otorgado</Msg></Err></Errors>',
    })
    const [caea] = await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    expect(caea!.caea).toBe('9202610' + '20000')
    expect(soap.acciones()).toContain('FECAEAConsultar')
  })
})

describe('BillingService con contingencia', () => {
  it('ARCA no responde al pedir número → emite con CAEA, numera local y deja pendiente', async () => {
    const { billing, contingencia, soap, store } = await setup()
    await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    soap.caido.add('FECompUltimoAutorizado')

    const r1 = await billing.emitir(facturaB)
    const r2 = await billing.emitir(facturaB)
    expect(r1).toMatchObject({ tipoAutorizacion: 'CAEA', pendienteInformar: true, ptoVta: 9, nroComprobante: 42, cae: '9202610' + '20000', xml: '' })
    expect(r2.nroComprobante).toBe(43)
    expect(r1.fileName).toBe('F_B_00009-00000042.pdf')
    expect(soap.acciones()).not.toContain('FECAESolicitar')
    const state = await store.read('homologacion')
    expect(state.pendientes.map((p) => p.id)).toEqual(['9-6-42', '9-6-43'])
    expect(state.pendientes[0]!.cbteFchHsGen).toMatch(/^\d{14}$/)
  })

  it('sin CAEA para la quincena → CAEA_NO_DISPONIBLE', async () => {
    const { billing, soap } = await setup()
    soap.caido.add('FECompUltimoAutorizado')
    await expect(billing.emitir(facturaB)).rejects.toMatchObject({ code: 'CAEA_NO_DISPONIBLE' })
  })

  it('corte durante FECAESolicitar → CAE_RESULTADO_INCIERTO, sin caer a CAEA', async () => {
    const { billing, contingencia, soap, store } = await setup()
    await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    soap.caido.add('FECAESolicitar')
    await expect(billing.emitir(facturaB)).rejects.toMatchObject({ code: 'CAE_RESULTADO_INCIERTO', details: { nro: 42 } })
    expect((await store.read('homologacion')).pendientes).toHaveLength(0)
  })

  it('rechazo de ARCA no activa la contingencia', async () => {
    const { billing, contingencia } = await setup({ FECAESolicitar: () => '<Resultado>R</Resultado>' })
    await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    await expect(billing.emitir(facturaB)).rejects.toBeInstanceOf(ComprobanteRechazadoError)
  })

  it('no deja emitir con CAE en el punto de venta de contingencia', async () => {
    const { billing, soap } = await setup()
    await expect(billing.emitir({ ...facturaB, ptoVta: 9 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      issues: [{ path: ['ptoVta'], message: 'ptoVta_es_de_contingencia' }],
    })
    expect(soap.calls).toHaveLength(0)
  })

  it('sin contingencia configurada el error de red se propaga', async () => {
    const { billing, soap } = await setup(undefined, { contingencia: false })
    soap.caido.add('FECompUltimoAutorizado')
    await expect(billing.emitir(facturaB)).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('ContingenciaService.informarPendientes', () => {
  it('informa en orden, borra los aceptados y ante un rechazo frena ese pto. vta./tipo', async () => {
    let n = 0
    const { billing, contingencia, soap, store } = await setup({
      FECAEARegInformativo: () => (++n === 2 ? '<Resultado>R</Resultado><Obs><Code>10016</Code><Msg>Numero no correlativo</Msg></Obs>' : '<Resultado>A</Resultado>'),
    })
    await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    soap.caido.add('FECompUltimoAutorizado')
    for (let i = 0; i < 3; i++) await billing.emitir(facturaB)
    soap.caido.clear()

    const informe = await contingencia.informarPendientes(new Date('2026-10-26T18:00:00-03:00'))
    expect(informe.informados).toEqual(['9-6-42'])
    expect(informe.rechazados).toEqual([{ id: '9-6-43', errores: [], observaciones: ['10016: Numero no correlativo'] }])
    expect((await store.read('homologacion')).pendientes.map((p) => p.id)).toEqual(['9-6-43', '9-6-44'])

    const env = soap.calls.find((c) => c.action === 'FECAEARegInformativo')!.envelope
    expect(env).toContain('<FECAEADetRequest>')
    expect(env).toContain('<PtoVta>9</PtoVta>')
    expect(env).toContain('<CbteDesde>42</CbteDesde>')
    expect(env).toContain('<CAEA>9202610' + '20000</CAEA>')
    expect(env).toMatch(/<CbteFchHsGen>\d{14}<\/CbteFchHsGen>/)
    expect(env.indexOf('<Iva>')).toBeLessThan(env.indexOf('<CAEA>'))
  })

  it('si ARCA rechaza porque ya lo tenía informado (corte tras aceptarlo), lo da por informado', async () => {
    const { billing, contingencia, soap, store } = await setup({
      FECAEARegInformativo: () => '<Resultado>R</Resultado><Obs><Code>1504</Code><Msg>Comprobante ya informado</Msg></Obs>',
      FECompConsultar: () => '<ResultGet><CodAutorizacion>9202610' + '20000</CodAutorizacion><EmisionTipo>CAEA</EmisionTipo></ResultGet>',
    })
    await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    soap.caido.add('FECompUltimoAutorizado')
    await billing.emitir(facturaB)
    soap.caido.clear()

    const informe = await contingencia.informarPendientes(new Date('2026-10-26T18:00:00-03:00'))
    expect(informe).toMatchObject({ informados: ['9-6-42'], rechazados: [] })
    expect((await store.read('homologacion')).pendientes).toHaveLength(0)
  })

  it('informa sin movimiento los CAEA vencidos que no se usaron (una sola vez)', async () => {
    const { contingencia, soap } = await setup()
    await contingencia.prepararCaea(new Date('2026-10-26T15:00:00-03:00'))
    expect((await contingencia.informarPendientes(new Date('2026-10-30T12:00:00-03:00'))).sinMovimiento).toEqual([])
    expect((await contingencia.informarPendientes(new Date('2026-11-01T12:00:00-03:00'))).sinMovimiento).toEqual(['9202610' + '20000'])
    expect((await contingencia.informarPendientes(new Date('2026-11-02T12:00:00-03:00'))).sinMovimiento).toEqual([])
    const env = soap.calls.find((c) => c.action === 'FECAEASinMovimientoInformar')!.envelope
    expect(env).toContain('<PtoVta>9</PtoVta>')
  })

  it('sin pendientes ni CAEA vencidos no llama a ARCA', async () => {
    const { contingencia, soap } = await setup()
    await contingencia.informarPendientes()
    expect(soap.calls).toHaveLength(0)
  })
})

describe('FileCaeaStore', () => {
  it('persiste entre instancias y no descarta un archivo corrupto', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arca-caea-'))
    try {
      const s1 = new FileCaeaStore(dir)
      await s1.write('homologacion', { caeas: [], numeros: { '9-6': 5 }, pendientes: [] })
      expect((await new FileCaeaStore(dir).read('homologacion')).numeros['9-6']).toBe(5)
      expect(await new FileCaeaStore(dir).read('produccion')).toEqual({ caeas: [], numeros: {}, pendientes: [] })

      await mkdir(path.join(dir, 'produccion'), { recursive: true })
      await writeFile(path.join(dir, 'produccion', 'caea.json'), '{roto')
      await expect(new FileCaeaStore(dir).read('produccion')).rejects.toMatchObject({ code: 'CAEA_STATE_CORRUPTO' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
