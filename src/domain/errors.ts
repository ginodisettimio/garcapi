/**
 * Jerarquía de errores del módulo. Todos extienden `ArcaError`
 * que a su vez extiende `Error`, así que se pueden catchear con
 * `instanceof ArcaError` para tener un handler uniforme.
 *
 * Cada error tiene un `code` corto en MAYÚSCULAS_SNAKE_CASE que
 * sirve como identificador estable (no debe cambiar entre versiones).
 */

/** Error base del módulo Arca-api-Tordini. */
export class ArcaError extends Error {
  /** Código de error estable, útil para logs y para mapear a HTTP. */
  public readonly code: string
  /** Detalles adicionales. */
  public readonly details?: Record<string, unknown>

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.details = details
    // Mantiene el prototype chain correcto en targets ES5 transpilados
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Errores de autenticación contra WSAA. */
export class WsaaError extends ArcaError {
  constructor(message: string, code: string | { code?: string; details?: Record<string, unknown> } = 'WSAA_ERROR', details?: Record<string, unknown>) {
    if (typeof code === 'string') {
      super(message, code, details)
    } else {
      super(message, code.code ?? 'WSAA_ERROR', { ...(code.details ?? {}), ...(details ?? {}) })
    }
  }
}

/** El TA cacheado en disco no es válido. */
export class TaInvalidoError extends WsaaError {
  constructor(details?: Record<string, unknown>) {
    super('Ticket de Acceso (TA) inválido o expirado', 'TA_INVALIDO', details)
  }
}

/** Fallo al firmar el TRA con CMS/PKCS#7. */
export class CmsSignError extends WsaaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CMS_SIGN_ERROR', details)
  }
}

/** OpenSSL no está disponible en el sistema. */
export class OpenSslNotFoundError extends CmsSignError {
  constructor(details?: Record<string, unknown>) {
    super(
      'No se encontró el binario `openssl` en el sistema. Instalalo o configurá `ARCA_PUPPETEER_EXECUTABLE_PATH` con la ruta. Ver README.',
      { code: 'OPENSSL_NOT_FOUND', ...(details ?? {}) },
    )
  }
}

/** Errores de la API de WSFEv1. */
export class WsfeError extends ArcaError {
  /** Fault code devuelto por ARCA (ej. "soap:Client"). */
  public readonly faultcode?: string
  /** Fault string devuelto por ARCA. */
  public readonly faultstring?: string
  /** Errores específicos de ARCA (cada uno con Code y Msg). */
  public readonly errores?: AfipError[]
  /** Observaciones devueltas por ARCA. */
  public readonly observaciones?: string[]

  constructor(
    message: string,
    options: {
      code?: string
      faultcode?: string
      faultstring?: string
      errores?: AfipError[]
      observaciones?: string[]
      details?: Record<string, unknown>
    } = {},
  ) {
    super(message, options.code ?? 'WSFE_ERROR', options.details)
    this.faultcode = options.faultcode
    this.faultstring = options.faultstring
    this.errores = options.errores
    this.observaciones = options.observaciones
  }
}

/** ARCA rechazó el comprobante (CAE con error). */
export class ComprobanteRechazadoError extends WsfeError {
  constructor(
    public readonly cae?: string,
    public readonly caeFchVto?: string,
    errores?: AfipError[],
    observaciones?: string[],
  ) {
    super('El comprobante fue rechazado por ARCA', {
      code: 'COMPROBANTE_RECHAZADO',
      errores,
      observaciones,
    })
  }
}

/** Errores de validación de input. */
export class ValidationError extends ArcaError {
  public readonly issues?: { path: (string | number)[]; message: string }[]

  constructor(message: string, issues?: { path: (string | number)[]; message: string }[]) {
    super(message, 'VALIDATION_ERROR', { issues })
    this.issues = issues
  }
}

/** Errores de configuración (env vars faltantes, paths inválidos, etc). */
export class ConfigError extends ArcaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details)
  }
}

/** Errores de generación de PDF. */
export class PdfError extends ArcaError {
  constructor(message: string, code = 'PDF_ERROR', details?: Record<string, unknown>) {
    super(message, code, details)
  }
}

/** Errores al leer/escribir archivos en disco. */
export class FileSystemError extends ArcaError {
  constructor(message: string, code = 'FS_ERROR', details?: Record<string, unknown>) {
    super(message, code, details)
  }
}

/** Error genérico de red/HTTP al consumir servicios ARCA. */
export class NetworkError extends ArcaError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', details)
  }
}

/**
 * Error individual devuelto por ARCA dentro de la respuesta SOAP.
 * Cada FECAESolicitar puede devolver varios de estos.
 */
export interface AfipError {
  Code: number
  Msg: string
}

/**
 * Helper para envolver un error desconocido en un ArcaError.
 * Si ya es ArcaError, lo devuelve tal cual. Si no, lo envuelve
 * preservando el mensaje y stack originales.
 */
export function wrapError(err: unknown, fallbackCode = 'UNKNOWN_ERROR'): ArcaError {
  if (err instanceof ArcaError) return err
  if (err instanceof Error) {
    return new ArcaError(err.message, fallbackCode, { originalName: err.name })
  }
  return new ArcaError(String(err), fallbackCode)
}
