import path from 'node:path'
import { loadConfig, type ArcaConfig } from './config/config.js'
import { ConsoleLogger, type Logger } from './domain/logger.js'
import { FileTaStorage, type TaStorage } from './core/storage.js'
import { OpenSslCmsSigner, type CmsSigner } from './core/cms-signer.js'
import { AxiosSoapClient, type SoapClient } from './core/soap-client.js'
import { WsaaClient } from './core/wsaa.js'
import { WsfeClient } from './core/wsfe.js'
import { PadronA13Client } from './core/padron-a13.js'
import { BillingService } from './services/billing-service.js'
import { ComprobantesService } from './services/comprobantes-service.js'
import { type CuitService, PadronA13CuitService } from './services/cuit-service.js'
import { PuppeteerManager } from './pdf/puppeteer-manager.js'
import { PdfService, type PdfGenerator } from './pdf/pdf-service.js'
import {
  StaticEmisorProvider,
  type EmisorProvider,
} from './domain/types.js'
import { ArcaError, ValidationError, wrapError } from './domain/errors.js'
import type { ArcaService, ArcaEnv } from './domain/env.js'

/** Opciones para `createArca()`. */
export interface CreateArcaOptions {
  /** CUIT del emisor (atajo para `emisor: { cuit, ... }`). */
  cuit: number
  /** Razón social del emisor. */
  razonSocial: string
  /** Domicilio fiscal. */
  domicilio: string
  /** Condición frente al IVA (texto). */
  condicionIva: string
  /** Fecha inicio actividades (DD/MM/AAAA). */
  inicioActividades: string
  /** Número de Ingresos Brutos. */
  ingresosBrutos: string
  /** Punto de venta por defecto. */
  ptoVtaDefault: number
  /** Datos bancarios (opcional). */
  datosBancarios?: string
  /** Entorno ARCA. Si no, toma ARCA_ENV. */
  arcaEnv?: ArcaEnv
  /** Servicio ARCA. Default 'wsfe'. */
  arcaService?: ArcaService
  /** Directorio de certificados. Default './certs' o CERTS_DIR. */
  certsDir?: string
  /** Logger custom. Si no, usa ConsoleLogger. */
  logger?: Logger
  /** Habilitar generación de PDF (default true). */
  pdf?: {
    enabled?: boolean
    templateFactura?: string | null
    templatePresupuesto?: string | null
    executablePath?: string | null
    concurrency?: number
    maxUsos?: number
  }
  /**
   * Proveedor de emisor custom. Si se pasa, se IGNORAN los
   * campos de emisor de primer nivel (cuit, razonSocial, etc.).
   */
  emisorProvider?: EmisorProvider
  /**
   * Storage de TA custom (default: archivo en disco).
   * Útil para tests (MemoryTaStorage) o deployments distribuidos.
   */
  taStorage?: TaStorage
  /**
   * Storage del TA del Padrón A13 (servicio `ws_sr_padron_a13`). Default:
   * archivo `TA_ws_sr_padron_a13.xml` en disco. No puede ser el mismo
   * storage que `taStorage`: cada servicio tiene su propio TA.
   */
  padronTaStorage?: TaStorage
  /** CMS signer custom (default: OpenSslCmsSigner). */
  cmsSigner?: CmsSigner
  /** SOAP client custom. */
  soapClient?: SoapClient
  /** Servicio de CUIT custom. */
  cuitService?: CuitService
  /** Directorio de trabajo para resolver paths relativos. */
  cwd?: string
}

/** Lo que devuelve `createArca()`. */
export interface ArcaModule {
  /** Configuración cargada. */
  config: ArcaConfig
  /** Logger. */
  logger: Logger
  /** Servicio de facturación (comprobante principal). */
  billing: BillingService
  /** Servicio de consulta de comprobantes. */
  comprobantes: ComprobantesService
  /** Servicio de CUIT. */
  cuit: CuitService
  /** Cliente WSAA. */
  wsaa: WsaaClient
  /** Cliente WSFE. */
  wsfe: WsfeClient
  /** Manager de Puppeteer (si pdf está habilitado). */
  puppeteer: PuppeteerManager | null
  /** Generador de PDF. */
  pdf: PdfGenerator | null
  /** Emisor (configurado). */
  emisor: EmisorProvider
  /** Cierra los recursos (Puppeteer, etc). */
  close(): Promise<void>
}

