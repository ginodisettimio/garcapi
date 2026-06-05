/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

/** Candidatos comunes a Chrome/Chromium instalados en el sistema. */
export const SYSTEM_CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
] as const

/** Argumentos para `puppeteer.launch` que minimizan el uso de memoria. */
export const DEFAULT_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--single-process',
  '--disable-extensions',
  '--disable-software-rasterizer',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-pages',
  '--disable-renderer-backgrounding',
] as const

export interface PuppeteerManagerOptions {
  /** Path explícito al binario de Chrome/Chromium. */
  executablePath?: string | null
  /** Concurrencia máxima al renderizar PDFs. Default 2. */
  concurrency?: number
  /** Cada cuántos usos se recicla el browser. Default 100. */
  maxUsos?: number
  /** Args adicionales a pasar a `puppeteer.launch`. */
  args?: readonly string[]
}

/**
 * Gestiona el ciclo de vida de una instancia de Puppeteer.
 * - Lanza un único browser y lo recicla después de N usos.
 * - Expone `withPage(fn)` para correr una función con una página y
 *   contabilizar tareas activas (no recicla si hay tareas en curso).
 * - Encola trabajos con `PQueue` para limitar concurrencia.
 */
export class PuppeteerManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_opts?: PuppeteerManagerOptions) {}

  async withPage<T>(_fn: (page: unknown) => Promise<T>): Promise<T> {
    void _fn
    throw new Error(PLACEHOLDER)
  }

  async close(): Promise<void> {
    throw new Error(PLACEHOLDER)
  }
}

/**
 * Carga HTML en la página forzando charset UTF-8.
 */
export async function setUtf8Content(_page: unknown, _html: string): Promise<void> {
  void _page
  void _html
  throw new Error(PLACEHOLDER)
}

/** Utilidad: resuelve una ruta absoluta, lanzando error si no existe. */
export function resolveTemplatePath(_templatePath: string, _label: string): string {
  void _templatePath
  void _label
  throw new Error(PLACEHOLDER)
}
