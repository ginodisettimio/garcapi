import { describe, it, expect } from 'vitest'
import { WsfeClient } from '../../src/core/wsfe.js'
import type { SoapClient, SoapPostArgs } from '../../src/core/soap-client.js'
import type { ArcaAuth } from '../../src/domain/types.js'

class MockSoapClient implements SoapClient {
  public lastCall: { url: string; action: string; envelope: string } | null = null
  constructor(private readonly response: string) {}
  async post(args: SoapPostArgs): Promise<string> {
    this.lastCall = { url: args.url, action: args.action, envelope: args.envelope }
    return this.response
  }
}

class EnvelopeCapturer implements SoapClient {
  public action: string = ''
  public envelope: string = ''
  constructor(private readonly response: string) {}
  async post(args: SoapPostArgs): Promise<string> {
    this.action = args.action
    this.envelope = args.envelope
    return this.response
  }
}

const auth: ArcaAuth = { token: 'tok', sign: 'sig', cuit: '20223565078' }

describe('WsfeClient', () => {
  it('buildAuthEnvelope contiene Auth, Token, Sign, Cuit', () => {
    const c = new WsfeClient(new MockSoapClient('<ok/>'), 'homologacion')
    const env = c.buildAuthEnvelope('FECompConsultar', auth, '<X/>')
    expect(env).toContain('<Token>tok</Token>')
    expect(env).toContain('<Sign>sig</Sign>')
    expect(env).toContain('<Cuit>20223565078</Cuit>')
    expect(env).toContain('FECompConsultar')
    expect(env).toContain('http://ar.gov.afip.dif.FEV1/')
  })

  it('feCompUltimoAutorizado parsea CbteNro', async () => {
    const xml = `<soap:Body><FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><CbteNro>1234</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></soap:Body>`
    const soap = new MockSoapClient(xml)
    const c = new WsfeClient(soap, 'homologacion')
    const n = await c.feCompUltimoAutorizado(auth, 1, 6)
    expect(n).toBe(1234)
  })

  it('feCompUltimoAutorizado sin CbteNro devuelve 0', async () => {
    const soap = new MockSoapClient('<vacio/>')
    const c = new WsfeClient(soap, 'homologacion')
    const n = await c.feCompUltimoAutorizado(auth, 1, 6)
    expect(n).toBe(0)
  })

  it('getNextNumber = ultimo + 1', async () => {
    const xml = `<CbteNro>99</CbteNro>`
    const soap = new MockSoapClient(xml)
    const c = new WsfeClient(soap, 'homologacion')
    const n = await c.getNextNumber(auth, 1, 6)
    expect(n).toBe(100)
  })

  it('fecaeSolicitar arma el envelope correcto', async () => {
    const capturer = new EnvelopeCapturer('<FECAESolicitarResponse/>')
    const c = new WsfeClient(capturer, 'homologacion')
    await c.fecaeSolicitar(auth, {
      ptoVta: 1,
      cbteTipo: 6,
      concepto: 1,
      docTipo: 99,
      docNro: 0,
      condIvaReceptor: 5,
      cbteDesde: 1,
      cbteHasta: 1,
      fecha: '20240105',
      moneda: 'PES',
      cotizacion: 1,
      items: [{ descripcion: 'Test', cantidad: 1, precioUnitario: 100, iva: 21 }],
    })
    expect(capturer.action).toBe('FECAESolicitar')
    expect(capturer.envelope).toContain('<CbteTipo>6</CbteTipo>')
    expect(capturer.envelope).toContain('<PtoVta>1</PtoVta>')
    expect(capturer.envelope).toContain('<DocTipo>99</DocTipo>')
    expect(capturer.envelope).toContain('<CondicionIVAReceptorId>5</CondicionIVAReceptorId>')
  })

  it('FecaeSolicitar con tipo C no incluye Iva', async () => {
    const capturer = new EnvelopeCapturer('<x/>')
    const c = new WsfeClient(capturer, 'homologacion')
    await c.fecaeSolicitar(auth, {
      ptoVta: 1,
      cbteTipo: 11, // Factura C
      concepto: 1,
      docTipo: 96,
      docNro: 12345678,
      condIvaReceptor: 5,
      cbteDesde: 1,
      cbteHasta: 1,
      fecha: '20240105',
      moneda: 'PES',
      cotizacion: 1,
      items: [{ descripcion: 'Test', cantidad: 1, precioUnitario: 1000, iva: 0 }],
    })
    expect(capturer.envelope).not.toContain('<Iva>')
  })

  it('FecaeSolicitar con tipo A incluye Iva discriminado', async () => {
    const capturer = new EnvelopeCapturer('<x/>')
    const c = new WsfeClient(capturer, 'homologacion')
    await c.fecaeSolicitar(auth, {
      ptoVta: 1,
      cbteTipo: 1, // Factura A
      concepto: 1,
      docTipo: 80,
      docNro: 20223565078,
      condIvaReceptor: 1,
      cbteDesde: 1,
      cbteHasta: 1,
      fecha: '20240105',
      moneda: 'PES',
      cotizacion: 1,
      items: [{ descripcion: 'Test', cantidad: 2, precioUnitario: 100, iva: 21 }],
    })
    expect(capturer.envelope).toContain('<Iva>')
    expect(capturer.envelope).toContain('<AlicIva>')
    expect(capturer.envelope).toContain('<Id>5</Id>') // 21% → id 5
    expect(capturer.envelope).toContain('<BaseImp>200.00</BaseImp>')
    expect(capturer.envelope).toContain('<Importe>42.00</Importe>')
  })

  it('FecaeSolicitar con concepto 2 incluye FchServDesde/Hasta/VtoPago', async () => {
    const capturer = new EnvelopeCapturer('<x/>')
    const c = new WsfeClient(capturer, 'homologacion')
    await c.fecaeSolicitar(auth, {
      ptoVta: 1,
      cbteTipo: 1,
      concepto: 2,
      docTipo: 80,
      docNro: 20223565078,
      condIvaReceptor: 1,
      cbteDesde: 1,
      cbteHasta: 1,
      fecha: '20240105',
      moneda: 'PES',
      cotizacion: 1,
      items: [{ descripcion: 'Test', cantidad: 1, precioUnitario: 100, iva: 21 }],
      fchServDesde: '20240101',
      fchServHasta: '20240131',
      fchVtoPago: '20240215',
    })
    expect(capturer.envelope).toContain('<FchServDesde>20240101</FchServDesde>')
    expect(capturer.envelope).toContain('<FchServHasta>20240131</FchServHasta>')
    expect(capturer.envelope).toContain('<FchVtoPago>20240215</FchVtoPago>')
  })

  it('FecaeSolicitar con cbtesAsoc los serializa', async () => {
    const capturer = new EnvelopeCapturer('<x/>')
    const c = new WsfeClient(capturer, 'homologacion')
    await c.fecaeSolicitar(auth, {
      ptoVta: 1,
      cbteTipo: 3, // NC A
      concepto: 1,
      docTipo: 80,
      docNro: 20223565078,
      condIvaReceptor: 1,
      cbteDesde: 1,
      cbteHasta: 1,
      fecha: '20240105',
      moneda: 'PES',
      cotizacion: 1,
      items: [{ descripcion: 'Test', cantidad: 1, precioUnitario: 100, iva: 21 }],
      cbtesAsoc: [{ tipo: 1, ptoVta: 1, nro: 100, cuit: 20223565078 }],
    })
    expect(capturer.envelope).toContain('<CbtesAsoc>')
    expect(capturer.envelope).toContain('<Tipo>1</Tipo>')
    expect(capturer.envelope).toContain('<PtoVta>1</PtoVta>')
    expect(capturer.envelope).toContain('<Nro>100</Nro>')
    expect(capturer.envelope).toContain('<Cuit>20223565078</Cuit>')
  })
})