/**
 * Factory principal del módulo. Crea y conecta todos los servicios
 * con sus dependencias inyectadas, listo para usar.
 *
 * ```ts
 * const arca = createArca({
 *   cuit: 20223565078,
 *   razonSocial: 'Mi Empresa S.A.',
 *   domicilio: 'Av. Siempre Viva 742',
 *   condicionIva: 'Responsable Inscripto',
 *   inicioActividades: '01/01/2020',
 *   ingresosBrutos: '123456789',
 *   ptoVtaDefault: 1,
 * })
 *
 * const result = await arca.billing.emitir({ ... })
 * fs.writeFileSync(result.fileName, result.pdfBuffer)
 * ```
 */
export function createArca(opts: CreateArcaOptions): ArcaModule {
  // 1) Cargar config
  const config = loadConfig({ cwd: opts.cwd })

  // 2) Logger
  const logger: Logger = opts.logger ?? new ConsoleLogger(config.logLevel)

  // 3) Resolver emisor
  const emisor: EmisorProvider =
    opts.emisorProvider ??
    new StaticEmisorProvider({
      cuit: opts.cuit,
      razonSocial: opts.razonSocial,
      domicilio: opts.domicilio,
      condicionIva: opts.condicionIva,
      inicioActividades: opts.inicioActividades,
      ingresosBrutos: opts.ingresosBrutos,
      ptoVtaDefault: opts.ptoVtaDefault,
      datosBancarios: opts.datosBancarios,
    })

  // Validar emisor al startup
  void emisor.getEmisor().catch((err) => {
    logger.error(
      { event: 'arca.emisor_provider_error', err: String(err) },
      'Error al obtener el emisor al inicializar el módulo',
    )
  })

  // 4) Storage
  const storage: TaStorage =
    opts.taStorage ?? new FileTaStorage(opts.certsDir ?? config.certsDir, config.files.ta)

  // 5) CMS Signer
  const signer: CmsSigner = opts.cmsSigner ?? new OpenSslCmsSigner()

  // 6) SOAP Client
  const soap: SoapClient = opts.soapClient ?? new AxiosSoapClient()

  // 7) Entorno
  const arcaEnv: ArcaEnv = opts.arcaEnv ?? config.arcaEnv
  const arcaService: ArcaService = opts.arcaService ?? config.arcaService

  // 8) Paths a certificados
  const envDir = opts.certsDir
    ? path.join(opts.certsDir, arcaEnv)
    : path.join(config.certsDir, arcaEnv)
  const certPath = path.join(envDir, config.files.cert)
  const keyPath = path.join(envDir, config.files.key)

  // 9) Core clients
  const wsaa = new WsaaClient({
    arcaEnv,
    arcaService,
    storage,
    signer,
    soap,
    certPath,
    keyPath,
    logger,
  })
  const wsfe = new WsfeClient(soap, arcaEnv)

  // 10) PDF (opcional)
  let puppeteer: PuppeteerManager | null = null
  let pdf: PdfGenerator | null = null
  const pdfEnabled = opts.pdf?.enabled !== false // default true
  if (pdfEnabled) {
    puppeteer = new PuppeteerManager({
      executablePath: opts.pdf?.executablePath ?? config.puppeteer.executablePath,
      concurrency: opts.pdf?.concurrency ?? config.puppeteer.concurrency,
      maxUsos: opts.pdf?.maxUsos ?? config.puppeteer.maxUsos,
    })
    const pdfService = new PdfService({
      puppeteer,
      templateFactura: opts.pdf?.templateFactura ?? config.templates.factura,
      templatePresupuesto: opts.pdf?.templatePresupuesto ?? config.templates.presupuesto,
    })
    pdf = pdfService
  }

  // 11) Services
  const billing = new BillingService({ emisor, wsaa, wsfe, logger, pdf: pdf ?? undefined })
  const comprobantes = new ComprobantesService({ emisor, wsaa, wsfe, logger })
  const padronWsaa = new WsaaClient({
    arcaEnv,
    arcaService: 'ws_sr_padron_a13',
    storage: opts.padronTaStorage ?? new FileTaStorage(opts.certsDir ?? config.certsDir, 'TA_ws_sr_padron_a13.xml'),
    signer,
    soap,
    certPath,
    keyPath,
    logger,
  })
  const cuit: CuitService =
    opts.cuitService ??
    new PadronA13CuitService({ emisor, wsaa: padronWsaa, padron: new PadronA13Client(soap, arcaEnv), logger })

  return {
    config,
    logger,
    billing,
    comprobantes,
    cuit,
    wsaa,
    wsfe,
    puppeteer,
    pdf,
    emisor,
    async close() {
      if (puppeteer) await puppeteer.close()
    },
  }
}

