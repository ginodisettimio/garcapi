import { describe, it, expect } from 'vitest'
import { mapAlicuota, isValidIvaInput } from '../../src/domain/iva.js'

describe('iva helpers', () => {
  it('mapAlicuota: percent → {id, pct}', () => {
    expect(mapAlicuota(0)).toEqual({ id: 3, pct: 0 })
    expect(mapAlicuota(2.5)).toEqual({ id: 9, pct: 2.5 })
    expect(mapAlicuota(10.5)).toEqual({ id: 4, pct: 10.5 })
    expect(mapAlicuota(21)).toEqual({ id: 5, pct: 21 })
    expect(mapAlicuota(27)).toEqual({ id: 6, pct: 27 })
  })

  it('mapAlicuota: id → {id, pct}', () => {
    expect(mapAlicuota(3)).toEqual({ id: 3, pct: 0 })
    expect(mapAlicuota(4)).toEqual({ id: 4, pct: 10.5 })
    expect(mapAlicuota(5)).toEqual({ id: 5, pct: 21 })
    expect(mapAlicuota(6)).toEqual({ id: 6, pct: 27 })
    expect(mapAlicuota(8)).toEqual({ id: 8, pct: 5 })
    expect(mapAlicuota(9)).toEqual({ id: 9, pct: 2.5 })
  })

  it('mapAlicuota: unknown value → default 0% / id 3', () => {
    expect(mapAlicuota(99)).toEqual({ id: 3, pct: 0 })
    expect(mapAlicuota(15)).toEqual({ id: 3, pct: 0 })
  })

  it('isValidIvaInput', () => {
    expect(isValidIvaInput(0)).toBe(true)
    expect(isValidIvaInput(21)).toBe(true)
    expect(isValidIvaInput(3)).toBe(true)
    expect(isValidIvaInput(5)).toBe(true)
    expect(isValidIvaInput(99)).toBe(false)
    expect(isValidIvaInput(7)).toBe(false)
  })
})
