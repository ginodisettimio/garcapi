import path from 'node:path'
import { loadConfig } from '../config/config.js'
import { OpenSslCmsSigner } from '../core/cms-signer.js'
import { AxiosSoapClient } from '../core/soap-client.js'
import { FileTaStorage } from '../core/storage.js'
import { WsaaClient } from '../core/wsaa.js'
import { WsfeClient } from '../core/wsfe.js'
import { isArcaEnv, isArcaService, type ArcaService } from '../domain/env.js'
import { ArcaError, ConfigError, WsfeError } from '../domain/errors.js'

/** Opciones comunes a todos los scripts: `-e/--env` y `-h/--help`. */
export const COMMON_OPTIONS = {
  env: { type: 'string', short: 'e' },
  help: { type: 'boolean', short: 'h' },
} as const

/** Ante `--help` imprime el uso y termina. */
export function exitIfHelp(help: boolean | undefined, usage: string): void {
  if (!help) return
  console.log(usage)
  process.exit(0)
}

/** Contexto de ejecución: config, entorno, paths a certs y clientes ARCA. */
export function cliContext(envArg?: string) {
  const config = loadConfig()
  const arcaEnv = envArg ?? config.arcaEnv
  if (!isArcaEnv(arcaEnv)) throw new ConfigError(`Entorno inválido: "${arcaEnv}" (homologacion | produccion)`)
  const envDir = path.join(config.certsDir, arcaEnv)
  const certPath = path.join(envDir, config.files.cert)
  const keyPath = path.join(envDir, config.files.key)
  const soap = new AxiosSoapClient()

  return {
    config,
    arcaEnv,
    envDir,
    certPath,
    keyPath,
    wsfe: new WsfeClient(soap, arcaEnv),
    /** `WsaaClient` del servicio; cada servicio cachea su TA en su propio archivo. */
    wsaa(service: string = config.arcaService): WsaaClient {
      const arcaService = toArcaService(service)
      const taFile = arcaService === config.arcaService ? config.files.ta : `TA_${arcaService}.xml`
      return new WsaaClient({
        arcaEnv,
        arcaService,
        storage: new FileTaStorage(config.taDir ?? config.certsDir, taFile),
        signer: new OpenSslCmsSigner({ verifyOnInit: true }),
        soap,
        certPath,
        keyPath,
      })
    },
  }
}

function toArcaService(service: string): ArcaService {
  if (!isArcaService(service)) throw new ConfigError(`Servicio inválido: "${service}"`)
  return service
}

/** CUIT desde `--cuit` o `ARCA_CUIT`. */
export function requireCuit(value?: string): string {
  const cuit = (value ?? process.env.ARCA_CUIT ?? '').replace(/\D/g, '')
  if (cuit.length !== 11) throw new ConfigError('Falta el CUIT: pasá --cuit o definí ARCA_CUIT (11 dígitos)')
  return cuit
}

/** Corre el script e imprime los errores de ARCA de forma legible (exit code 1). */
export function runCli(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    if (err instanceof ArcaError) {
      console.error(`Error [${err.code}]: ${err.message}`)
      if (err instanceof WsfeError && err.errores?.length) {
        for (const e of err.errores) console.error(`  ${e.Code}: ${e.Msg}`)
      }
      if (err.details) console.error(JSON.stringify(err.details, null, 2))
    } else {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
    process.exitCode = 1
  })
}

/** Imprime el resultado de FEDummy. Devuelve false si algún servidor no está OK. */
export function printDummy(r: { appServer: string; dbServer: string; authServer: string }): boolean {
  console.log(`  AppServer:  ${r.appServer}`)
  console.log(`  DbServer:   ${r.dbServer}`)
  console.log(`  AuthServer: ${r.authServer}`)
  return r.appServer === 'OK' && r.dbServer === 'OK' && r.authServer === 'OK'
}

/** Imprime los puntos de venta de FEParamGetPtosVenta. */
export function printPtosVenta(ptos: { nro: number; emisionTipo: string; bloqueado: boolean; fchBaja: string | null }[]): void {
  if (ptos.length === 0) {
    console.log('  Sin puntos de venta (602). En homologación es habitual aunque se pueda emitir.')
    return
  }
  for (const p of ptos) {
    const estado = p.bloqueado ? 'BLOQUEADO' : p.fchBaja ? `baja ${p.fchBaja}` : 'activo'
    console.log(`  ${String(p.nro).padStart(5, '0')}  ${p.emisionTipo}  (${estado})`)
  }
}

/** Resumen de un TA sin exponer token/sign completos. */
export function printTa(ta: { taPath: string; expiration?: Date; header?: Record<string, unknown>; token: string }): void {
  console.log(`  Archivo:  ${ta.taPath}`)
  console.log(`  Emitido:  ${String(ta.header?.generationTime ?? '?')}`)
  console.log(`  Vence:    ${ta.expiration?.toISOString() ?? '?'}`)
  console.log(`  Token:    ${ta.token.slice(0, 12)}…`)
}
