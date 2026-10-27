#!/usr/bin/env node
/**
 * FEParamGetPtosVenta: lista los puntos de venta habilitados para el CUIT.
 *
 * Uso:
 *   tsx src/bin/wsfev1-params.ts [-e <env>] [--cuit <cuit>]
 *   Default CUIT: ARCA_CUIT
 */
import { parseArgs } from 'node:util'
import { COMMON_OPTIONS, exitIfHelp, cliContext, printPtosVenta, requireCuit, runCli } from './common.js'

const USAGE = 'Uso: wsfev1-params [-e homologacion|produccion] [--cuit <cuit>]'

runCli(async () => {
  const { values } = parseArgs({ options: { ...COMMON_OPTIONS, cuit: { type: 'string' } }, allowPositionals: true })
  exitIfHelp(values.help, USAGE)
  const ctx = cliContext(values.env)
  const { auth } = await ctx.wsaa().authenticate(requireCuit(values.cuit))
  console.log(`FEParamGetPtosVenta (${ctx.arcaEnv}, CUIT ${auth.cuit})`)
  printPtosVenta(await ctx.wsfe.feParamGetPtosVenta(auth))
})
