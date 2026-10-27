import PQueue from 'p-queue'
import { CBTE_TIPOS } from '../domain/constants.js'
import type { ArcaEnv } from '../domain/env.js'
import { ArcaError, type AfipError } from '../domain/errors.js'
import type { Logger } from '../domain/logger.js'
import type { CaeaInfo, EmisorProvider } from '../domain/types.js'
import type { CaeaState, CaeaStore, ComprobanteCaeaPendiente } from '../core/caea-store.js'
import type { WsaaClient } from '../core/wsaa.js'
import { parseErrores, parseObservaciones, type FeDetalle, type WsfeClient } from '../core/wsfe.js'
import { tag } from '../core/xml.js'
import { nowYmdHms, todayYmd } from './date-utils.js'

/** ARCA permite pedir el CAEA desde 5 días corridos antes del inicio de la quincena. */
const DIAS_ANTICIPO_CAEA = 5

export interface ContingenciaServiceDeps {
  emisor: EmisorProvider
  wsaa: WsaaClient
  wsfe: WsfeClient
  store: CaeaStore
  arcaEnv: ArcaEnv
  /** Punto de venta de contingencia, dado de alta en ARCA como CAEA. */
  ptoVta: number
  logger?: Logger
}

/** Resultado de informar a ARCA lo emitido en contingencia. */
export interface InformeCaea {
  informados: string[]
  rechazados: { id: string; errores: AfipError[]; observaciones: string[] }[]
  sinMovimiento: string[]
}

/** Quincena (período + orden) a la que pertenece una fecha YYYYMMDD. */
export function quincenaDe(ymd: string): { periodo: number; orden: 1 | 2 } {
  return { periodo: Number(ymd.slice(0, 6)), orden: Number(ymd.slice(6, 8)) <= 15 ? 1 : 2 }
}

/** Quincena siguiente y su fecha de inicio (YYYYMMDD). */
export function siguienteQuincena(q: { periodo: number; orden: 1 | 2 }): { periodo: number; orden: 1 | 2; inicio: string } {
  if (q.orden === 1) return { periodo: q.periodo, orden: 2, inicio: `${q.periodo}16` }
  const y = Math.floor(q.periodo / 100)
  const m = q.periodo % 100
  const periodo = m === 12 ? (y + 1) * 100 + 1 : q.periodo + 1
  return { periodo, orden: 1, inicio: `${periodo}01` }
}

function restarDias(ymd: string, dias: number): string {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) - dias))
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

const numeroKey = (ptoVta: number, cbteTipo: number) => `${ptoVta}-${cbteTipo}`

/**
 * Contingencia con CAEA: cuando ARCA no responde, los comprobantes se autorizan
 * con el CAEA de la quincena (pedido de antemano) en un punto de venta propio,
 * se numeran localmente y se informan cuando ARCA vuelve (FECAEARegInformativo).
 */
export class ContingenciaService {
  /** Serializa los cambios al store (emisiones, informes, preparación). */
  private readonly queue = new PQueue({ concurrency: 1 })

  constructor(private readonly deps: ContingenciaServiceDeps) {}

  get ptoVta(): number {
    return this.deps.ptoVta
  }

