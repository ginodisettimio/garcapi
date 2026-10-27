import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  CmsSignError,
  OpenSslNotFoundError,
  type ArcaError,
} from '../domain/errors.js'

const execFileAsync = promisify(execFile)

/**
 * Contrato para firmar el TRA (Ticket Request Access) en formato
 * CMS/PKCS#7. El resultado es un base64 DER.
 */
export interface CmsSigner {
  sign(traXml: string, certPath: string, keyPath: string): Promise<string>
}

/**
 * Detecta si el binario `openssl` está disponible en el sistema.
 * Devuelve la versión si está, o null si no.
 */
export async function detectOpenSsl(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('openssl', ['version'])
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Implementación por defecto de `CmsSigner` basada en el binario
 * `openssl` del sistema. Usa `cms -sign -outform DER -nodetach`
 * que es el método estándar probado con WSAA.
 */
export class OpenSslCmsSigner implements CmsSigner {
  private readonly verifyOnInit: boolean
  private verified = false

  constructor(opts: { verifyOnInit?: boolean } = {}) {
    this.verifyOnInit = opts.verifyOnInit ?? false
  }

  async sign(traXml: string, certPath: string, keyPath: string): Promise<string> {
    if (this.verifyOnInit && !this.verified) {
      if (!(await detectOpenSsl())) throw new OpenSslNotFoundError()
      this.verified = true
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'arca-tra-'))
    try {
      const traPath = path.join(dir, 'tra.xml')
      await writeFile(traPath, traXml, 'utf8')
      const { stdout } = await execFileAsync(
        'openssl',
        ['cms', '-sign', '-in', traPath, '-signer', certPath, '-inkey', keyPath, '-nodetach', '-outform', 'DER'],
        { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
      )
      return stdout.toString('base64')
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: Buffer }
      if (e.code === 'ENOENT') throw new OpenSslNotFoundError()
      throw new CmsSignError('No se pudo firmar el TRA con OpenSSL', {
        certPath,
        keyPath,
        stderr: e.stderr?.toString().trim() ?? String(err),
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

// Re-exports preservados para que las firmas importen igual que en la versión completa
export { CmsSignError, OpenSslNotFoundError, type ArcaError }
