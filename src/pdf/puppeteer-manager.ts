import { existsSync } from 'node:fs'
import path from 'node:path'
import PQueue from 'p-queue'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { PdfError } from '../domain/errors.js'

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
 * Resuelve el binario de Chrome: el explícito, o (si no hay
 * `PUPPETEER_EXECUTABLE_PATH`) el primero instalado en el sistema.
 * `undefined` deja que puppeteer use su env var o su Chrome descargado.
 */
function resolveExecutablePath(explicit?: string | null): string | undefined {
  if (explicit) return explicit
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return undefined
  return SYSTEM_CHROME_CANDIDATES.find((p) => existsSync(p))
}

/**
 * Gestiona el ciclo de vida de una instancia de Puppeteer.
 * - Lanza un único browser (lazy, en el primer uso) y lo recicla después de N usos.
 * - Expone `withPage(fn)` para correr una función con una página y
 *   contabilizar tareas activas (no recicla si hay tareas en curso).
 * - Encola trabajos con `PQueue` para limitar concurrencia.
 */
export class PuppeteerManager {
  private readonly queue: PQueue
  private readonly maxUsos: number
  private browser: Promise<Browser> | null = null
  private usos = 0
  private activas = 0

  constructor(private readonly opts: PuppeteerManagerOptions = {}) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 2 })
    this.maxUsos = opts.maxUsos ?? 100
  }

  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    return this.queue.add(async () => {
      const browser = await this.getBrowser()
      this.activas++
      let page: Page | undefined
      try {
        page = await browser.newPage()
        return await fn(page)
      } finally {
        await page?.close().catch(() => undefined)
        this.activas--
        this.usos++
        if (this.usos >= this.maxUsos && this.activas === 0) await this.close()
      }
    })
  }

  async close(): Promise<void> {
    const pending = this.browser
    this.browser = null
    this.usos = 0
    const browser = await pending?.catch(() => null)
    await browser?.close()
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = puppeteer
        .launch({
          headless: true,
          executablePath: resolveExecutablePath(this.opts.executablePath),
          args: [...DEFAULT_BROWSER_ARGS, ...(this.opts.args ?? [])],
        })
        .then((browser) => {
          browser.on('disconnected', () => {
            this.browser = null
          })
          return browser
        })
        .catch((err: unknown) => {
          this.browser = null
          throw new PdfError(`No se pudo iniciar Chrome: ${String(err)}`, 'BROWSER_LAUNCH_ERROR')
        })
    }
    return this.browser
  }
}

/**
 * Carga HTML en la página forzando charset UTF-8.
 */
export async function setUtf8Content(page: Page, html: string): Promise<void> {
  const withCharset = /<meta[^>]+charset/i.test(html) ? html : `<meta charset="utf-8">${html}`
  await page.setContent(withCharset, { waitUntil: 'load' })
}

/** Utilidad: resuelve una ruta absoluta, lanzando error si no existe. */
export function resolveTemplatePath(templatePath: string, label: string): string {
  const abs = path.resolve(templatePath)
  if (!existsSync(abs)) {
    throw new PdfError(`No existe el template de ${label}: ${abs}`, 'TEMPLATE_NOT_FOUND', { path: abs })
  }
  return abs
}
