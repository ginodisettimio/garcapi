import { describe, it, expect } from 'vitest'
import { ArcaError, WsaaError, WsfeError, ComprobanteRechazadoError, wrapError, ValidationError } from '../../src/domain/errors.js'

describe('errors', () => {
  it('ArcaError tiene code, name, details', () => {
    const e = new ArcaError('test', 'TEST_CODE', { x: 1 })
    expect(e.code).toBe('TEST_CODE')
    expect(e.name).toBe('ArcaError')
    expect(e.details).toEqual({ x: 1 })
    expect(e.message).toBe('test')
    expect(e instanceof Error).toBe(true)
  })

  it('WsaaError extends ArcaError', () => {
    const e = new WsaaError('x')
    expect(e instanceof ArcaError).toBe(true)
    expect(e.code).toBe('WSAA_ERROR')
    expect(e.name).toBe('WsaaError')
  })

  it('WsfeError tiene faultcode y faultstring', () => {
    const e = new WsfeError('x', { faultcode: 'A', faultstring: 'B' })
    expect(e.faultcode).toBe('A')
    expect(e.faultstring).toBe('B')
  })

  it('ComprobanteRechazadoError tiene afip errors y observations', () => {
    const e = new ComprobanteRechazadoError('CAEX', '20240105', [{ Code: 100, Msg: 'x' }], ['obs1'])
    expect(e.cae).toBe('CAEX')
    expect(e.caeFchVto).toBe('20240105')
    expect(e.errores).toEqual([{ Code: 100, Msg: 'x' }])
    expect(e.observaciones).toEqual(['obs1'])
  })

  it('wrapError envuelve cualquier error', () => {
    expect(wrapError(new Error('e'))).toBeInstanceOf(ArcaError)
    expect(wrapError('string')).toBeInstanceOf(ArcaError)
    expect(wrapError(null).message).toBe('null')
  })

  it('wrapError devuelve ArcaError tal cual', () => {
    const orig = new ValidationError('x')
    expect(wrapError(orig)).toBe(orig)
  })
})
