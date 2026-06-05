import { Router, type Request, type Response, type NextFunction } from 'express'
import type { WsaaClient } from '../../core/wsaa.js'

/**
 * Crea las rutas de autenticación (solo TA status por ahora).
 * GET /fa-auth/status — devuelve vigencia del TA cacheado.
 */
export function createAuthRoutes(deps: { wsaa: WsaaClient }) {
  const r = Router()

  r.get('/fa-auth/status', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const ta = await deps.wsaa.getCachedTA()
      res.json({
        ok: true,
        valid: ta.valid,
        expiration: ta.expiration?.toISOString() ?? null,
        header: ta.header,
        taPath: ta.taPath,
      })
    } catch (err) {
      next(err)
    }
  })

  return r
}
