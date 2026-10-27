import { Router, type Router as ExpressRouter } from 'express'
import type { BillingService } from '../services/billing-service.js'
import type { ComprobantesService } from '../services/comprobantes-service.js'
import type { CuitService } from '../services/cuit-service.js'
import type { WsaaClient } from '../core/wsaa.js'
import { createAuthRoutes } from './routes/auth.js'
import { createBillingRoutes } from './routes/billing.js'
import { createComprobantesRoutes } from './routes/comprobantes.js'
import { createCuitRoutes } from './routes/cuit.js'
import { createAuthMiddleware } from './middlewares/auth.js'

export interface ArcaRouterDeps {
  wsaa: WsaaClient
  billing: BillingService
  comprobantes: ComprobantesService
  cuit: CuitService
  /** Secret para JWT. Si es null/vacío, los endpoints no requieren auth. */
  jwtSecret: string | null
  /** Antigüedad máxima aceptada de un JWT (ej. '12h', por el claim `iat`). Sin valor: solo se valida `exp`. */
  jwtMaxAge?: string | null
  /** Si true, los endpoints de billing devuelven el PDF binario. */
  sendPdfAsBinary?: boolean
}

/**
 * Crea el Router de Express con todas las rutas del módulo.
 *
 * Las rutas se exponen bajo el prefijo `/afip`:
 *   GET  /afip/fa-auth/status
 *   POST /afip/facturas
 *   GET  /afip/comprobantes/ultimo
 *   GET  /afip/comprobantes/:ptoVta/:tipo/:nro
 *   GET  /afip/cuit/:cuit
 *
 * Para montarlo en tu app:
 * ```ts
 * app.use('/api', createArcaRouter(deps))
 * // → queda expuesto en /api/afip/*
 * ```
 */
export function createArcaRouter(deps: ArcaRouterDeps): ExpressRouter {
  const router = Router()
  const auth = createAuthMiddleware({ secret: deps.jwtSecret, maxAge: deps.jwtMaxAge })

  router.use(
    '/afip',
    createAuthRoutes({ wsaa: deps.wsaa, auth }),
  )
  router.use(
    '/afip',
    createBillingRoutes({
      billing: deps.billing,
      auth,
      sendPdfAsBinary: deps.sendPdfAsBinary,
    }),
  )
  router.use(
    '/afip',
    createComprobantesRoutes({ comprobantes: deps.comprobantes, auth }),
  )
  router.use(
    '/afip',
    createCuitRoutes({ cuit: deps.cuit, auth }),
  )

  return router
}
