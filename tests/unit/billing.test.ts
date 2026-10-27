import express from 'express'
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { BillingService } from '../../src/services/billing-service.js'
import { createBillingRoutes } from '../../src/http/routes/billing.js'
import { WsaaClient } from '../../src/core/wsaa.js'
import { WsfeClient } from '../../src/core/wsfe.js'
import { MemoryTaStorage } from '../../src/core/storage.js'
import type { SoapClient, SoapPostArgs } from '../../src/core/soap-client.js'
import type { PdfGenerator } from '../../src/pdf/pdf-service.js'
import { StaticEmisorProvider } from '../../src/domain/types.js'
import { SilentLogger } from '../../src/domain/logger.js'
import { ComprobanteRechazadoError, ValidationError } from '../../src/domain/errors.js'

const TA = `<loginTicketResponse><header><expirationTime>${new Date(Date.now() + 3600_000).toISOString()}</expirationTime></header><credentials><token>tok</token><sign>sig</sign></credentials></loginTicketResponse>`

const CAE_OK = `<FECAESolicitarResult><FeCabResp><Cuit>20223565078</Cuit><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>74123456789012</CAE><CAEFchVto>20240115</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult>`

const CAE_RECHAZADO = `<FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar</Msg></Obs></Observaciones><CAE></CAE></FECAEDetResponse></FeDetResp></FECAESolicitarResult>`

/** Responde según la operación: último autorizado = 41, FECAESolicitar = `caeResponse`. */
class FakeSoapClient implements SoapClient {
  public calls: SoapPostArgs[] = []
  constructor(private readonly caeResponse: string) {}
  async post(args: SoapPostArgs): Promise<string> {
    this.calls.push(args)
    if (args.action === 'FECompUltimoAutorizado') return '<CbteNro>41</CbteNro>'
    return this.caeResponse
  }
}

async function makeService(caeResponse: string, pdf?: PdfGenerator, montoMaxConsumidorFinal?: number) {
  const soap = new FakeSoapClient(caeResponse)
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
  const billing = new BillingService({
    emisor: new StaticEmisorProvider({
      cuit: 20223565078,
      razonSocial: 'Test S.A.',
      domicilio: 'Av. Test 123',
      condicionIva: 'Responsable Inscripto',
      inicioActividades: '01/01/2020',
      ingresosBrutos: '123456789',
      ptoVtaDefault: 1,
    }),
    wsaa,
    wsfe: new WsfeClient(soap, 'homologacion'),
    logger: new SilentLogger(),
    pdf,
    montoMaxConsumidorFinal,
  })
  return { billing, soap }
}

const facturaB = {
  ptoVta: 1,
  cbteTipo: 6,
  concepto: 1,
  fecha: '20240105',
  receptor: { docTipo: 99, docNro: 0, condicionIVA: 5, razonSocial: 'Consumidor Final' },
  items: [{ descripcion: 'Producto 1', cantidad: 1, precioUnitario: 826.45, iva: 21 }],
  condicionVenta: 'Contado',
}

