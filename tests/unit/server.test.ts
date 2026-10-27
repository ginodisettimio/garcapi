import jwt from 'jsonwebtoken'
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { createArca } from '../../src/index.js'
import { MemoryTaStorage } from '../../src/core/storage.js'
import { createArcaServer } from '../../src/http/server.js'
import { createErrorHandlerMiddleware } from '../../src/http/middlewares/error-handler.js'
import { ArcaError, CmsSignError } from '../../src/domain/errors.js'
import express from 'express'
import { SilentLogger } from '../../src/domain/logger.js'

function makeApp(corsOrigins: string[], jwtSecret: string | null = null, jwtMaxAge: string | null = null) {
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
    jwtMaxAge,
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

  it('con ARCA_JWT_SECRET las rutas sin token devuelven 401 (incluido fa-auth/status)', async () => {
    const app = makeApp(['*'], 'secreto')
    expect((await request(app).post('/afip/facturas').send({})).status).toBe(401)
    expect((await request(app).get('/afip/fa-auth/status')).status).toBe(401)
    expect((await request(app).get('/health')).status).toBe(200)
  })

  it('JWT: solo HS256 con el secreto, sin alg none, y con antigüedad máxima', async () => {
    const app = makeApp(['*'], 'secreto', '1h')
    const status = async (token: string) =>
      (await request(app).get('/afip/comprobantes/ultimo').set('Authorization', `Bearer ${token}`)).status
    const ahora = Math.floor(Date.now() / 1000)

    expect(await status(jwt.sign({ sub: 'pos' }, 'secreto', { algorithm: 'HS512' }))).toBe(401)
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(`{"sub":"pos","iat":${ahora}}`).toString('base64url')}.`
    expect(await status(none)).toBe(401)
    expect(await status(jwt.sign({ sub: 'pos', iat: ahora - 7200 }, 'secreto'))).toBe(401)
    expect(await status(jwt.sign({ sub: 'pos' }, 'secreto', { expiresIn: -10 }))).toBe(401)
    // token válido: pasa la auth y llega a la validación de la ruta (sin query → 400)
    expect(await status(jwt.sign({ sub: 'pos' }, 'secreto', { algorithm: 'HS256', expiresIn: '5m' }))).toBe(400)
  })

  it('no expone X-Powered-By y manda nosniff', async () => {
    const res = await request(makeApp(['*'])).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('400 de validación del body trae code VALIDATION_ERROR', async () => {
    const res = await request(makeApp(['*'])).post('/afip/facturas').send({ ptoVta: 'x' })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
  })
})

describe('error handler', () => {
  const logs: unknown[] = []
  const logger = { debug() {}, info() {}, warn() {}, error: (o: unknown) => void logs.push(o) }
  const appQueLanza = (err: unknown) => {
    const a = express()
    a.get('/x', () => {
      throw err
    })
    a.use(createErrorHandlerMiddleware({ logger }))
    return a
  }

  it('5xx: loguea los detalles y no los expone al cliente', async () => {
    logs.length = 0
    const res = await request(appQueLanza(new CmsSignError('No se pudo firmar', { keyPath: '/secreto/private.key' }))).get('/x')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ ok: false, error: 'No se pudo firmar', code: 'CMS_SIGN_ERROR' })
    expect(JSON.stringify(logs)).toContain('/secreto/private.key')
  })

  it('CAE_RESULTADO_INCIERTO mantiene los details (el cliente los necesita para consultar)', async () => {
    const err = new ArcaError('incierto', 'CAE_RESULTADO_INCIERTO', { ptoVta: 1, cbteTipo: 6, nro: 42 })
    const res = await request(appQueLanza(err)).get('/x')
    expect(res.status).toBe(504)
    expect(res.body.details).toEqual({ ptoVta: 1, cbteTipo: 6, nro: 42 })
  })

  it('error desconocido: mensaje genérico, sin el mensaje interno', async () => {
    const res = await request(appQueLanza(new Error('ENOENT /app/algo/interno'))).get('/x')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ ok: false, error: 'Error interno', code: 'INTERNAL_ERROR' })
  })
})
