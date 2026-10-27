#!/usr/bin/env node
/**
 * Chequeo de punta a punta: FEDummy → TA (TRA→CMS→loginCms si hace falta)
 * → FEParamGetPtosVenta → FECompUltimoAutorizado. No emite comprobantes.
 *
 * Uso:
 *   tsx src/bin/pipeline.ts [-e <env>] [--cuit <cuit>] [-p <ptoVta>] [-t <cbteTipo>]
 *   Default: CUIT de ARCA_CUIT, ptoVta ARCA_PTO_VTA_DEFAULT o 1, cbteTipo 6 (Factura B)
 */
import { parseArgs } from 'node:util'
import { isCbteTipo } from '../domain/comprobante.js'
import { CBTE_TIPO_NOMBRES } from '../domain/constants.js'
import { ConfigError } from '../domain/errors.js'
import { COMMON_OPTIONS, exitIfHelp, cliContext, printDummy, printPtosVenta, printTa, requireCuit, runCli } from './common.js'

const USAGE = 'Uso: pipeline [-e homologacion|produccion] [--cuit <cuit>] [-p <ptoVta>] [-t <cbteTipo>]'

runCli(async () => {
  const { values } = parseArgs({
    options: {
      ...COMMON_OPTIONS,
      cuit: { type: 'string' },
      'pto-vta': { type: 'string', short: 'p' },
      tipo: { type: 'string', short: 't' },
    },
    allowPositionals: true,
  })
  exitIfHelp(values.help, USAGE)
  const ctx = cliContext(values.env)
  const cuit = requireCuit(values.cuit)
  const ptoVta = Number(values['pto-vta'] ?? process.env.ARCA_PTO_VTA_DEFAULT ?? 1)
  const cbteTipo = Number(values.tipo ?? 6)
  if (!isCbteTipo(cbteTipo)) throw new ConfigError(`Tipo de comprobante inválido: ${values.tipo}`)

  console.log(`Pipeline ARCA (${ctx.arcaEnv}, CUIT ${cuit})`)

  console.log('\n[1/4] FEDummy')
  if (!printDummy(await ctx.wsfe.feDummy())) throw new ConfigError('WSFEv1 no está operativo')

  console.log('\n[2/4] Ticket de Acceso (WSAA)')
  const { ta, auth } = await ctx.wsaa().authenticate(cuit)
  printTa(ta)

  console.log('\n[3/4] FEParamGetPtosVenta')
  printPtosVenta(await ctx.wsfe.feParamGetPtosVenta(auth))

  console.log(`\n[4/4] FECompUltimoAutorizado (${CBTE_TIPO_NOMBRES[cbteTipo]}, pto. vta. ${ptoVta})`)
  console.log(`  Último autorizado: ${await ctx.wsfe.feCompUltimoAutorizado(auth, ptoVta, cbteTipo)}`)

  console.log('\nOK')
})
