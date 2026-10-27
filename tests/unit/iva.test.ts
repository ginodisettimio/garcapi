import { describe, it, expect } from 'vitest'
import { mapAlicuota, isValidIvaInput, calcularImportes } from '../../src/domain/iva.js'

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

describe('calcularImportes', () => {
  it('A: agrupa por alícuota y suma neto + IVA', () => {
    const r = calcularImportes(1, [
      { descripcion: 'a', cantidad: 2, precioUnitario: 100, iva: 21 },
      { descripcion: 'b', cantidad: 1, precioUnitario: 50, iva: 21 },
      { descripcion: 'c', cantidad: 3, precioUnitario: 10.1, iva: 10.5 },
    ])
    expect(r.alicuotas).toEqual([
      { id: 5, baseImp: 250, importe: 52.5 },
      { id: 4, baseImp: 30.3, importe: 3.18 },
    ])
    expect(r.impNeto).toBe(280.3)
    expect(r.impIva).toBe(55.68)
    expect(r.impTotal).toBe(335.98)
  })

  it('B: README quick start (826.45 + 21%)', () => {
    const r = calcularImportes(6, [{ descripcion: 'x', cantidad: 1, precioUnitario: 826.45, iva: 21 }])
    expect(r.impIva).toBe(173.55)
    expect(r.impTotal).toBe(1000)
  })

  it('C: no discrimina IVA', () => {
    const r = calcularImportes(11, [{ descripcion: 'x', cantidad: 2, precioUnitario: 500, iva: 0 }])
    expect(r).toEqual({ impNeto: 1000, impIva: 0, impTotal: 1000, alicuotas: [] })
  })
})
