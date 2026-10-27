import type { CbteTipo } from './constants.js'
import { isC } from './comprobante.js'
import type { Item } from './types.js'

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

/** Redondea a 2 decimales (centavos). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Importes de un comprobante tal como los espera FECAESolicitar. */
export interface ImportesComprobante {
  /** Neto gravado (suma de bases imponibles). Para C, es el total. */
  impNeto: number
  /** IVA total. Para C, 0. */
  impIva: number
  /** Importe total del comprobante. */
  impTotal: number
  /** Detalle de IVA agrupado por alícuota. Vacío para C. */
  alicuotas: { id: number; baseImp: number; importe: number }[]
}

/**
 * Calcula neto, IVA y total a partir de los ítems.
 *
 * - A y B: el precio unitario es neto; el IVA se discrimina y se
 *   agrupa por alícuota (la base de cada ítem se redondea a centavos).
 * - C: no se discrimina IVA; el neto es el total.
 */
export function calcularImportes(cbteTipo: CbteTipo, items: readonly Item[]): ImportesComprobante {
  const bases = items.map((it) => ({ base: round2(it.cantidad * it.precioUnitario), iva: it.iva }))
  const neto = round2(bases.reduce((acc, b) => acc + b.base, 0))

  if (isC(cbteTipo)) {
    return { impNeto: neto, impIva: 0, impTotal: neto, alicuotas: [] }
  }

  const porId = new Map<number, { pct: number; baseImp: number }>()
  for (const b of bases) {
    const { id, pct } = mapAlicuota(b.iva)
    const acc = porId.get(id) ?? { pct, baseImp: 0 }
    acc.baseImp = round2(acc.baseImp + b.base)
    porId.set(id, acc)
  }
  const alicuotas = Array.from(porId, ([id, a]) => ({
    id,
    baseImp: a.baseImp,
    importe: round2((a.baseImp * a.pct) / 100),
  }))
  const impIva = round2(alicuotas.reduce((acc, a) => acc + a.importe, 0))
  return { impNeto: neto, impIva, impTotal: round2(neto + impIva), alicuotas }
}
