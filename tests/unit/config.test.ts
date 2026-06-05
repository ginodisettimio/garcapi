import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig, resetConfigCache } from '../../src/config/config.js'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('loadConfig', () => {
  let workdir: string

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), 'arca-cfg-'))
    resetConfigCache()
  })

  it('carga defaults sin .env', async () => {
    const cfg = loadConfig({ cwd: workdir, overrides: { ARCA_ENV: 'produccion' } })
    expect(cfg.arcaEnv).toBe('produccion')
    expect(cfg.files.cert).toBe('cert.crt')
    expect(cfg.files.key).toBe('private.key')
    expect(cfg.files.ta).toBe('TA_wsfe.xml')
    expect(cfg.http.port).toBe(3001)
  })

  it('lee .env del cwd', async () => {
    await writeFile(
      path.join(workdir, '.env'),
      'ARCA_ENV=produccion\nCERTS_DIR=/custom/certs\nARCA_HTTP_PORT=4000\n',
    )
    const cfg = loadConfig({ cwd: workdir })
    expect(cfg.arcaEnv).toBe('produccion')
    expect(cfg.certsDir).toContain('custom')
    expect(cfg.http.port).toBe(4000)
  })

  it('lanza ConfigError si ARCA_ENV inválido', () => {
    expect(() =>
      loadConfig({ cwd: workdir, overrides: { ARCA_ENV: 'otro' } }),
    ).toThrow(/ARCA_ENV inválido/)
  })

  it('overrides tienen prioridad', async () => {
    await writeFile(path.join(workdir, '.env'), 'ARCA_HTTP_PORT=9999\n')
    const cfg = loadConfig({ cwd: workdir, overrides: { ARCA_HTTP_PORT: '1234' } })
    expect(cfg.http.port).toBe(1234)
  })

  it('cache: misma instancia en llamadas consecutivas', () => {
    const a = loadConfig({ cwd: workdir, overrides: { ARCA_HTTP_PORT: '1111' } })
    const b = loadConfig({ cwd: workdir, overrides: { ARCA_HTTP_PORT: '2222' } })
    expect(a).toBe(b)
    expect(b.http.port).toBe(1111)
  })

  it('reload: lee cambios', async () => {
    const a = loadConfig({ cwd: workdir, overrides: { ARCA_HTTP_PORT: '1111' } })
    expect(a.http.port).toBe(1111)
    const b = loadConfig({ cwd: workdir, reload: true, overrides: { ARCA_HTTP_PORT: '2222' } })
    expect(b.http.port).toBe(2222)
  })
})
