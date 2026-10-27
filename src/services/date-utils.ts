/**
 * Helpers de fechas en el formato que usa ARCA (YYYYMMDD).
 */

/** Zona horaria de ARCA: la fecha del comprobante es la de Argentina, no la del server. */
const AR_TZ = 'America/Argentina/Buenos_Aires'

/** Devuelve la fecha actual (hora de Argentina) en formato YYYYMMDD. */
export function todayYmd(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(now).replace(/-/g, '')
}

/** Formatea un Date a YYYYMMDD (componentes locales). */
export function formatYmd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}${mm}${dd}`
}

/** Parsea YYYYMMDD a Date. Devuelve null si el formato o la fecha son inválidos. */
export function parseYmd(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(4, 6)) - 1
  const d = Number(s.slice(6, 8))
  const date = new Date(y, m, d)
  // Rechaza fechas inexistentes (ej. 20240231) que Date "desborda" al mes siguiente
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null
  return date
}

/** Formatea YYYYMMDD a DD/MM/YYYY. */
export function ymdToDmy(s: string): string {
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`
}

/** Formatea YYYYMMDD a YYYY-MM-DD. */
export function ymdToIso(s: string): string {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
