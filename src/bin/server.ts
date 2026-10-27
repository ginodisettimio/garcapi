#!/usr/bin/env node
/**
 * Server standalone HTTP.
 *
 * Lee configuración de env vars (CERTS_DIR, ARCA_ENV, ARCA_CUIT, etc.),
 * instancia todos los servicios y levanta un Express en ARCA_HTTP_PORT.
 *
 * Variables de entorno requeridas:
 *   ARCA_CUIT              - CUIT del emisor (sin puntos, 11 dígitos)
 *   ARCA_RAZON_SOCIAL      - Razón social
 *   ARCA_DOMICILIO         - Domicilio fiscal
 *   ARCA_CONDICION_IVA     - Condición frente al IVA
 *   ARCA_INICIO_ACTIVIDADES - DD/MM/AAAA
 *   ARCA_INGRESOS_BRUTOS   - Número de Ingresos Brutos
 *   ARCA_PTO_VTA_DEFAULT   - Punto de venta (número)
 *
 * Opcionales:
 *   ARCA_ENV               - homologacion | produccion (default: homologacion)
 *   ARCA_CAEA_PTO_VTA      - punto de venta CAEA: habilita la contingencia y su mantenimiento cada 30 min
 *   ARCA_JWT_SECRET        - obligatorio en producción (mínimo 32 caracteres)
 *   ARCA_HTTP_PORT         - default 3001
 *   CERTS_DIR              - default ./certs
 *   ARCA_DATOS_BANCARIOS   - datos bancarios opcionales
 *
 * Uso:
 *   tsx src/bin/server.ts
 *   node dist/bin/server.js   (producción)
 */
import { createArca, listenArcaServer, loadConfig } from '../index.js'
import { ConsoleLogger } from '../domain/logger.js'

/** Termina el proceso con un mensaje (errores de configuración al arrancar). */
function fatal(msg: string): never {
  console.error(`Error: ${msg}`)
  process.exit(1)
}

function required(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) fatal(`variable de entorno requerida no definida: ${name}`)
  return v
}

// Primero la config: carga el .env, así todo lo que sigue lee las mismas variables que los servicios
const config = (() => {
  try {
    return loadConfig()
  } catch (err) {
    fatal(err instanceof Error ? err.message : String(err))
  }
})()

const cuit = required('ARCA_CUIT').replace(/\D/g, '')
if (cuit.length !== 11) fatal('ARCA_CUIT debe tener 11 dígitos')
const ptoVtaDefault = Number(required('ARCA_PTO_VTA_DEFAULT'))
if (!Number.isInteger(ptoVtaDefault) || ptoVtaDefault <= 0) fatal('ARCA_PTO_VTA_DEFAULT debe ser un entero positivo')

const jwtSecret = config.http.jwt.secret
if (config.arcaEnv === 'produccion') {
  if (!jwtSecret) fatal('en producción ARCA_JWT_SECRET es obligatorio (sin él cualquiera que llegue al puerto puede emitir comprobantes)')
  if (jwtSecret.length < 32) fatal('en producción ARCA_JWT_SECRET debe tener al menos 32 caracteres (openssl rand -hex 32)')
  if (config.http.corsOrigins.includes('*')) console.warn('Aviso: ARCA_CORS_ORIGINS="*" en producción. Limitalo al origen del POS.')
}

const arca = createArca({
  cuit: Number(cuit),
  razonSocial: required('ARCA_RAZON_SOCIAL'),
  domicilio: required('ARCA_DOMICILIO'),
  condicionIva: required('ARCA_CONDICION_IVA'),
  inicioActividades: required('ARCA_INICIO_ACTIVIDADES'),
  ingresosBrutos: required('ARCA_INGRESOS_BRUTOS'),
  ptoVtaDefault,
  arcaEnv: config.arcaEnv,
  certsDir: config.certsDir,
  datosBancarios: process.env.ARCA_DATOS_BANCARIOS,
})

const { server, url } = await listenArcaServer({
  config,
  logger: new ConsoleLogger(config.logLevel),
  wsaa: arca.wsaa,
  billing: arca.billing,
  comprobantes: arca.comprobantes,
  cuit: arca.cuit,
  jwtSecret,
  jwtMaxAge: config.http.jwt.expiresIn,
})
console.log(`arca-api-tordini escuchando en ${url} (${config.arcaEnv})`)

// Contingencia CAEA: pedir el CAEA de la quincena e informar lo emitido mientras ARCA esté disponible
if (arca.contingencia) {
  const contingencia = arca.contingencia
  void contingencia.mantenimiento()
  setInterval(() => void contingencia.mantenimiento(), 30 * 60_000).unref()
}

/** Tiempo máximo esperando requests en curso al apagar (docker-compose da 30 s). */
const SHUTDOWN_TIMEOUT_MS = 25_000

// Cortar una emisión en curso dejaría un comprobante autorizado sin respuesta al POS: se espera a que terminen
let cerrando = false
const shutdown = async (signal: string) => {
  if (cerrando) return
  cerrando = true
  console.log(`\n${signal} recibido: esperando las requests en curso...`)
  setTimeout(() => {
    console.error('Timeout esperando requests en curso; se cierra igual')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS).unref()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await arca.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
