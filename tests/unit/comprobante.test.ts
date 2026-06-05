import { describe, it, expect } from 'vitest'
import {
  isA,
  isB,
  isC,
  isNota,
  isNotaCredito,
  isNotaDebito,
  isFactura,
  isCbteTipo,
  mapCbteTipoNota,
  letraComprobante,
  nombreComprobante,
  prefijoArchivo,
} from '../../src/domain/comprobante.js'
import { CBTE_TIPO } from '../../src/domain/constants.js'

describe('comprobante helpers', () => {
  describe('isA / isB / isC', () => {
    it('isA matches FA (1), NDA (2), NCA (3)', () => {
      expect(isA(1)).toBe(true)
      expect(isA(2)).toBe(true)
      expect(isA(3)).toBe(true)
      expect(isA(6)).toBe(false)
      expect(isA(11)).toBe(false)
    })
    it('isB matches FB (6), NDB (7), NCB (8)', () => {
      expect(isB(6)).toBe(true)
      expect(isB(7)).toBe(true)
      expect(isB(8)).toBe(true)
      expect(isB(1)).toBe(false)
      expect(isB(11)).toBe(false)
    })
    it('isC matches FC (11), NDC (12), NCC (13)', () => {
      expect(isC(11)).toBe(true)
      expect(isC(12)).toBe(true)
      expect(isC(13)).toBe(true)
      expect(isC(1)).toBe(false)
      expect(isC(6)).toBe(false)
    })
  })

  describe('isNota / isNotaCredito / isNotaDebito / isFactura', () => {
    it('isNota matches ND/NC A/B/C', () => {
      expect(isNota(2)).toBe(true)
      expect(isNota(3)).toBe(true)
      expect(isNota(7)).toBe(true)
      expect(isNota(8)).toBe(true)
      expect(isNota(12)).toBe(true)
      expect(isNota(13)).toBe(true)
      expect(isNota(1)).toBe(false)
      expect(isNota(6)).toBe(false)
      expect(isNota(11)).toBe(false)
    })
    it('isNotaCredito matches only NC', () => {
      expect(isNotaCredito(3)).toBe(true)
      expect(isNotaCredito(8)).toBe(true)
      expect(isNotaCredito(13)).toBe(true)
      expect(isNotaCredito(2)).toBe(false)
      expect(isNotaCredito(1)).toBe(false)
    })
    it('isNotaDebito matches only ND', () => {
      expect(isNotaDebito(2)).toBe(true)
      expect(isNotaDebito(7)).toBe(true)
      expect(isNotaDebito(12)).toBe(true)
      expect(isNotaDebito(3)).toBe(false)
      expect(isNotaDebito(1)).toBe(false)
    })
    it('isFactura is the inverse of isNota', () => {
      expect(isFactura(1)).toBe(true)
      expect(isFactura(6)).toBe(true)
      expect(isFactura(11)).toBe(true)
      expect(isFactura(3)).toBe(false)
      expect(isFactura(13)).toBe(false)
    })
  })

  describe('isCbteTipo', () => {
    it('accepts valid tipos', () => {
      expect(isCbteTipo(1)).toBe(true)
      expect(isCbteTipo(13)).toBe(true)
    })
    it('rejects invalid', () => {
      expect(isCbteTipo(0)).toBe(false)
      expect(isCbteTipo(99)).toBe(false)
      expect(isCbteTipo('1')).toBe(false)
      expect(isCbteTipo(null)).toBe(false)
    })
  })

  describe('mapCbteTipoNota', () => {
    it('maps FA → NCA / NDA', () => {
      expect(mapCbteTipoNota(1, 'credito')).toBe(3)
      expect(mapCbteTipoNota(1, 'debito')).toBe(2)
    })
    it('maps FB → NCB / NDB', () => {
      expect(mapCbteTipoNota(6, 'credito')).toBe(8)
      expect(mapCbteTipoNota(6, 'debito')).toBe(7)
    })
    it('maps FC → NCC / NDC', () => {
      expect(mapCbteTipoNota(11, 'credito')).toBe(13)
      expect(mapCbteTipoNota(11, 'debito')).toBe(12)
    })
    it('returns null for non-Factura base', () => {
      expect(mapCbteTipoNota(2, 'credito')).toBe(null)
      expect(mapCbteTipoNota(3, 'debito')).toBe(null)
    })
  })

  describe('letraComprobante / nombreComprobante / prefijoArchivo', () => {
    it('letraComprobante', () => {
      expect(letraComprobante(1)).toBe('A')
      expect(letraComprobante(2)).toBe('A')
      expect(letraComprobante(6)).toBe('B')
      expect(letraComprobante(11)).toBe('C')
    })
    it('nombreComprobante', () => {
      expect(nombreComprobante(1)).toBe('Factura A')
      expect(nombreComprobante(6)).toBe('Factura B')
      expect(nombreComprobante(11)).toBe('Factura C')
      expect(nombreComprobante(3)).toBe('Nota de Crédito A')
      expect(nombreComprobante(8)).toBe('Nota de Crédito B')
      expect(nombreComprobante(13)).toBe('Nota de Crédito C')
      expect(nombreComprobante(2)).toBe('Nota de Débito A')
      expect(nombreComprobante(7)).toBe('Nota de Débito B')
      expect(nombreComprobante(12)).toBe('Nota de Débito C')
    })
    it('prefijoArchivo', () => {
      expect(prefijoArchivo(CBTE_TIPO.FACTURA_A)).toBe('F')
      expect(prefijoArchivo(CBTE_TIPO.FACTURA_B)).toBe('F')
      expect(prefijoArchivo(CBTE_TIPO.FACTURA_C)).toBe('F')
      expect(prefijoArchivo(CBTE_TIPO.NOTA_CREDITO_A)).toBe('F_NC')
      expect(prefijoArchivo(CBTE_TIPO.NOTA_CREDITO_B)).toBe('F_NC')
      expect(prefijoArchivo(CBTE_TIPO.NOTA_DEBITO_A)).toBe('F_ND')
      expect(prefijoArchivo(CBTE_TIPO.NOTA_DEBITO_C)).toBe('F_ND')
    })
  })
})
