import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { createArca, createArcaServer } from '../../src/index.js'

/**
 * E2E por HTTP contra ARCA homologación, como lo usaría un POS.
 *
 * - Con ARCA_CUIT: levanta el server en este proceso (PDF en formato ticket, CORS limitado).
 * - Con ARCA_E2E_URL + ARCA_E2E_JWT_SECRET: prueba un deploy ya levantado (ej. Docker).
 *
 * Emite comprobantes reales en homologación (sin validez fiscal).
 */
const cuit = process.env.ARCA_CUIT
const externo = process.env.ARCA_E2E_URL
const ptoVta = Number(process.env.ARCA_PTO_VTA ?? 1)
const ORIGEN_POS = 'https://pos.example.com'

const consumidorFinal = { docTipo: 99, docNro: 0, condicionIVA: 5, razonSocial: 'Consumidor Final' }

describe.skipIf(!cuit && !externo)('E2E HTTP', () => {
  let base = ''
  let secret = ''
  let cerrar: () => Promise<void> = async () => {}

  beforeAll(async () => {
    if (externo) {
      base = externo.replace(/\/$/, '')
      secret = process.env.ARCA_E2E_JWT_SECRET ?? ''
      return
    }
    secret = randomBytes(32).toString('hex')
    const arca = createArca({
      cuit: Number(cuit),
      razonSocial: 'Test S.A.',
      domicilio: 'Av. Test 123',
      condicionIva: 'Responsable Inscripto',
      inicioActividades: '01/01/2020',
      ingresosBrutos: '123456789',
      ptoVtaDefault: ptoVta,
      arcaEnv: 'homologacion',
      pdf: { formato: 'ticket' },
      contingencia: false,
    })
    const app = createArcaServer({
      config: { ...arca.config, http: { ...arca.config.http, corsOrigins: [ORIGEN_POS] } },
      wsaa: arca.wsaa,
      billing: arca.billing,
      comprobantes: arca.comprobantes,
      cuit: arca.cuit,
      jwtSecret: secret,
    })
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    cerrar = async () => {
      server.close()
      await arca.close()
    }
  }, 60_000)

  afterAll(() => cerrar())

  const token = () => jwt.sign({ sub: 'e2e' }, secret, { algorithm: 'HS256', expiresIn: '5m' })
  const api = (path: string, init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...init.headers },
    })
  const emitir = (body: object) => api('/afip/facturas', { method: 'POST', body: JSON.stringify(body) })

  it('GET /health es público', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, env: 'homologacion' })
  })

  it('todas las rutas /afip exigen JWT', async () => {
    const sinToken = [
      fetch(`${base}/afip/facturas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      fetch(`${base}/afip/comprobantes/ultimo?ptoVta=1&tipo=6`),
      fetch(`${base}/afip/comprobantes/1/6/1`),
      fetch(`${base}/afip/cuit/20111111112`),
      fetch(`${base}/afip/fa-auth/status`),
    ]
    for (const res of await Promise.all(sinToken)) expect(res.status).toBe(401)

    const firmadoConOtroSecreto = jwt.sign({ sub: 'x' }, 'otro-secreto', { expiresIn: '5m' })
    const res = await fetch(`${base}/afip/fa-auth/status`, { headers: { Authorization: `Bearer ${firmadoConOtroSecreto}` } })
    expect(res.status).toBe(401)
  })

  it('emite una Factura B: PDF + datos del comprobante en headers, y se puede consultar', async () => {
    const antes = await (await api(`/afip/comprobantes/ultimo?ptoVta=${ptoVta}&tipo=6`)).json()

    const res = await emitir({
      ptoVta,
      cbteTipo: 6,
      receptor: consumidorFinal,
      items: [
        { descripcion: 'Gaseosa cola 2,25 L', cantidad: 2, precioUnitario: 1500, iva: 21 },
        { descripcion: 'Pan francés', cantidad: 0.75, precioUnitario: 2000, iva: 10.5 },
      ],
      condicionVenta: 'Contado',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')

    const cae = res.headers.get('x-arca-cae')!
    const nro = Number(res.headers.get('x-arca-nro-comprobante'))
    expect(cae).toMatch(/^\d{14}$/)
    expect(res.headers.get('x-arca-cae-vto')).toMatch(/^\d{8}$/)
    expect(nro).toBe(antes.nro + 1)
    expect(res.headers.get('x-arca-importe-total')).toBe('5287.5')
    expect(res.headers.get('x-arca-tipo-autorizacion')).toBe('CAE')
    expect(res.headers.get('x-arca-pendiente-informar')).toBe('false')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename=F_B_${String(ptoVta).padStart(5, '0')}-${String(nro).padStart(8, '0')}.pdf`,
    )

    const despues = await (await api(`/afip/comprobantes/ultimo?ptoVta=${ptoVta}&tipo=6`)).json()
    expect(despues).toEqual({ ok: true, ptoVta, tipo: 6, nro })

    const consulta = await api(`/afip/comprobantes/${ptoVta}/6/${nro}`)
    const { xml } = await consulta.json()
    expect(xml).toContain(`<CodAutorizacion>${cae}</CodAutorizacion>`)
    expect(xml).toContain('<ImpTotal>5287.5</ImpTotal>')
  }, 90_000)

  it('emite una Factura A a un CUIT con dos alícuotas', async () => {
    const res = await emitir({
      ptoVta,
      cbteTipo: 1,
      receptor: { docTipo: 80, docNro: 20111111112, condicionIVA: 1, razonSocial: 'Cliente RI S.A.' },
      items: [
        { descripcion: 'Producto 21', cantidad: 2, precioUnitario: 100, iva: 21 },
        { descripcion: 'Producto 10.5', cantidad: 1, precioUnitario: 200, iva: 10.5 },
      ],
      condicionVenta: 'Cuenta Corriente',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-arca-cae')).toMatch(/^\d{14}$/)
    expect(res.headers.get('x-arca-importe-total')).toBe('463')
  }, 90_000)

  it('request inválido → 400 VALIDATION_ERROR con issues, sin llamar a ARCA', async () => {
    const res = await emitir({
      ptoVta,
      cbteTipo: 1,
      receptor: consumidorFinal,
      items: [{ descripcion: 'x', cantidad: 1, precioUnitario: 100, iva: 4 }],
      condicionVenta: 'Contado',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.issues.map((i: { message: string }) => i.message)).toEqual(
      expect.arrayContaining(['docTipo_invalido_para_A', 'iva_invalido']),
    )
  })

  it('consumidor final desde $10.000.000 → 400 receptor_debe_identificarse_por_monto', async () => {
    const res = await emitir({
      ptoVta,
      cbteTipo: 6,
      receptor: consumidorFinal,
      items: [{ descripcion: 'Auto', cantidad: 1, precioUnitario: 9_000_000, iva: 21 }],
      condicionVenta: 'Contado',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).issues[0].message).toBe('receptor_debe_identificarse_por_monto')
  })

  it('consultar un comprobante inexistente → 502 con el error 602 de ARCA', async () => {
    const res = await api(`/afip/comprobantes/${ptoVta}/6/99999999`)
    expect(res.status).toBe(502)
    expect((await res.json()).afipErrors[0].Code).toBe(602)
  }, 60_000)

  it('parámetros inválidos → 400', async () => {
    expect((await api('/afip/comprobantes/ultimo')).status).toBe(400)
    expect((await api('/afip/comprobantes/1/99/1')).status).toBe(400)
    expect((await api('/afip/cuit/123')).status).toBe(400)
  })

  it('GET /afip/fa-auth/status con token informa un TA vigente', async () => {
    const res = await api('/afip/fa-auth/status')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, valid: true })
  }, 60_000)

  it.skipIf(!!externo)('CORS: el preflight del POS expone los headers X-Arca-*', async () => {
    const res = await fetch(`${base}/afip/facturas`, { method: 'OPTIONS', headers: { Origin: ORIGEN_POS } })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGEN_POS)
    expect(res.headers.get('access-control-expose-headers')).toContain('X-Arca-Cae')
    const otro = await fetch(`${base}/afip/facturas`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    expect(otro.headers.get('access-control-allow-origin')).toBeNull()
  })
})
