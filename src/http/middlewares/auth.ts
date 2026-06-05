import type { NextFunction, Request, Response } from 'express'

/**
 * Crea un middleware de autenticación JWT.
 * Si `secret` es null/empty, el middleware deja pasar (no auth).
 */
export function createAuthMiddleware(opts: { secret: string | null }) {
  if (!opts.secret) {
    return (_req: Request, _res: Response, next: NextFunction) => next()
  }

  // Import dinámico para que jsonwebtoken sea opcional
  return (req: Request, res: Response, next: NextFunction) => {
    import('jsonwebtoken')
      .then(({ default: jwt }) => {
        const h = req.headers.authorization || ''
        const token = h.startsWith('Bearer ') ? h.slice(7) : ''
        if (!token) {
          res.status(401).json({ ok: false, error: 'unauthorized' })
          return
        }
        try {
          const decoded = jwt.verify(token, opts.secret!) as Record<string, unknown>
          ;(req as Request & { user?: Record<string, unknown> }).user = {
            id: decoded.id,
            role: decoded.role,
            email: decoded.email,
          }
          next()
        } catch {
          res.status(401).json({ ok: false, error: 'unauthorized' })
        }
      })
      .catch((err) => {
        res.status(500).json({ ok: false, error: 'jwt_module_not_available', detail: String(err) })
      })
  }
}

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>
