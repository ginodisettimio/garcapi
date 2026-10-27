import path from 'node:path'
import dotenv from 'dotenv'
import { MONTO_MAX_CONSUMIDOR_FINAL, isPdfFormato, type PdfFormato } from '../domain/constants.js'
import { isArcaEnv, type ArcaEnv, type ArcaService, DEFAULT_ARCA_SERVICE } from '../domain/env.js'
import { ConfigError } from '../domain/errors.js'
import type { LogLevel } from '../domain/logger.js'

/** Configuración del módulo, normalizada y tipada. */
export interface ArcaConfig {
  /** Entorno ARCA (homologacion o produccion). */
  arcaEnv: ArcaEnv
  /** Servicio ARCA para autenticación (default: wsfe). */
  arcaService: ArcaService
  /** Directorio base de certificados. */
  certsDir: string
  /** Path al directorio del entorno actual. */
  envDir: string
  /** Nombres de archivos dentro de cada entorno. */
  files: {
    cert: string
    key: string
    ta: string
    tra: string
    cms: string
  }
  /** Configuración del server HTTP standalone (opcional). */
  http: {
    port: number
    host: string
    corsOrigins: string[]
    rateLimit: {
      windowMs: number
      max: number
    }
    jwt: {
      secret: string | null
      expiresIn: string
    }
  }
  /** Configuración de Puppeteer (PDFs). */
  puppeteer: {
    executablePath: string | null
    concurrency: number
    maxUsos: number
  }
  /** Paths a templates HTML de PDF (null = usar default del paquete). */
  templates: {
    factura: string | null
    presupuesto: string | null
    ticket: string | null
  }
  /** Formato de las facturas en PDF. */
  pdf: {
    formato: PdfFormato
    anchoTicketMm: number
  }
  /**
   * Importe desde el cual se rechaza facturar a Consumidor Final sin identificar
   * (DocTipo 99). `0` desactiva la validación.
   */
  montoMaxConsumidorFinal: number
  /** Nivel de logging. */
  logLevel: LogLevel
}

let cachedConfig: ArcaConfig | null = null

/**
 * Carga y normaliza la configuración desde variables de entorno.
 *
 * - Llama a `dotenv.config()` por defecto para cargar `.env` del cwd.
 * - Se puede pasar un `envPath` explícito.
 * - Se puede pasar un `overrides` para tests.
 * - Se cachea para evitar releer process.env en cada llamada.
 */
