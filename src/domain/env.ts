/**
 * Entorno ARCA. Es independiente de NODE_ENV.
 * - 'homologacion': para testing (no tiene validez fiscal)
 * - 'produccion': para facturación real
 */
export type ArcaEnv = 'homologacion' | 'produccion'

export const ARCA_ENVIRONMENTS: readonly ArcaEnv[] = ['homologacion', 'produccion'] as const

export function isArcaEnv(value: unknown): value is ArcaEnv {
  return value === 'homologacion' || value === 'produccion'
}

/**
 * Servicio ARCA para autenticación (WSAA).
 * - 'wsfe': Web Service de Factura Electrónica (FACTURA A/B/C, NC, ND)
 * - 'wsmtxca': Web Service de Tique (no usado actualmente)
 * - 'wsfev1': alias de 'wsfe' (algunos lo usan así)
 */
export type ArcaService = 'wsfe' | 'wsfev1' | 'wsmtxca'

export const DEFAULT_ARCA_SERVICE: ArcaService = 'wsfe'
