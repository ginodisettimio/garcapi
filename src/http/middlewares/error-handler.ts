import type { NextFunction, Request, Response } from 'express'
import { ArcaError, ValidationError, WsfeError, ComprobanteRechazadoError } from '../../domain/errors.js'
import type { Logger } from '../../domain/logger.js'

/** Status HTTP por código de `ArcaError` (el resto, 500). */
const STATUS_BY_CODE: Record<string, number> = {
  TA_INVALIDO: 401,
  CUIT_NO_ENCONTRADO: 404,
  NETWORK_ERROR: 503,
  CAEA_NO_DISPONIBLE: 503,
  CAE_RESULTADO_INCIERTO: 504,
}

/** Códigos 5xx cuyos `details` le sirven al cliente para decidir qué hacer (el resto se loguea y no se expone). */
const DETAILS_PUBLICOS = new Set(['CAE_RESULTADO_INCIERTO', 'CAEA_NO_DISPONIBLE'])

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
      opts.logger?.warn(
        { event: 'http.comprobante_rechazado', path: req.path, errores: err.errores, observaciones: err.observaciones },
        'ARCA rechazó el comprobante',
      )
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
      opts.logger?.error(
        { event: 'http.wsfe_error', path: req.path, code: err.code, err: err.message, errores: err.errores },
        'Error de ARCA (WSFE)',
      )
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
      const status = STATUS_BY_CODE[err.code] ?? 500
      if (status >= 500) {
        opts.logger?.error(
          { event: 'http.error', path: req.path, code: err.code, err: err.message, details: err.details },
          'Error al procesar la request',
        )
      }
      res.status(status).json({
        ok: false,
        error: err.message,
        code: err.code,
        ...(status < 500 || DETAILS_PUBLICOS.has(err.code) ? { details: err.details } : {}),
      })
      return
    }
    // Errores del parser del body (express.json): JSON inválido, body demasiado grande, etc.
    const httpErr = err as { status?: unknown; expose?: unknown; type?: unknown }
    if (httpErr.expose === true && typeof httpErr.status === 'number' && httpErr.status >= 400 && httpErr.status < 500) {
      const [code, error] =
        httpErr.type === 'entity.parse.failed'
          ? ['INVALID_JSON', 'El body no es JSON válido']
          : httpErr.type === 'entity.too.large'
            ? ['PAYLOAD_TOO_LARGE', 'El body es demasiado grande']
            : ['BAD_REQUEST', 'Request inválido']
      res.status(httpErr.status).json({ ok: false, error, code })
      return
    }
    // Error desconocido
    const e = err as Error
    opts.logger?.error(
      { event: 'http.unhandled_error', path: req.path, err: String(err), stack: e?.stack },
      'Unhandled error in HTTP handler',
    )
    res.status(500).json({ ok: false, error: 'Error interno', code: 'INTERNAL_ERROR' })
  }
}
