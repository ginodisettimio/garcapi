import type { ZodTypeAny } from 'zod'
import type { NextFunction, Request, Response } from 'express'

/**
 * Crea un middleware de validación con Zod.
 * - Valida `req.body` contra el schema.
 * - Si falla, devuelve 400 con detalles.
 * - Si pasa, sobrescribe `req.body` con los datos parseados (con transforms aplicados).
 */
export function createValidateMiddleware() {
  return (schema: ZodTypeAny) =>
    (req: Request, res: Response, next: NextFunction) => {
      const result = schema.safeParse(req.body)
      if (!result.success) {
        res.status(400).json({
          ok: false,
          error: 'validation_failed',
          issues: result.error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        })
        return
      }
      req.body = result.data
      next()
    }
}
