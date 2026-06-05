/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */
import {
  CmsSignError,
  OpenSslNotFoundError,
  type ArcaError,
} from '../domain/errors.js'

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

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
  throw new Error(PLACEHOLDER)
}

/**
 * Implementación por defecto de `CmsSigner` basada en el binario
 * `openssl` del sistema. Usa `smime -sign -outform DER -nodetach`
 * que es el método estándar probado con WSAA.
 */
export class OpenSslCmsSigner implements CmsSigner {
  constructor(_opts: { verifyOnInit?: boolean } = {}) {
    void _opts
  }

  async sign(_traXml: string, _certPath: string, _keyPath: string): Promise<string> {
    throw new Error(PLACEHOLDER)
  }
}

// Re-exports preservados para que las firmas importen igual que en la versión completa
export { CmsSignError, OpenSslNotFoundError, type ArcaError }
