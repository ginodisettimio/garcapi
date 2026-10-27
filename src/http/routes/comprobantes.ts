import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ComprobantesService } from '../../services/comprobantes-service.js'
import { isCbteTipo } from '../../domain/comprobante.js'
import { ValidationError } from '../../domain/errors.js'
import type { AuthMiddleware } from '../middlewares/auth.js'

export interface ComprobantesRoutesDeps {
  comprobantes: ComprobantesService
  auth: AuthMiddleware
}

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0
}

/**
 * Crea las rutas de consulta de comprobantes.
 * GET /comprobantes/ultimo?ptoVta=&tipo=
 * GET /comprobantes/:ptoVta/:tipo/:nro
 */
export function createComprobantesRoutes(deps: ComprobantesRoutesDeps) {
  const r = Router()
  const { auth } = deps

  r.get('/comprobantes/ultimo', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ptoVta = Number(req.query.ptoVta)
      const tipo = Number(req.query.tipo)
      if (!isPositiveInt(ptoVta) || !isPositiveInt(tipo)) {
        throw new ValidationError('ptoVta y tipo son requeridos y deben ser enteros positivos')
      }
      if (!isCbteTipo(tipo)) {
        throw new ValidationError(`tipo de comprobante inválido: ${tipo}`)
      }
      const last = await deps.comprobantes.ultimoAutorizado(ptoVta, tipo)
      res.json({ ok: true, ptoVta, tipo, nro: last })
    } catch (err) {
      next(err)
    }
  })

  r.get(
    '/comprobantes/:ptoVta/:tipo/:nro',
    auth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ptoVta = Number(req.params.ptoVta)
        const tipo = Number(req.params.tipo)
        const nro = Number(req.params.nro)
        if (!isPositiveInt(ptoVta) || !isPositiveInt(tipo) || !isPositiveInt(nro)) {
          throw new ValidationError('ptoVta, tipo y nro son requeridos y deben ser enteros positivos')
        }
        if (!isCbteTipo(tipo)) {
          throw new ValidationError(`tipo de comprobante inválido: ${tipo}`)
        }
        const xml = await deps.comprobantes.consultar(ptoVta, tipo, nro)
        // Devolvemos el XML parseado si el cliente lo pide
        if (req.query.format === 'raw') {
          res.type('application/xml').send(xml)
        } else {
          res.json({ ok: true, xml })
        }
      } catch (err) {
        next(err)
      }
    },
  )

  return r
}
