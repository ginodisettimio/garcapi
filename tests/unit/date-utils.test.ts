import { describe, it, expect } from 'vitest'
import { formatYmd, parseYmd, todayYmd, ymdToDmy, ymdToIso } from '../../src/services/date-utils.js'

// Versión pública: date-utils es un stub. Tests disponibles en la versión completa.
describe.skip('date-utils', () => {
  it('formatYmd', () => {
    expect(formatYmd(new Date(2024, 0, 5))).toBe('20240105')
    expect(formatYmd(new Date(2024, 11, 31))).toBe('20241231')
  })

  it('parseYmd', () => {
    const d = parseYmd('20240105')
    expect(d?.getFullYear()).toBe(2024)
    expect(d?.getMonth()).toBe(0)
    expect(d?.getDate()).toBe(5)
  })

  it('parseYmd returns null for invalid', () => {
    expect(parseYmd('2024-01-05')).toBe(null)
    expect(parseYmd('hola')).toBe(null)
    expect(parseYmd('2024010')).toBe(null) // 7 dígitos
  })

  it('todayYmd', () => {
    const t = todayYmd()
    expect(t).toMatch(/^\d{8}$/)
  })

  it('ymdToDmy', () => {
    expect(ymdToDmy('20240105')).toBe('05/01/2024')
  })

  it('ymdToIso', () => {
    expect(ymdToIso('20240105')).toBe('2024-01-05')
  })

  it('roundtrip formatYmd → parseYmd', () => {
    const orig = new Date(2024, 5, 15)
    const ymd = formatYmd(orig)
    const parsed = parseYmd(ymd)
    expect(parsed?.getFullYear()).toBe(2024)
    expect(parsed?.getMonth()).toBe(5)
    expect(parsed?.getDate()).toBe(15)
  })
})
