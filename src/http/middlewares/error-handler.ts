import type { NextFunction, Request, Response } from 'express'
import { ArcaError, ValidationError, WsfeError, ComprobanteRechazadoError } from '../../domain/errors.js'
import type { Logger } from '../../domain/logger.js'

/**
 * Crea un middleware de error handler que mapea `ArcaError`
 * a respuestas HTTP uniformes `{ ok: false, error, code, ... }`.
 */
export function createErrorHandlerMiddleware(opts: { logger?: Logger } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(400).json({
        ok: false,
        error: err.message,
        code: err.code,
        issues: err.issues,
      })
      return
    }
    if (err instanceof ComprobanteRechazadoError) {
      res.status(502).json({
        ok: false,
        error: err.message,
        code: err.code,
        cae: err.cae,
        caeFchVto: err.caeFchVto,
        afipErrors: err.errores,
        afipObservations: err.observaciones,
      })
      return
    }
    if (err instanceof WsfeError) {
      res.status(502).json({
        ok: false,
        error: err.message,
        code: err.code,
        faultcode: err.faultcode,
        faultstring: err.faultstring,
        afipErrors: err.errores,
        afipObservations: err.observaciones,
      })
      return
    }
    if (err instanceof ArcaError) {
      const status =
        err.code === 'TA_INVALIDO'
          ? 401
          : err.code === 'CONFIG_ERROR'
            ? 500
            : err.code === 'OPENSSL_NOT_FOUND'
              ? 500
              : 500
      res.status(status).json({
        ok: false,
        error: err.message,
        code: err.code,
        details: err.details,
      })
      return
    }
    // Error desconocido
    const e = err as Error
    opts.logger?.error(
      { event: 'http.unhandled_error', path: req.path, err: String(err), stack: e?.stack },
      'Unhandled error in HTTP handler',
    )
    res.status(500).json({
      ok: false,
      error: e?.message ?? String(err),
      code: 'INTERNAL_ERROR',
    })
  }
}
