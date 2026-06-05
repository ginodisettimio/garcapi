import { describe, it, expect } from 'vitest'
import { MemoryTaStorage, FileTaStorage } from '../../src/core/storage.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Versión pública: storage es un stub. Tests disponibles en la versión completa.
describe.skip('MemoryTaStorage', () => {
  it('returns null when empty', async () => {
    const s = new MemoryTaStorage()
    expect(await s.read('homologacion')).toBe(null)
  })

  it('writes and reads', async () => {
    const s = new MemoryTaStorage()
    await s.write('homologacion', '<xml>test</xml>')
    expect(await s.read('homologacion')).toBe('<xml>test</xml>')
  })

  it('isolates envs', async () => {
    const s = new MemoryTaStorage()
    await s.write('homologacion', 'h')
    await s.write('produccion', 'p')
    expect(await s.read('homologacion')).toBe('h')
    expect(await s.read('produccion')).toBe('p')
  })

  it('pathFor is descriptive', () => {
    const s = new MemoryTaStorage()
    expect(s.pathFor('homologacion')).toContain('homologacion')
  })
})

// Versión pública: FileTaStorage es un stub. Tests disponibles en la versión completa.
describe.skip('FileTaStorage', () => {
  it('writes, reads and persists across instances', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arca-test-'))
    try {
      const s1 = new FileTaStorage(dir, 'TA.xml')
      await s1.write('homologacion', '<xml>ta</xml>')
      const s2 = new FileTaStorage(dir, 'TA.xml')
      expect(await s2.read('homologacion')).toBe('<xml>ta</xml>')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns null for missing file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'arca-test-'))
    try {
      const s = new FileTaStorage(dir, 'TA.xml')
      expect(await s.read('homologacion')).toBe(null)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
