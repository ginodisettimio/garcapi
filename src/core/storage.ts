import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ArcaEnv } from '../domain/env.js'
import { FileSystemError } from '../domain/errors.js'

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

  async read(env: ArcaEnv): Promise<string | null> {
    const file = this.pathFor(env)
    try {
      return await readFile(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new FileSystemError(`No se pudo leer el TA: ${file}`, 'TA_READ_ERROR', { err: String(err) })
    }
  }

  async write(env: ArcaEnv, taXml: string): Promise<void> {
    const file = this.pathFor(env)
    try {
      await mkdir(path.dirname(file), { recursive: true })
      // 0o600: el TA es una credencial
      await writeFile(file, taXml, { encoding: 'utf8', mode: 0o600 })
    } catch (err) {
      throw new FileSystemError(`No se pudo escribir el TA: ${file}`, 'TA_WRITE_ERROR', { err: String(err) })
    }
  }
}

/**
 * Implementación de `TaStorage` en memoria. Útil para tests.
 */
export class MemoryTaStorage implements TaStorage {
  private readonly data = new Map<ArcaEnv, string>()

  pathFor(env: ArcaEnv): string {
    return `<memory>/${env}/TA_wsfe.xml`
  }

  async read(env: ArcaEnv): Promise<string | null> {
    return this.data.get(env) ?? null
  }

  async write(env: ArcaEnv, taXml: string): Promise<void> {
    this.data.set(env, taXml)
  }
}