export function loadConfig(options: {
  cwd?: string
  envPath?: string
  overrides?: Partial<ArcaConfigEnv>
  reload?: boolean
} = {}): ArcaConfig {
  if (cachedConfig && !options.reload) return cachedConfig

  const cwd = options.cwd ?? process.cwd()

  // 1) Cargar .env del cwd (a menos que se pase envPath)
  if (options.envPath) {
    dotenv.config({ path: options.envPath })
  } else {
    dotenv.config({ path: path.join(cwd, '.env') })
  }

  const env = { ...(process.env as Record<string, string | undefined>), ...(options.overrides ?? {}) }

  // ── Validaciones tempranas ───────────────────────────────────
  const arcaEnvRaw = (env.ARCA_ENV ?? 'homologacion').toString()
  if (!isArcaEnv(arcaEnvRaw)) {
    throw new ConfigError(
      `ARCA_ENV inválido: "${arcaEnvRaw}". Valores válidos: homologacion | produccion`,
    )
  }
  const arcaEnv: ArcaEnv = arcaEnvRaw

  const certsDir = path.resolve(cwd, (env.CERTS_DIR ?? './certs').toString())
  const envDir = path.join(certsDir, arcaEnv)

  const certsDirRaw = env.CERTS_DIR
  if (!certsDirRaw) {
    // Sugerimos el default
    // eslint-disable-next-line no-console
    console.warn(
      `[arca-api-tordini] CERTS_DIR no definido. Usando default: ${certsDir}`,
    )
  }

  // ── Construir config ────────────────────────────────────────
  const arcaService = (env.ARCA_SERVICE ?? DEFAULT_ARCA_SERVICE) as ArcaService

  const corsOrigins =
    (env.ARCA_CORS_ORIGINS ?? '*').toString().trim() === '*'
      ? ['*']
      : (env.ARCA_CORS_ORIGINS ?? '').toString().split(',').map((s) => s.trim()).filter(Boolean)

  const pdfFormato = (env.ARCA_PDF_FORMATO ?? 'a4').toString().trim().toLowerCase()
  if (!isPdfFormato(pdfFormato)) {
    throw new ConfigError(`ARCA_PDF_FORMATO inválido: "${pdfFormato}". Valores válidos: a4, ticket`)
  }

  const config: ArcaConfig = {
    arcaEnv,
    arcaService,
    certsDir,
    envDir,
    files: {
      cert: (env.ARCA_CERT_FILE ?? 'cert.crt').toString(),
      key: (env.ARCA_KEY_FILE ?? 'private.key').toString(),
      ta: (env.ARCA_TA_FILE ?? 'TA_wsfe.xml').toString(),
      tra: (env.ARCA_TRA_FILE ?? 'tra.xml').toString(),
      cms: (env.ARCA_CMS_FILE ?? 'cms.der').toString(),
    },
    http: {
      port: Number(env.ARCA_HTTP_PORT ?? 3001),
      host: (env.ARCA_HTTP_HOST ?? '0.0.0.0').toString(),
      corsOrigins,
      rateLimit: {
        windowMs: Number(env.ARCA_RATE_LIMIT_WINDOW_MS ?? 60_000),
        max: Number(env.ARCA_RATE_LIMIT_MAX ?? 100),
      },
      jwt: {
        secret: (env.ARCA_JWT_SECRET ?? '').toString().trim() || null,
        expiresIn: (env.ARCA_JWT_EXPIRES_IN ?? '12h').toString(),
      },
    },
    puppeteer: {
      executablePath: (env.ARCA_PUPPETEER_EXECUTABLE_PATH ?? '').toString().trim() || null,
      concurrency: Number(env.ARCA_PUPPETEER_CONCURRENCY ?? 2),
      maxUsos: Number(env.ARCA_PUPPETEER_MAX_USOS ?? 100),
    },
    templates: {
      factura: (env.ARCA_TEMPLATE_FACTURA ?? '').toString().trim() || null,
      presupuesto: (env.ARCA_TEMPLATE_PRESUPUESTO ?? '').toString().trim() || null,
      ticket: (env.ARCA_TEMPLATE_TICKET ?? '').toString().trim() || null,
    },
    pdf: {
      formato: pdfFormato,
      anchoTicketMm: Number(env.ARCA_PDF_TICKET_MM ?? 80),
    },
    montoMaxConsumidorFinal: Number(env.ARCA_MONTO_MAX_CF ?? MONTO_MAX_CONSUMIDOR_FINAL),
    logLevel: ((env.ARCA_LOG_LEVEL ?? 'info').toString() as LogLevel),
  }

  cachedConfig = config
  return config
}

/** Resetea el cache. Útil para tests. */
export function resetConfigCache(): void {
  cachedConfig = null
}

/** Tipos auxiliares. */
export interface ArcaConfigEnv {
  ARCA_ENV?: string
  ARCA_SERVICE?: string
  CERTS_DIR?: string
  ARCA_CERT_FILE?: string
  ARCA_KEY_FILE?: string
  ARCA_TA_FILE?: string
  ARCA_TRA_FILE?: string
  ARCA_CMS_FILE?: string
  ARCA_HTTP_PORT?: string
  ARCA_HTTP_HOST?: string
  ARCA_CORS_ORIGINS?: string
  ARCA_RATE_LIMIT_WINDOW_MS?: string
  ARCA_RATE_LIMIT_MAX?: string
  ARCA_JWT_SECRET?: string
  ARCA_JWT_EXPIRES_IN?: string
  ARCA_PUPPETEER_EXECUTABLE_PATH?: string
  ARCA_PUPPETEER_CONCURRENCY?: string
  ARCA_PUPPETEER_MAX_USOS?: string
  ARCA_TEMPLATE_FACTURA?: string
  ARCA_TEMPLATE_PRESUPUESTO?: string
  ARCA_TEMPLATE_TICKET?: string
  ARCA_PDF_FORMATO?: string
  ARCA_PDF_TICKET_MM?: string
  ARCA_MONTO_MAX_CF?: string
  ARCA_LOG_LEVEL?: string
}
