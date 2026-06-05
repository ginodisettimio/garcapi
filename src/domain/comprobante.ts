import { CBTE_TIPO, CBTE_TIPOS, type CbteTipo } from './constants.js'

/** Type guard: ¿es este número un CbteTipo válido? */
export function isCbteTipo(n: unknown): n is CbteTipo {
  return typeof n === 'number' && (CBTE_TIPOS as readonly number[]).includes(n)
}

/** Comprueba si el tipo de comprobante corresponde a Factura A (1) o sus ND/NC (2, 3). */
export function isA(cbteTipo: CbteTipo): boolean {
  return cbteTipo === CBTE_TIPO.FACTURA_A
    || cbteTipo === CBTE_TIPO.NOTA_DEBITO_A
    || cbteTipo === CBTE_TIPO.NOTA_CREDITO_A
}

/** Comprueba si el tipo de comprobante corresponde a Factura B (6) o sus ND/NC (7, 8). */
export function isB(cbteTipo: CbteTipo): boolean {
  return cbteTipo === CBTE_TIPO.FACTURA_B
    || cbteTipo === CBTE_TIPO.NOTA_DEBITO_B
    || cbteTipo === CBTE_TIPO.NOTA_CREDITO_B
}

/** Comprueba si el tipo de comprobante corresponde a Factura C (11) o sus ND/NC (12, 13). */
export function isC(cbteTipo: CbteTipo): boolean {
  return cbteTipo === CBTE_TIPO.FACTURA_C
    || cbteTipo === CBTE_TIPO.NOTA_DEBITO_C
    || cbteTipo === CBTE_TIPO.NOTA_CREDITO_C
}

/** Comprueba si es Nota (de Débito o Crédito). */
export function isNota(cbteTipo: CbteTipo): boolean {
  return isNotaCredito(cbteTipo) || isNotaDebito(cbteTipo)
}

/** Comprueba si es Nota de Crédito. */
export function isNotaCredito(cbteTipo: CbteTipo): boolean {
  return cbteTipo === CBTE_TIPO.NOTA_CREDITO_A
    || cbteTipo === CBTE_TIPO.NOTA_CREDITO_B
    || cbteTipo === CBTE_TIPO.NOTA_CREDITO_C
}

/** Comprueba si es Nota de Débito. */
export function isNotaDebito(cbteTipo: CbteTipo): boolean {
  return cbteTipo === CBTE_TIPO.NOTA_DEBITO_A
    || cbteTipo === CBTE_TIPO.NOTA_DEBITO_B
    || cbteTipo === CBTE_TIPO.NOTA_DEBITO_C
}

/** Comprueba si es Factura (no ND/NC). */
export function isFactura(cbteTipo: CbteTipo): boolean {
  return !isNota(cbteTipo)
}

/**
 * Dado un tipo de comprobante base (Factura), devuelve el tipo de
 * Nota (de Débito o Crédito) asociado. Devuelve `null` si el tipo
 * base no es una Factura A/B/C.
 */
export function mapCbteTipoNota(
  cbteTipoBase: CbteTipo,
  tipo: 'credito' | 'debito',
): CbteTipo | null {
  if (tipo === 'credito') {
    if (cbteTipoBase === CBTE_TIPO.FACTURA_A) return CBTE_TIPO.NOTA_CREDITO_A
    if (cbteTipoBase === CBTE_TIPO.FACTURA_B) return CBTE_TIPO.NOTA_CREDITO_B
    if (cbteTipoBase === CBTE_TIPO.FACTURA_C) return CBTE_TIPO.NOTA_CREDITO_C
  } else {
    if (cbteTipoBase === CBTE_TIPO.FACTURA_A) return CBTE_TIPO.NOTA_DEBITO_A
    if (cbteTipoBase === CBTE_TIPO.FACTURA_B) return CBTE_TIPO.NOTA_DEBITO_B
    if (cbteTipoBase === CBTE_TIPO.FACTURA_C) return CBTE_TIPO.NOTA_DEBITO_C
  }
  return null
}

/**
 * Devuelve la letra (A, B o C) correspondiente al tipo de comprobante.
 */
export function letraComprobante(cbteTipo: CbteTipo): 'A' | 'B' | 'C' {
  if (isA(cbteTipo)) return 'A'
  if (isB(cbteTipo)) return 'B'
  return 'C'
}

/**
 * Devuelve el nombre legible (ej. "Factura A", "Nota de Crédito B").
 */
export function nombreComprobante(cbteTipo: CbteTipo): string {
  if (isNotaCredito(cbteTipo)) return `Nota de Crédito ${letraComprobante(cbteTipo)}`
  if (isNotaDebito(cbteTipo)) return `Nota de Débito ${letraComprobante(cbteTipo)}`
  return `Factura ${letraComprobante(cbteTipo)}`
}

/**
 * Devuelve el prefijo usado en el nombre de archivo PDF.
 * - Factura → "F"
 * - Nota de Crédito → "F_NC"
 * - Nota de Débito → "F_ND"
 */
export function prefijoArchivo(cbteTipo: CbteTipo): 'F' | 'F_NC' | 'F_ND' {
  if (isNotaCredito(cbteTipo)) return 'F_NC'
  if (isNotaDebito(cbteTipo)) return 'F_ND'
  return 'F'
}
