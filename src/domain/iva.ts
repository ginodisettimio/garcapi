import type { CbteTipo } from './constants.js'
import { isC } from './comprobante.js'
import { ValidationError } from './errors.js'
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
 * Resuelve el {id, pct} de AFIP a partir del porcentaje de IVA del ítem.
 * El valor se interpreta SIEMPRE como porcentaje: `5` es 5 % (Id 8), no el Id 5 (21 %).
 *
 * @throws ValidationError si el porcentaje no es una alícuota admitida.
 */
export function mapAlicuota(pct: number): { id: number; pct: number } {
  if (!Object.prototype.hasOwnProperty.call(IVA_PERCENT_TO_ID, pct)) {
    throw new ValidationError(`Alícuota de IVA inválida: ${pct}. Valores admitidos: ${IVA_PERCENT_ALLOWED.join(', ')}`)
  }
  return { id: IVA_PERCENT_TO_ID[pct]!, pct }
}

/** Comprueba si un porcentaje de IVA es una alícuota admitida. */
export function isValidIvaInput(pct: number): boolean {
  return IVA_PERCENT_ALLOWED.includes(pct)
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
