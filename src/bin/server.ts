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
 *   ARCA_HTTP_PORT         - default 3001
 *   CERTS_DIR              - default ./certs
 *   ARCA_DATOS_BANCARIOS   - datos bancarios opcionales
 *
 * Uso:
 *   tsx src/bin/server.ts
 *   node dist/bin/server.js   (producción)
 */
import { createArca, listenArcaServer } from '../index.js'
import { ConsoleLogger } from '../domain/logger.js'

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`Error: variable de entorno requerida no definida: ${name}`)
    process.exit(1)
  }
  return v
}

const arca = createArca({
  cuit: Number(required('ARCA_CUIT')),
  razonSocial: required('ARCA_RAZON_SOCIAL'),
  domicilio: required('ARCA_DOMICILIO'),
  condicionIva: required('ARCA_CONDICION_IVA'),
  inicioActividades: required('ARCA_INICIO_ACTIVIDADES'),
  ingresosBrutos: required('ARCA_INGRESOS_BRUTOS'),
  ptoVtaDefault: Number(required('ARCA_PTO_VTA_DEFAULT')),
  arcaEnv: (process.env.ARCA_ENV as 'homologacion' | 'produccion' | undefined) ?? 'homologacion',
  certsDir: process.env.CERTS_DIR ?? './certs',
  datosBancarios: process.env.ARCA_DATOS_BANCARIOS,
})

if (arca.config.arcaEnv === 'produccion') {
  if (!arca.config.http.jwt.secret) {
    console.error('Error: en producción ARCA_JWT_SECRET es obligatorio (sin él cualquiera que llegue al puerto puede emitir comprobantes).')
    process.exit(1)
  }
  if (arca.config.http.corsOrigins.includes('*')) {
    console.warn('Aviso: ARCA_CORS_ORIGINS="*" en producción. Limitalo al origen del POS.')
  }
}

const result = listenArcaServer({
  config: arca.config,
  logger: new ConsoleLogger(arca.config.logLevel),
  wsaa: arca.wsaa,
  billing: arca.billing,
  comprobantes: arca.comprobantes,
  cuit: arca.cuit,
  jwtSecret: process.env.ARCA_JWT_SECRET ?? null,
})

result.then(({ url }) => {
  // eslint-disable-next-line no-console
  console.log(`arca-api-tordini escuchando en ${url}`)
})

// Contingencia CAEA: pedir el CAEA de la quincena e informar lo emitido mientras ARCA esté disponible
if (arca.contingencia) {
  const contingencia = arca.contingencia
  void contingencia.mantenimiento()
  setInterval(() => void contingencia.mantenimiento(), 30 * 60_000).unref()
}

// Manejar shutdown limpio
const shutdown = async (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} recibido, cerrando...`)
  await arca.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
