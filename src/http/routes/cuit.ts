import { Router, type NextFunction, type Request, type Response } from 'express'
import type { CuitService } from '../../services/cuit-service.js'
import { ValidationError } from '../../domain/errors.js'
import type { AuthMiddleware } from '../middlewares/auth.js'

export interface CuitRoutesDeps {
  cuit: CuitService
  auth: AuthMiddleware
}

/**
 * Crea las rutas de consulta de CUIT.
 * GET /cuit/:cuit — placeholder. La implementación real requiere
 * Padrón A13 (no incluido en este módulo).
 */
export function createCuitRoutes(deps: CuitRoutesDeps) {
  const r = Router()

  r.get('/cuit/:cuit', deps.auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cuit = String(req.params.cuit).replace(/\D/g, '')
      if (cuit.length !== 11) {
        throw new ValidationError('CUIT debe tener 11 dígitos', [
          { path: ['cuit'], message: 'longitud_invalida' },
        ])
      }
      const info = await deps.cuit.lookup(cuit)
      res.json({ ok: true, ...info })
    } catch (err) {
      next(err)
    }
  })

  return r
}
