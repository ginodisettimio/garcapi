#!/usr/bin/env node
/**
 * Contingencia CAEA.
 *
 * Uso:
 *   tsx src/bin/caea.ts preparar   Pide el CAEA de la quincena (y de la siguiente si ya se puede)
 *   tsx src/bin/caea.ts informar   Informa a ARCA lo emitido con CAEA y las quincenas sin movimiento
 *   tsx src/bin/caea.ts estado     Muestra CAEAs, numeración y pendientes
 *   [-e <env>] [--cuit <cuit>] [-p <ptoVta CAEA>]   Default: ARCA_CUIT, ARCA_CAEA_PTO_VTA
 *
 * Con el server corriendo y ARCA_CAEA_PTO_VTA definido esto ya se hace solo cada 30 min;
 * no correr `informar` en paralelo con el server sobre el mismo archivo.
 */
import { parseArgs } from 'node:util'
import { FileCaeaStore } from '../core/caea-store.js'
import { ConfigError } from '../domain/errors.js'
import { StaticEmisorProvider } from '../domain/types.js'
import { ContingenciaService } from '../services/contingencia-service.js'
import { COMMON_OPTIONS, cliContext, exitIfHelp, requireCuit, runCli } from './common.js'

const USAGE = 'Uso: caea <preparar|informar|estado> [-e homologacion|produccion] [--cuit <cuit>] [-p <ptoVta CAEA>]'

runCli(async () => {
  const { values, positionals } = parseArgs({
    options: { ...COMMON_OPTIONS, cuit: { type: 'string' }, 'pto-vta': { type: 'string', short: 'p' } },
    allowPositionals: true,
  })
  exitIfHelp(values.help, USAGE)
  const comando = positionals[0]
  if (comando !== 'preparar' && comando !== 'informar' && comando !== 'estado') throw new ConfigError(USAGE)

  const ctx = cliContext(values.env)
  const ptoVta = Number(values['pto-vta'] ?? ctx.config.contingencia.ptoVta ?? NaN)
  if (!Number.isInteger(ptoVta) || ptoVta <= 0) throw new ConfigError('Falta el punto de venta CAEA: pasá -p o definí ARCA_CAEA_PTO_VTA')
  const store = new FileCaeaStore(ctx.config.taDir ?? ctx.config.certsDir)
  const contingencia = new ContingenciaService({
    emisor: new StaticEmisorProvider({
      cuit: Number(comando === 'estado' ? 0 : requireCuit(values.cuit)),
      razonSocial: '',
      domicilio: '',
      condicionIva: '',
      inicioActividades: '',
      ingresosBrutos: '',
      ptoVtaDefault: ptoVta,
    }),
    wsaa: ctx.wsaa(),
    wsfe: ctx.wsfe,
    store,
    arcaEnv: ctx.arcaEnv,
    ptoVta,
  })

  if (comando === 'preparar') {
    for (const c of await contingencia.prepararCaea()) {
      console.log(`CAEA ${c.caea}  ${c.periodo}/${c.orden}  vigente ${c.fchVigDesde}–${c.fchVigHasta}  informar hasta ${c.fchTopeInf}`)
    }
  } else if (comando === 'informar') {
    const r = await contingencia.informarPendientes()
    console.log(`Informados: ${r.informados.length}  Rechazados: ${r.rechazados.length}  Sin movimiento: ${r.sinMovimiento.length}`)
    for (const x of r.rechazados) {
      console.log(`  ✗ ${x.id}`)
      for (const e of x.errores) console.log(`      ${e.Code}: ${e.Msg}`)
      for (const o of x.observaciones) console.log(`      ${o}`)
    }
    if (r.rechazados.length > 0) process.exitCode = 1
  } else {
    const s = await contingencia.estado()
    console.log(`Estado CAEA (${ctx.arcaEnv}, pto. vta. ${ptoVta}) — ${store.pathFor(ctx.arcaEnv)}`)
    for (const c of s.caeas) {
      const uso = c.usado ? 'usado' : c.sinMovimientoInformado ? 'sin movimiento informado' : 'sin usar'
      console.log(`  CAEA ${c.caea}  ${c.periodo}/${c.orden}  ${c.fchVigDesde}–${c.fchVigHasta}  (${uso})`)
    }
    console.log(`  Pendientes de informar: ${s.pendientes.length}`)
    for (const p of s.pendientes) console.log(`    ${p.id}  ${p.creado}`)
  }
})
