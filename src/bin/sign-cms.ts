#!/usr/bin/env node
/**
 * Firma un TRA con CMS/PKCS#7 usando OpenSSL.
 *
 * Uso:
 *   tsx src/bin/sign-cms.ts [tra.xml] [salida] [--cert <crt>] [--key <key>] [-e <env>]
 *   Default: certs/<env>/tra.xml → certs/<env>/cms.der
 *   Si la salida termina en .der se escribe binario; si no, base64.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { OpenSslCmsSigner } from '../core/cms-signer.js'
import { COMMON_OPTIONS, exitIfHelp, cliContext, runCli } from './common.js'

const USAGE = 'Uso: sign-cms [tra.xml] [salida.der|salida.b64] [--cert <crt>] [--key <key>] [-e homologacion|produccion]'

runCli(async () => {
  const { values, positionals } = parseArgs({
    options: {
      ...COMMON_OPTIONS,
      cert: { type: 'string' },
      key: { type: 'string' },
    },
    allowPositionals: true,
  })
  exitIfHelp(values.help, USAGE)
  const ctx = cliContext(values.env)
  const traPath = positionals[0] ?? path.join(ctx.envDir, ctx.config.files.tra)
  const outPath = positionals[1] ?? path.join(ctx.envDir, ctx.config.files.cms)
  const cms = await new OpenSslCmsSigner({ verifyOnInit: true }).sign(
    await readFile(traPath, 'utf8'),
    values.cert ?? ctx.certPath,
    values.key ?? ctx.keyPath,
  )
  const der = outPath.endsWith('.der')
  await writeFile(outPath, der ? Buffer.from(cms, 'base64') : cms)
  console.log(`CMS firmado guardado en ${outPath} (${der ? 'DER' : 'base64'})`)
})
