#!/usr/bin/env node
/**
 * Genera el TRA (Ticket Request Access) para WSAA.
 *
 * Uso:
 *   tsx src/bin/generate-tra.ts [-e <env>] [-s <servicio>] [-o <archivo>]
 *   Default: servicio ARCA_SERVICE, salida certs/<env>/tra.xml
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { COMMON_OPTIONS, exitIfHelp, cliContext, runCli } from './common.js'

const USAGE = 'Uso: generate-tra [-e homologacion|produccion] [-s <servicio>] [-o <archivo>]'

runCli(async () => {
  const { values } = parseArgs({
    options: {
      ...COMMON_OPTIONS,
      service: { type: 'string', short: 's' },
      out: { type: 'string', short: 'o' },
    },
    allowPositionals: true,
  })
  exitIfHelp(values.help, USAGE)
  const ctx = cliContext(values.env)
  const service = values.service ?? ctx.config.arcaService
  const out = values.out ?? path.join(ctx.envDir, ctx.config.files.tra)
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(out, ctx.wsaa(service).buildTra(service), 'utf8')
  console.log(`TRA para "${service}" (${ctx.arcaEnv}) guardado en ${out}`)
})
