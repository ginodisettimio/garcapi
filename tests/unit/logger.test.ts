import { describe, it, expect } from 'vitest'
import { ConsoleLogger, SilentLogger } from '../../src/domain/logger.js'

describe('ConsoleLogger', () => {
  it('info con level=info no loggea debug', () => {
    const logger = new ConsoleLogger('info')
    const orig = console.debug
    let called = false
    console.debug = () => { called = true }
    logger.debug('test')
    console.debug = orig
    expect(called).toBe(false)
  })

  it('info con level=info loggea info', () => {
    const logger = new ConsoleLogger('info')
    const orig = console.info
    let called = false
    let received: unknown = null
    console.info = (...args: unknown[]) => { called = true; received = args[0] }
    logger.info({ foo: 1 })
    console.info = orig
    expect(called).toBe(true)
    expect(received).toEqual({ foo: 1 })
  })

  it('error con level=silent no loggea nada', () => {
    const logger = new ConsoleLogger('silent')
    const origErr = console.error
    let called = false
    console.error = () => { called = true }
    logger.error('test')
    console.error = origErr
    expect(called).toBe(false)
  })
})

describe('SilentLogger', () => {
  it('no loggea nada', () => {
    const orig = console.log
    let called = false
    console.log = () => { called = true }
    const l = new SilentLogger()
    l.debug('x')
    l.info('x')
    l.warn('x')
    l.error('x')
    console.log = orig
    expect(called).toBe(false)
  })
})
