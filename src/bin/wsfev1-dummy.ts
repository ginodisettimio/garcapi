#!/usr/bin/env node
/**
 * FEDummy: verifica la conectividad con WSFEv1 (no requiere certs ni TA).
 *
 * Uso:
 *   tsx src/bin/wsfev1-dummy.ts [-e <env>]
 */
import { parseArgs } from 'node:util'
import { COMMON_OPTIONS, exitIfHelp, cliContext, printDummy, runCli } from './common.js'

const USAGE = 'Uso: wsfev1-dummy [-e homologacion|produccion]'

runCli(async () => {
  const { values } = parseArgs({ options: COMMON_OPTIONS, allowPositionals: true })
  exitIfHelp(values.help, USAGE)
  const ctx = cliContext(values.env)
  console.log(`FEDummy (${ctx.arcaEnv})`)
  if (!printDummy(await ctx.wsfe.feDummy())) process.exitCode = 1
})
