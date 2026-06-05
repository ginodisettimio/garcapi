import express, { type Express, type Request, type Response } from 'express'
import type { Server } from 'node:http'
import { createArcaRouter, type ArcaRouterDeps } from './router.js'
import { createErrorHandlerMiddleware } from './middlewares/error-handler.js'
import { ConsoleLogger, type LogLevel } from '../domain/logger.js'
import type { ArcaConfig } from '../config/config.js'

export interface ArcaServerDeps extends ArcaRouterDeps {
  config: ArcaConfig
  logger?: ConsoleLogger
}

/**
 * Crea una app Express standalone con todas las rutas del módulo.
 * Útil para correr el módulo como microservicio independiente.
 */
export function createArcaServer(deps: ArcaServerDeps): Express {
  const app = express()
  const logger =
    deps.logger ??
    new ConsoleLogger((deps.config.logLevel ?? 'info') as LogLevel)

  // Body parsing
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: true }))

  // CORS — opcional
  if (deps.config.http.corsOrigins.length > 0) {
    const origins = deps.config.http.corsOrigins
    app.use((req: Request, res: Response, next) => {
      const origin = req.headers.origin
      if (origins.includes('*') || (origin && origins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin!)
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end()
        return
      }
      next()
    })
  }

  // Helmet y rate-limit: opcionales. El usuario puede
  // aplicarlos a la app resultante si lo necesita.
  // No los forzamos aquí para mantener el módulo con deps mínimas.

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, module: 'arca-api-tordini', env: deps.config.arcaEnv })
  })

  // Rutas ARCA
  app.use(createArcaRouter(deps))

  // Error handler
  app.use(createErrorHandlerMiddleware({ logger }))

  return app
}

/**
 * Crea + arranca un server Express standalone.
 * Devuelve una tupla `[app, server]` para que el caller pueda
 * hacer `server.close()` o agregar más rutas.
 */
export function listenArcaServer(
  deps: ArcaServerDeps,
): Promise<{ app: Express; server: Server; url: string }> {
  return new Promise((resolve) => {
    const app = createArcaServer(deps)
    const server = app.listen(deps.config.http.port, deps.config.http.host, () => {
      const url = `http://${deps.config.http.host}:${deps.config.http.port}`
      resolve({ app, server, url })
    })
  })
}
