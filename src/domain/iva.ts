/**
 * IDs y porcentajes de alícuotas de IVA según ARCA.
 * - 0%   → Id 3
 * - 2.5% → Id 9
 * - 5%   → Id 8
 * - 10.5%→ Id 4
 * - 21%  → Id 5
 * - 27%  → Id 6
 * @see FEParamGetTiposIva
 */
export const IVA_ID_TO_PERCENT: Record<number, number> = {
  3: 0,
  4: 10.5,
  5: 21,
  6: 27,
  8: 5,
  9: 2.5,
}

export const IVA_PERCENT_TO_ID: Record<number, number> = {
  0: 3,
  2.5: 9,
  5: 8,
  10.5: 4,
  21: 5,
  27: 6,
}

/** Alícuotas de IVA admitidas en los items (en porcentaje). */
export const IVA_PERCENT_ALLOWED: readonly number[] = [0, 2.5, 5, 10.5, 21, 27]

/** IDs de IVA admitidos en los items. */
export const IVA_ID_ALLOWED: readonly number[] = [3, 4, 5, 6, 8, 9]

/**
 * Resuelve el {id, pct} de AFIP a partir de un valor que puede ser
 * tanto un porcentaje (21, 10.5, ...) como un ID (5, 4, ...).
 *
 * Si el valor es un ID conocido, se usa ese. Si no, se interpreta
 * como porcentaje. Si no matchea ninguno, devuelve 0% / Id 3.
 *
 * Ej: 5 → {id: 5, pct: 21} (id 5 = 21% en AFIP)
 *     21 → {id: 5, pct: 21}
 *     8 → {id: 8, pct: 5}   (id 8 = 5% en AFIP)
 *     5.5 → {id: 3, pct: 0}  (no existe)
 */
export function mapAlicuota(iva: number): { id: number; pct: number } {
  // Primero IDs (son más "canónicos" en errores de AFIP)
  if (Object.prototype.hasOwnProperty.call(IVA_ID_TO_PERCENT, iva)) {
    return { id: iva, pct: IVA_ID_TO_PERCENT[iva]! }
  }
  // Luego porcentajes
  if (Object.prototype.hasOwnProperty.call(IVA_PERCENT_TO_ID, iva)) {
    return { id: IVA_PERCENT_TO_ID[iva]!, pct: iva }
  }
  return { id: 3, pct: 0 }
}

/** Comprueba si un valor de IVA es admisible (porcentaje o ID). */
export function isValidIvaInput(value: number): boolean {
  return IVA_PERCENT_ALLOWED.includes(value) || IVA_ID_ALLOWED.includes(value)
}
