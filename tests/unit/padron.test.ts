import { describe, it, expect } from 'vitest'
import { PadronA13Client } from '../../src/core/padron-a13.js'
import { WsaaClient } from '../../src/core/wsaa.js'
import { MemoryTaStorage } from '../../src/core/storage.js'
import type { SoapClient, SoapPostArgs } from '../../src/core/soap-client.js'
import { PadronA13CuitService, parsePersonaA13 } from '../../src/services/cuit-service.js'
import { StaticEmisorProvider } from '../../src/domain/types.js'
import { PadronError } from '../../src/domain/errors.js'

const PERSONA_FISICA = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:getPersonaResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/"><personaReturn><metadata><fechaHora>2026-10-26T22:00:00-03:00</fechaHora><servidor>linux</servidor></metadata><persona><apellido>PEREZ</apellido><domicilio><codPostal>1000</codPostal><descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia><direccion>CALLE REAL 1</direccion><localidad>CABA</localidad><tipoDomicilio>LEGAL/REAL</tipoDomicilio></domicilio><domicilio><codPostal>1405</codPostal><descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia><direccion>AV RIVADAVIA 5000</direccion><localidad>CABALLITO</localidad><tipoDomicilio>FISCAL</tipoDomicilio></domicilio><estadoClave>ACTIVO</estadoClave><idPersona>20111111112</idPersona><nombre>JUAN</nombre><tipoClave>CUIT</tipoClave><tipoPersona>FISICA</tipoPersona></persona></personaReturn></ns2:getPersonaResponse></soap:Body></soap:Envelope>`

const PERSONA_JURIDICA = `<personaReturn><persona><domicilio><descripcionProvincia>CORDOBA</descripcionProvincia><direccion>SAN MARTIN 10</direccion><localidad>CORDOBA</localidad><tipoDomicilio>FISCAL</tipoDomicilio></domicilio><estadoClave>INACTIVO</estadoClave><idPersona>30712345671</idPersona><razonSocial>ACME S.A.</razonSocial><tipoPersona>JURIDICA</tipoPersona></persona></personaReturn>`

const FAULT_NO_EXISTE = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>No existe persona con ese Id</faultstring></soap:Fault></soap:Body></soap:Envelope>`

const TA = `<loginTicketResponse><header><expirationTime>${new Date(Date.now() + 3600_000).toISOString()}</expirationTime></header><credentials><token>tok</token><sign>sig</sign></credentials></loginTicketResponse>`

class FakeSoapClient implements SoapClient {
  public calls: SoapPostArgs[] = []
  constructor(private readonly response: string) {}
  async post(args: SoapPostArgs): Promise<string> {
    this.calls.push(args)
    return this.response
  }
}

describe('PadronA13Client', () => {
  it('arma el envelope de getPersona contra el endpoint del entorno', async () => {
    const soap = new FakeSoapClient(PERSONA_FISICA)
    await new PadronA13Client(soap, 'homologacion').getPersona({ token: 'tok', sign: 'sig', cuit: '20219478012' }, 20111111112)
    const call = soap.calls[0]!
    expect(call.url).toBe('https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13')
    expect(call.envelope).toContain('xmlns:a13="http://a13.soap.ws.server.puc.sr/"')
    expect(call.envelope).toContain('<token>tok</token>')
    expect(call.envelope).toContain('<sign>sig</sign>')
    expect(call.envelope).toContain('<cuitRepresentada>20219478012</cuitRepresentada>')
    expect(call.envelope).toContain('<idPersona>20111111112</idPersona>')
  })

  it('fault "No existe persona" → PadronError CUIT_NO_ENCONTRADO', async () => {
    const c = new PadronA13Client(new FakeSoapClient(FAULT_NO_EXISTE), 'homologacion')
    const err = await c.getPersona({ token: 't', sign: 's', cuit: '1' }, 20000000001).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PadronError)
    expect((err as PadronError).code).toBe('CUIT_NO_ENCONTRADO')
  })
})

describe('parsePersonaA13', () => {
  it('persona física: apellido + nombre y domicilio fiscal', () => {
    expect(parsePersonaA13(PERSONA_FISICA, '20111111112')).toEqual({
      cuit: '20111111112',
      razonSocial: 'PEREZ JUAN',
      tipoPersona: 'FISICA',
      estado: 'ACTIVO',
      domicilio: 'AV RIVADAVIA 5000, CABALLITO, CIUDAD AUTONOMA BUENOS AIRES (CP 1405)',
    })
  })

  it('persona jurídica: razón social, estado inactivo, sin CP', () => {
    expect(parsePersonaA13(PERSONA_JURIDICA, '30712345671')).toEqual({
      cuit: '30712345671',
      razonSocial: 'ACME S.A.',
      tipoPersona: 'JURIDICA',
      estado: 'INACTIVO',
      domicilio: 'SAN MARTIN 10, CORDOBA, CORDOBA',
    })
  })

  it('respuesta sin persona → CUIT_NO_ENCONTRADO', () => {
    expect(() => parsePersonaA13('<personaReturn/>', '1')).toThrow(PadronError)
  })
})

describe('PadronA13CuitService', () => {
  it('autentica con el CUIT del emisor y un TA propio de ws_sr_padron_a13', async () => {
    const storage = new MemoryTaStorage()
    await storage.write('homologacion', TA)
    const soap = new FakeSoapClient(PERSONA_FISICA)
    const wsaa = new WsaaClient({
      arcaEnv: 'homologacion',
      arcaService: 'ws_sr_padron_a13',
      storage,
      signer: { sign: async () => 'x' },
      soap,
      certPath: 'c',
      keyPath: 'k',
    })
    const service = new PadronA13CuitService({
      emisor: new StaticEmisorProvider({
        cuit: 20219478012,
        razonSocial: 'x',
        domicilio: 'x',
        condicionIva: 'x',
        inicioActividades: 'x',
        ingresosBrutos: 'x',
        ptoVtaDefault: 1,
      }),
      wsaa,
      padron: new PadronA13Client(soap, 'homologacion'),
    })
    const info = await service.lookup('20111111112')
    expect(info.razonSocial).toBe('PEREZ JUAN')
    expect(soap.calls).toHaveLength(1)
    expect(soap.calls[0]!.envelope).toContain('<cuitRepresentada>20219478012</cuitRepresentada>')
  })

  it('sin TA, el TRA que firma pide el servicio ws_sr_padron_a13', async () => {
    let traFirmado = ''
    const wsaa = new WsaaClient({
      arcaEnv: 'homologacion',
      arcaService: 'ws_sr_padron_a13',
      storage: new MemoryTaStorage(),
      signer: {
        sign: async (tra: string) => {
          traFirmado = tra
          return 'x'
        },
      },
      soap: new FakeSoapClient(FAULT_NO_EXISTE),
      certPath: 'c',
      keyPath: 'k',
    })
    await wsaa.getCachedTA().catch(() => undefined)
    expect(traFirmado).toContain('<service>ws_sr_padron_a13</service>')
  })
})
