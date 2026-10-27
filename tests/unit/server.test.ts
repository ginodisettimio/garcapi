import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { createArca } from '../../src/index.js'
import { MemoryTaStorage } from '../../src/core/storage.js'
import { createArcaServer } from '../../src/http/server.js'
import { SilentLogger } from '../../src/domain/logger.js'

function makeApp(corsOrigins: string[], jwtSecret: string | null = null) {
  const arca = createArca({
    cuit: 20219478012,
    razonSocial: 'x',
    domicilio: 'x',
    condicionIva: 'x',
    inicioActividades: 'x',
    ingresosBrutos: 'x',
    ptoVtaDefault: 1,
    pdf: { enabled: false },
    taStorage: new MemoryTaStorage(),
    logger: new SilentLogger(),
  })
  return createArcaServer({
    config: { ...arca.config, http: { ...arca.config.http, corsOrigins } },
    wsaa: arca.wsaa,
    billing: arca.billing,
    comprobantes: arca.comprobantes,
    cuit: arca.cuit,
    jwtSecret,
  })
}

describe('createArcaServer: CORS y auth', () => {
  it('con origen limitado responde solo a ese origen y agrega Vary: Origin', async () => {
    const app = makeApp(['https://pos.example.com'])
    const ok = await request(app).options('/afip/facturas').set('Origin', 'https://pos.example.com')
    expect(ok.status).toBe(204)
    expect(ok.headers['access-control-allow-origin']).toBe('https://pos.example.com')
    expect(ok.headers['vary']).toBe('Origin')
    expect(ok.headers['access-control-expose-headers']).toContain('X-Arca-Cae')

    const otro = await request(app).options('/afip/facturas').set('Origin', 'https://evil.example')
    expect(otro.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('con "*" no agrega Vary', async () => {
    const res = await request(makeApp(['*'])).options('/afip/facturas').set('Origin', 'https://x.example')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['vary']).toBeUndefined()
  })

  it('con ARCA_JWT_SECRET las rutas sin token devuelven 401', async () => {
    const res = await request(makeApp(['*'], 'secreto')).post('/afip/facturas').send({})
    expect(res.status).toBe(401)
  })
})