  /**
   * Asegura el CAEA de la quincena actual y, si ya se puede pedir, el de la siguiente.
   * También sincroniza la numeración local con el último informado en ARCA.
   * Requiere ARCA disponible: llamarlo periódicamente (el server lo hace solo).
   */
  prepararCaea(now: Date = new Date()): Promise<CaeaInfo[]> {
    return this.queue.add(async () => {
      const { arcaEnv, store, wsfe, ptoVta, logger } = this.deps
      const auth = await this.auth()
      const hoy = todayYmd(now)
      const actual = quincenaDe(hoy)
      const sig = siguienteQuincena(actual)
      const objetivos = hoy >= restarDias(sig.inicio, DIAS_ANTICIPO_CAEA) ? [actual, sig] : [actual]

      const state = await store.read(arcaEnv)
      for (const q of objetivos) {
        if (state.caeas.some((c) => c.periodo === q.periodo && c.orden === q.orden)) continue
        let caea: CaeaInfo
        try {
          caea = await wsfe.fecaeaSolicitar(auth, q.periodo, q.orden)
        } catch (err) {
          // La siguiente es anticipada (ARCA puede rechazarla con 15006): no debe impedir guardar la actual
          if (q === actual) throw err
          logger?.warn({ event: 'arca.caea.siguiente_error', periodo: q.periodo, orden: q.orden, err: String(err) }, 'No se pudo pedir el CAEA de la quincena siguiente; se reintenta en el próximo ciclo')
          continue
        }
        state.caeas.push({ ...caea, usado: false, sinMovimientoInformado: false })
        logger?.info({ event: 'arca.caea.obtenido', ...caea }, 'CAEA obtenido')
      }
      await store.write(arcaEnv, state)

      for (const tipo of CBTE_TIPOS) {
        try {
          const ultimo = await wsfe.feCompUltimoAutorizado(auth, ptoVta, tipo)
          const key = numeroKey(ptoVta, tipo)
          state.numeros[key] = Math.max(state.numeros[key] ?? 0, ultimo)
        } catch (err) {
          logger?.warn({ event: 'arca.caea.sync_numero_error', ptoVta, cbteTipo: tipo, err: String(err) }, 'No se pudo sincronizar la numeración CAEA')
        }
      }
      await store.write(arcaEnv, state)
      return state.caeas.filter((c) => objetivos.some((q) => q.periodo === c.periodo && q.orden === c.orden))
    })
  }

  /**
   * Autoriza un comprobante con el CAEA vigente para su fecha, sin hablar con ARCA.
   * El pendiente queda persistido antes de devolver.
   */
  emitirConCaea(detalle: FeDetalle): Promise<{ caea: CaeaInfo; ptoVta: number; nro: number; cbteFchHsGen: string }> {
    return this.queue.add(async () => {
      const { arcaEnv, store, ptoVta, logger } = this.deps
      const state = await store.read(arcaEnv)
      const q = quincenaDe(detalle.fecha)
      const caea = state.caeas.find(
        (c) => c.periodo === q.periodo && c.orden === q.orden && detalle.fecha >= c.fchVigDesde && detalle.fecha <= c.fchVigHasta,
      )
      if (!caea) {
        throw new ArcaError(
          `ARCA no responde y no hay CAEA para la quincena ${q.periodo}/${q.orden}. Pedilo con prepararCaea() mientras ARCA esté disponible.`,
          'CAEA_NO_DISPONIBLE',
          { periodo: q.periodo, orden: q.orden },
        )
      }

      const key = numeroKey(ptoVta, detalle.cbteTipo)
      const nro = (state.numeros[key] ?? 0) + 1
      const cbteFchHsGen = nowYmdHms()
      const pendiente: ComprobanteCaeaPendiente = {
        id: `${key}-${nro}`,
        caea: caea.caea,
        ptoVta,
        cbteTipo: detalle.cbteTipo,
        nro,
        cbteFchHsGen,
        detalle,
        creado: new Date().toISOString(),
      }
      state.numeros[key] = nro
      state.pendientes.push(pendiente)
      caea.usado = true
      await store.write(arcaEnv, state)
      logger?.warn({ event: 'arca.caea.emitido', id: pendiente.id, caea: caea.caea }, 'Comprobante emitido en contingencia (CAEA)')
      return { caea, ptoVta, nro, cbteFchHsGen }
    })
  }

