import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CbteTipo } from '../domain/constants.js'
import type { ArcaEnv } from '../domain/env.js'
import { FileSystemError } from '../domain/errors.js'
import type { CaeaInfo } from '../domain/types.js'
import type { FeDetalle } from './wsfe.js'

/** Comprobante emitido con CAEA que falta informar a ARCA. */
export interface ComprobanteCaeaPendiente {
  /** `<ptoVta>-<cbteTipo>-<nro>` */
  id: string
  caea: string
  ptoVta: number
  cbteTipo: CbteTipo
  nro: number
  /** Fecha y hora de generación (YYYYMMDDHHMMSS). */
  cbteFchHsGen: string
  detalle: FeDetalle
  /** ISO 8601. */
  creado: string
}

/** Estado de la contingencia CAEA de un entorno. */
export interface CaeaState {
  caeas: (CaeaInfo & { usado: boolean; sinMovimientoInformado: boolean })[]
  /** Último número usado por `<ptoVta>-<cbteTipo>`. */
  numeros: Record<string, number>
  pendientes: ComprobanteCaeaPendiente[]
}

export function emptyCaeaState(): CaeaState {
  return { caeas: [], numeros: {}, pendientes: [] }
}

/**
 * Contrato para persistir el estado de la contingencia CAEA.
 * Contiene comprobantes fiscales sin informar: tiene que ser durable.
 */
export interface CaeaStore {
  read(env: ArcaEnv): Promise<CaeaState>
  write(env: ArcaEnv, state: CaeaState): Promise<void>
}

/**
 * `CaeaStore` en un archivo JSON (`<baseDir>/<env>/<file>`), con escritura atómica (tmp + rename).
 * shortcut: un solo proceso por archivo; con varias réplicas hace falta un store compartido (DB).
 */
export class FileCaeaStore implements CaeaStore {
  constructor(
    private readonly baseDir: string,
    private readonly file = 'caea.json',
  ) {}

  pathFor(env: ArcaEnv): string {
    return path.join(this.baseDir, env, this.file)
  }

  async read(env: ArcaEnv): Promise<CaeaState> {
    const file = this.pathFor(env)
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyCaeaState()
      throw new FileSystemError(`No se pudo leer el estado CAEA: ${file}`, 'CAEA_READ_ERROR', { err: String(err) })
    }
    try {
      return { ...emptyCaeaState(), ...(JSON.parse(raw) as Partial<CaeaState>) }
    } catch (err) {
      // No se descarta: puede tener comprobantes sin informar
      throw new FileSystemError(`Estado CAEA corrupto: ${file}`, 'CAEA_STATE_CORRUPTO', { err: String(err) })
    }
  }

  async write(env: ArcaEnv, state: CaeaState): Promise<void> {
    const file = this.pathFor(env)
    const tmp = `${file}.${process.pid}.tmp`
    try {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
      await rename(tmp, file)
    } catch (err) {
      throw new FileSystemError(`No se pudo escribir el estado CAEA: ${file}`, 'CAEA_WRITE_ERROR', { err: String(err) })
    }
  }
}

/** `CaeaStore` en memoria. Útil para tests. */
export class MemoryCaeaStore implements CaeaStore {
  private readonly data = new Map<ArcaEnv, string>()

  async read(env: ArcaEnv): Promise<CaeaState> {
    const raw = this.data.get(env)
    return raw ? (JSON.parse(raw) as CaeaState) : emptyCaeaState()
  }

  async write(env: ArcaEnv, state: CaeaState): Promise<void> {
    this.data.set(env, JSON.stringify(state))
  }
}
