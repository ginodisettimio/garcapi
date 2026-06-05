/**
 * Logger inyectable. Compatible con pino, winston, bunyan, console, etc.
 *
 * Si el consumidor no provee un logger, se usa el default (console)
 * que respeta la variable de entorno `ARCA_LOG_LEVEL`.
 */
export interface Logger {
  debug(obj: object | string, msg?: string): void
  info(obj: object | string, msg?: string): void
  warn(obj: object | string, msg?: string): void
  error(obj: object | string, msg?: string): void
}

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

const LEVEL_RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

/** Logger por defecto: escribe a `console` filtrando por nivel. */
export class ConsoleLogger implements Logger {
  private readonly level: number

  constructor(level: LogLevel = 'info') {
    this.level = LEVEL_RANK[level]
  }

  private log(method: 'debug' | 'info' | 'warn' | 'error', obj: object | string, msg?: string) {
    if (LEVEL_RANK[method] > this.level) return
    const payload: Record<string, unknown> = typeof obj === 'string' ? { msg: obj } : { ...obj }
    if (msg) payload['msg'] = msg
    // eslint-disable-next-line no-console
    console[method](payload)
  }

  debug(obj: object | string, msg?: string): void {
    this.log('debug', obj, msg)
  }
  info(obj: object | string, msg?: string): void {
    this.log('info', obj, msg)
  }
  warn(obj: object | string, msg?: string): void {
    this.log('warn', obj, msg)
  }
  error(obj: object | string, msg?: string): void {
    this.log('error', obj, msg)
  }
}

/** Logger silencioso (no escribe nada). Útil para tests. */
export class SilentLogger implements Logger {
  debug(_obj: object | string, _msg?: string): void { /* noop */ }
  info(_obj: object | string, _msg?: string): void { /* noop */ }
  warn(_obj: object | string, _msg?: string): void { /* noop */ }
  error(_obj: object | string, _msg?: string): void { /* noop */ }
}
