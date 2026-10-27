#!/usr/bin/env node
/**
 * Login completo contra WSAA (genera TRA + firma + loginCms) y cachea el TA.
 * Si ya hay un TA vigente lo reutiliza: WSAA rechaza un login nuevo mientras exista.
 *
 * Uso:
 *   tsx src/bin/submit-login.ts [-e <env>] [-s <servicio>] [--force]
 */
import { parseArgs } from 'node:util'
import { COMMON_OPTIONS, exitIfHelp, cliContext, printTa, runCli } from './common.js'

const USAGE = 'Uso: submit-login [-e homologacion|produccion] [-s <servicio>] [-f|--force]'

runCli(async () => {
  const { values } = parseArgs({
    options: {
      ...COMMON_OPTIONS,
      service: { type: 'string', short: 's' },
      force: { type: 'boolean', short: 'f' },
    },
    allowPositionals: true,
  })
  exitIfHelp(values.help, USAGE)
  const ctx = cliContext(values.env)
  const service = values.service ?? ctx.config.arcaService
  const ta = await ctx.wsaa(service).getCachedTA({ forceRefresh: values.force })
  console.log(`TA vigente para "${service}" (${ctx.arcaEnv})`)
  printTa(ta)
})