  /**
   * Informa a ARCA los comprobantes pendientes (en orden) y las quincenas vencidas sin uso.
   * Ante un rechazo deja de informar ese punto de venta/tipo, porque la numeración debe ser correlativa.
   */
  informarPendientes(now: Date = new Date()): Promise<InformeCaea> {
    return this.queue.add(async () => {
      const { arcaEnv, store, wsfe, ptoVta, logger } = this.deps
      const state = await store.read(arcaEnv)
      const informe: InformeCaea = { informados: [], rechazados: [], sinMovimiento: [] }
      const hoy = todayYmd(now)
      const necesitaArca =
        state.pendientes.length > 0 ||
        state.caeas.some((c) => !c.usado && !c.sinMovimientoInformado && hoy > c.fchVigHasta)
      if (!necesitaArca) return informe

      const auth = await this.auth()
      const bloqueados = new Set<string>()
      const ordenados = [...state.pendientes].sort((a, b) => a.ptoVta - b.ptoVta || a.cbteTipo - b.cbteTipo || a.nro - b.nro)
      for (const p of ordenados) {
        const key = numeroKey(p.ptoVta, p.cbteTipo)
        if (bloqueados.has(key)) continue
        const xml = await wsfe.fecaeaRegInformativo(auth, {
          ...p.detalle,
          ptoVta: p.ptoVta,
          cbteDesde: p.nro,
          cbteHasta: p.nro,
          caea: p.caea,
          cbteFchHsGen: p.cbteFchHsGen,
        })
        if (tag(xml, 'Resultado') === 'A' || (await this.yaInformado(auth, p))) {
          state.pendientes = state.pendientes.filter((x) => x.id !== p.id)
          await store.write(arcaEnv, state)
          informe.informados.push(p.id)
        } else {
          bloqueados.add(key)
          informe.rechazados.push({ id: p.id, errores: parseErrores(xml), observaciones: parseObservaciones(xml) })
        }
      }

      for (const c of state.caeas) {
        if (c.usado || c.sinMovimientoInformado || hoy <= c.fchVigHasta) continue
        const xml = await wsfe.fecaeaSinMovimientoInformar(auth, ptoVta, c.caea)
        if (tag(xml, 'Resultado') === 'A') {
          c.sinMovimientoInformado = true
          await store.write(arcaEnv, state)
          informe.sinMovimiento.push(c.caea)
        } else {
          logger?.warn(
            { event: 'arca.caea.sin_movimiento_error', caea: c.caea, errores: parseErrores(xml), observaciones: parseObservaciones(xml) },
            'ARCA rechazó informar el CAEA sin movimiento',
          )
        }
      }

      if (informe.rechazados.length > 0) {
        logger?.error({ event: 'arca.caea.rechazados', rechazados: informe.rechazados }, 'ARCA rechazó comprobantes emitidos con CAEA')
      }
      return informe
    })
  }

  /** `prepararCaea` + `informarPendientes`, sin lanzar: para correr periódicamente. */
  async mantenimiento(): Promise<void> {
    for (const [nombre, fn] of [
      ['informar', () => this.informarPendientes()],
      ['preparar', () => this.prepararCaea()],
    ] as const) {
      try {
        await fn()
      } catch (err) {
        this.deps.logger?.warn({ event: `arca.caea.${nombre}_error`, err: String(err) }, 'Mantenimiento CAEA falló; se reintenta en el próximo ciclo')
      }
    }
  }

  /** Estado actual: CAEAs guardados, numeración y pendientes. */
  estado(): Promise<CaeaState> {
    return this.deps.store.read(this.deps.arcaEnv)
  }

  /**
   * ¿ARCA ya tiene este comprobante con este CAEA? Pasa si el proceso se cortó entre que ARCA
   * aceptó el informe y se guardó el estado: el reintento se rechaza y el pendiente quedaría trabado.
   */
  private async yaInformado(auth: Awaited<ReturnType<ContingenciaService['auth']>>, p: ComprobanteCaeaPendiente): Promise<boolean> {
    try {
      const xml = await this.deps.wsfe.feCompConsultar(auth, p.ptoVta, p.cbteTipo, p.nro)
      return tag(xml, 'CodAutorizacion') === p.caea
    } catch {
      return false
    }
  }

  private async auth() {
    const emisor = await this.deps.emisor.getEmisor()
    return (await this.deps.wsaa.authenticate(emisor.cuit)).auth
  }
}