// ──────────────────────────────────────────────────────────────────
// Re-exports del API público
// ──────────────────────────────────────────────────────────────────

// Domain
export * from './domain/index.js'
export type {
  Emisor,
  EmisorProvider,
  Receptor,
  Item,
  ComprobanteAsociado,
  ComprobanteEmitido,
  EmitirComprobanteRequest,
  ArcaAuth,
  TicketAcceso,
} from './domain/index.js'

// Core
export { WsaaClient, WsfeClient, PadronA13Client } from './core/index.js'
export type { CmsSigner, SoapClient, TaStorage } from './core/index.js'
export {
  FileTaStorage,
  MemoryTaStorage,
  OpenSslCmsSigner,
  AxiosSoapClient,
  detectOpenSsl,
} from './core/index.js'

// Services
export { BillingService, ComprobantesService, PadronA13CuitService, NotImplementedCuitService } from './services/index.js'
export type {
  BillingServiceDeps,
  ComprobantesServiceDeps,
  CuitService,
  CuitInfo,
  PadronA13CuitServiceDeps,
} from './services/index.js'

// PDF
export { PuppeteerManager, PdfService, buildQrUrl } from './pdf/index.js'
export type {
  PdfServiceOptions,
  PdfGenerator,
  FacturaPdfData,
  PresupuestoPdfData,
} from './pdf/index.js'
export { StaticEmisorProvider } from './domain/types.js'

// HTTP
export { createArcaRouter, createArcaServer, listenArcaServer } from './http/index.js'
export type { ArcaRouterDeps, ArcaServerDeps } from './http/index.js'

// Logger
export { ConsoleLogger, SilentLogger } from './domain/logger.js'

// Config
export { loadConfig, resetConfigCache } from './config/config.js'
export type { ArcaConfig, ArcaConfigEnv } from './config/config.js'

// Errors
export {
  ArcaError,
  WsaaError,
  WsfeError,
  CmsSignError,
  OpenSslNotFoundError,
  TaInvalidoError,
  ComprobanteRechazadoError,
  ValidationError,
  ConfigError,
  PdfError,
  PadronError,
  FileSystemError,
  NetworkError,
  wrapError,
} from './domain/errors.js'
export type { AfipError } from './domain/errors.js'

// Constants & helpers
export {
  ARCA_URLS,
  PADRON_A13_SOAP_NS,
  CBTE_TIPO,
  CBTE_TIPOS,
  CBTE_TIPO_NOMBRES,
  CBTE_TIPO_LETRAS,
  DOC_TIPO,
  CONDICION_IVA,
  CONDICION_IVA_LABELS,
  CONDICIONES_IVA_PARA_A,
  CONDICIONES_IVA_PARA_BC,
  CONCEPTO,
  MONEDA,
  IVA_ID_TO_PERCENT,
  IVA_PERCENT_TO_ID,
  IVA_PERCENT_ALLOWED,
  IVA_ID_ALLOWED,
  isA,
  isB,
  isC,
  isNota,
  isNotaCredito,
  isNotaDebito,
  isFactura,
  isCbteTipo,
  isValidIvaInput,
  mapAlicuota,
  mapCbteTipoNota,
  letraComprobante,
  nombreComprobante,
  prefijoArchivo,
  isArcaEnv,
  ARCA_ENVIRONMENTS,
  DEFAULT_ARCA_SERVICE,
} from './domain/index.js'

// Schemas (para integradores que quieran validar manualmente)
export {
  EmitirComprobanteRequestSchema,
  ItemSchema,
  ComprobanteAsociadoSchema,
} from './domain/schemas.js'

// Helper: catch + log errors
export async function safeCall<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: ArcaError }> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    const arcaErr = wrapError(err)
    if (!(arcaErr instanceof ArcaError)) {
      throw arcaErr
    }
    return { ok: false, error: arcaErr }
  }
}

export function assertValidCuit(cuit: string | number): void {
  const clean = String(cuit).replace(/\D/g, '')
  if (clean.length !== 11) {
    throw new ValidationError(`CUIT inválido: debe tener 11 dígitos (recibido: ${clean.length})`)
  }
}
