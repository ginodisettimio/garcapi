import { describe, it, expect } from 'vitest'
import { WsaaClient } from '../../src/core/wsaa.js'
import { MemoryTaStorage } from '../../src/core/storage.js'
import type { CmsSigner } from '../../src/core/cms-signer.js'
import type { SoapClient, SoapPostArgs } from '../../src/core/soap-client.js'
import { WsaaError } from '../../src/domain/errors.js'

function taXml(token: string, expiration: Date): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header><source>CN=wsaahomo</source><destination>SERIALNUMBER=CUIT 20223565078</destination><uniqueId>1</uniqueId><generationTime>2024-01-05T10:00:00.000-03:00</generationTime><expirationTime>${expiration.toISOString()}</expirationTime></header><credentials><token>${token}</token><sign>sig-${token}</sign></credentials></loginTicketResponse>`
}

function loginResponse(ta: string): string {
  const escaped = ta.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`
}

class FakeSigner implements CmsSigner {
  async sign(): Promise<string> {
    return 'CMS_B64'
  }
}

class FakeSoapClient implements SoapClient {
  public calls: SoapPostArgs[] = []
  constructor(private readonly response: string) {}
  async post(args: SoapPostArgs): Promise<string> {
    this.calls.push(args)
    await new Promise((r) => setTimeout(r, 5))
    return this.response
  }
}

const inOneHour = () => new Date(Date.now() + 3600_000)

function makeClient(soap: SoapClient, storage = new MemoryTaStorage()) {
  return new WsaaClient({
    arcaEnv: 'homologacion',
    arcaService: 'wsfe',
    storage,
    signer: new FakeSigner(),
    soap,
    certPath: 'cert.crt',
    keyPath: 'private.key',
  })
}

describe('WsaaClient', () => {
  it('buildTra incluye servicio y ventana de tiempo', () => {
    const c = makeClient(new FakeSoapClient(''))
    const tra = c.buildTra('wsfe', new Date('2024-01-05T12:00:00Z'))
    expect(tra).toContain('<service>wsfe</service>')
    expect(tra).toContain('<uniqueId>1704456000</uniqueId>')
    expect(tra).toContain('<generationTime>2024-01-05T11:50:00Z</generationTime>')
    expect(tra).toContain('<expirationTime>2024-01-05T12:10:00Z</expirationTime>')
  })

  it('usa el TA cacheado si está vigente', async () => {
    const storage = new MemoryTaStorage()
    await storage.write('homologacion', taXml('cached', inOneHour()))
    const soap = new FakeSoapClient(loginResponse(taXml('nuevo', inOneHour())))
    const ta = await makeClient(soap, storage).getCachedTA()
    expect(ta.token).toBe('cached')
    expect(ta.valid).toBe(true)
    expect(soap.calls).toHaveLength(0)
  })

  it('renueva y persiste si el TA está vencido', async () => {
    const storage = new MemoryTaStorage()
    await storage.write('homologacion', taXml('viejo', new Date(Date.now() - 1000)))
    const soap = new FakeSoapClient(loginResponse(taXml('nuevo', inOneHour())))
    const ta = await makeClient(soap, storage).getCachedTA()
    expect(ta.token).toBe('nuevo')
    expect(soap.calls).toHaveLength(1)
    expect(soap.calls[0]!.envelope).toContain('<wsaa:in0>CMS_B64</wsaa:in0>')
    expect(await storage.read('homologacion')).toContain('<token>nuevo</token>')
  })

  it('dos getCachedTA concurrentes hacen un solo login', async () => {
    const soap = new FakeSoapClient(loginResponse(taXml('nuevo', inOneHour())))
    const c = makeClient(soap)
    const [a, b] = await Promise.all([c.getCachedTA(), c.getCachedTA()])
    expect(a.token).toBe('nuevo')
    expect(b.token).toBe('nuevo')
    expect(soap.calls).toHaveLength(1)
  })

  it('SOAP fault → WsaaError', async () => {
    const fault = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>`
    const c = makeClient(new FakeSoapClient(fault))
    await expect(c.getCachedTA()).rejects.toBeInstanceOf(WsaaError)
    await expect(c.getCachedTA()).rejects.toMatchObject({ code: 'WSAA_FAULT' })
  })

  it('authenticate devuelve ArcaAuth con cuit string', async () => {
    const c = makeClient(new FakeSoapClient(loginResponse(taXml('t', inOneHour()))))
    const { auth } = await c.authenticate(20223565078)
    expect(auth).toEqual({ token: 't', sign: 'sig-t', cuit: '20223565078' })
  })
})