describe('BillingService.emitir', () => {
  it('emite y devuelve CAE, número y total', async () => {
    const { billing, soap } = await makeService(CAE_OK)
    const r = await billing.emitir(facturaB)
    expect(r.cae).toBe('74123456789012')
    expect(r.vtoCae).toBe('20240115')
    expect(r.nroComprobante).toBe(42)
    expect(r.importeTotal).toBe(1000)
    expect(r.fileName).toBe('F_B_00001-00000042.pdf')
    expect(r.pdfBuffer).toBeUndefined()
    const env = soap.calls.find((c) => c.action === 'FECAESolicitar')!.envelope
    expect(env).toContain('<CbteDesde>42</CbteDesde>')
    expect(env).toContain('<ImpTotal>1000.00</ImpTotal>')
    expect(env).toContain('<Token>tok</Token>')
  })

  it('rechazo → ComprobanteRechazadoError con observaciones', async () => {
    const { billing } = await makeService(CAE_RECHAZADO)
    const err = await billing.emitir(facturaB).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ComprobanteRechazadoError)
    expect((err as ComprobanteRechazadoError).observaciones?.[0]).toContain('10016')
  })

  it('input inválido → ValidationError sin llamar a ARCA', async () => {
    const { billing, soap } = await makeService(CAE_OK)
    await expect(billing.emitir({ ...facturaB, items: [] })).rejects.toBeInstanceOf(ValidationError)
    expect(soap.calls).toHaveLength(0)
  })

  it('si falla el PDF igual devuelve el CAE', async () => {
    const pdf: PdfGenerator = {
      generateFacturaPdf: async () => {
        throw new Error('boom')
      },
      generatePresupuestoPdf: async () => Buffer.from(''),
    }
    const { billing } = await makeService(CAE_OK, pdf)
    const r = await billing.emitir(facturaB)
    expect(r.cae).toBe('74123456789012')
    expect(r.pdfBuffer).toBeUndefined()
  })

  it('emisiones concurrentes no se pisan (se serializan)', async () => {
    const { billing, soap } = await makeService(CAE_OK)
    await Promise.all([billing.emitir(facturaB), billing.emitir(facturaB)])
    expect(soap.calls.map((c) => c.action)).toEqual([
      'FECompUltimoAutorizado',
      'FECAESolicitar',
      'FECompUltimoAutorizado',
      'FECAESolicitar',
    ])
  })

  describe('Consumidor Final por monto (RG 5700/2025)', () => {
    const conTotal = (neto: number, extra: object = {}) => ({
      ...facturaB,
      items: [{ descripcion: 'x', cantidad: 1, precioUnitario: neto, iva: 21 }],
      ...extra,
    })

    it('rechaza CF sin identificar desde $10.000.000 sin llamar a ARCA', async () => {
      const { billing, soap } = await makeService(CAE_OK)
      const err = await billing.emitir(conTotal(10_000_000 / 1.21)).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).issues?.[0]?.message).toBe('receptor_debe_identificarse_por_monto')
      expect(soap.calls).toHaveLength(0)
    })

    it('acepta CF por debajo del límite', async () => {
      const { billing } = await makeService(CAE_OK)
      await expect(billing.emitir(conTotal(8_264_462.80))).resolves.toMatchObject({ importeTotal: 9_999_999.99 })
    })

    it('acepta el mismo monto con DNI', async () => {
      const { billing } = await makeService(CAE_OK)
      const r = await billing.emitir(
        conTotal(10_000_000, { receptor: { docTipo: 96, docNro: 12345678, condicionIVA: 5, razonSocial: 'Juan Perez' } }),
      )
      expect(r.cae).toBe('74123456789012')
    })

    it('convierte a pesos con la cotización', async () => {
      const { billing } = await makeService(CAE_OK)
      await expect(billing.emitir(conTotal(10_000, { moneda: 'DOL', cotizacion: 1000 }))).rejects.toBeInstanceOf(ValidationError)
    })

    it('límite configurable; 0 lo desactiva', async () => {
      const bajo = await makeService(CAE_OK, undefined, 1000)
      await expect(bajo.billing.emitir(facturaB)).rejects.toBeInstanceOf(ValidationError)
      const off = await makeService(CAE_OK, undefined, 0)
      await expect(off.billing.emitir(conTotal(50_000_000))).resolves.toMatchObject({ cae: '74123456789012' })
    })
  })
})

describe('POST /afip/facturas (HTTP)', () => {
  const pdf: PdfGenerator = {
    generateFacturaPdf: async () => Buffer.from('%PDF-1.4 fake'),
    generatePresupuestoPdf: async () => Buffer.from(''),
  }
  const app = async (sendPdfAsBinary?: boolean) => {
    const { billing } = await makeService(CAE_OK, pdf)
    const a = express()
    a.use(express.json())
    a.use(createBillingRoutes({ billing, auth: (_q, _r, next) => next(), sendPdfAsBinary }))
    return a
  }

  it('con PDF binario manda los datos del comprobante en headers X-Arca-*', async () => {
    const res = await request(await app()).post('/facturas').send(facturaB)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toBe('attachment; filename=F_B_00001-00000042.pdf')
    expect(res.headers['x-arca-cae']).toBe('74123456789012')
    expect(res.headers['x-arca-cae-vto']).toBe('20240115')
    expect(res.headers['x-arca-nro-comprobante']).toBe('42')
    expect(res.headers['x-arca-pto-vta']).toBe('1')
    expect(res.headers['x-arca-tipo-autorizacion']).toBe('CAE')
    expect(res.headers['x-arca-pendiente-informar']).toBe('false')
  })

  it('en JSON incluye tipoAutorizacion, pendienteInformar y el PDF en base64', async () => {
    const res = await request(await app(false)).post('/facturas').send(facturaB)
    expect(res.body).toMatchObject({
      ok: true,
      cae: '74123456789012',
      nroComprobante: 42,
      tipoAutorizacion: 'CAE',
      pendienteInformar: false,
      pdfBase64: Buffer.from('%PDF-1.4 fake').toString('base64'),
    })
  })
})
