import { describe, it, expect } from 'vitest'
import { AxiosSoapClient } from '../../src/core/soap-client.js'
import { WsfeClient } from '../../src/core/wsfe.js'

/**
 * Conectividad TLS con ARCA en ambos entornos vía FEDummy (no requiere certs).
 * WSFE producción (servicios1.afip.gov.ar) falla con OpenSSL 3 si se negocia DHE.
 */
describe('TLS con ARCA (FEDummy)', () => {
  for (const env of ['homologacion', 'produccion'] as const) {
    it(`WSFE ${env} responde OK`, async () => {
      const r = await new WsfeClient(new AxiosSoapClient(), env).feDummy()
      expect(r).toEqual({ appServer: 'OK', dbServer: 'OK', authServer: 'OK' })
    }, 60_000)
  }
})
