/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import type { ArcaEnv } from '../domain/env.js'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

/**
 * Contrato para persistir y recuperar el Ticket de Acceso (TA).
 * La implementación por defecto es en disco, pero se puede sustituir
 * por una en Redis, DB, S3, etc.
 */
export interface TaStorage {
  /** Lee el TA del entorno dado. Devuelve null si no existe. */
  read(env: ArcaEnv): Promise<string | null>
  /** Persiste el TA. */
  write(env: ArcaEnv, taXml: string): Promise<void>
  /** Devuelve el path donde está (o estaría) el TA. Solo a efectos informativos. */
  pathFor(env: ArcaEnv): string
}

/**
 * Implementación de `TaStorage` basada en archivos en disco.
 * La estructura esperada es: `<baseDir>/<env>/<taFile>`.
 */
export class FileTaStorage implements TaStorage {
  constructor(
    private readonly baseDir: string,
    private readonly taFile: string,
  ) {}

  pathFor(env: ArcaEnv): string {
    return `${this.baseDir}/${env}/${this.taFile}`
  }

  async read(_env: ArcaEnv): Promise<string | null> {
    throw new Error(PLACEHOLDER)
  }

  async write(_env: ArcaEnv, _taXml: string): Promise<void> {
    throw new Error(PLACEHOLDER)
  }
}

/**
 * Implementación de `TaStorage` en memoria. Útil para tests.
 */
export class MemoryTaStorage implements TaStorage {
  pathFor(env: ArcaEnv): string {
    return `<memory>/${env}/TA_wsfe.xml`
  }

  async read(_env: ArcaEnv): Promise<string | null> {
    throw new Error(PLACEHOLDER)
  }

  async write(_env: ArcaEnv, _taXml: string): Promise<void> {
    throw new Error(PLACEHOLDER)
  }
}
