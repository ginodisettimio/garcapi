# Arca-api-Tordini

> 🇦🇷 Cliente TypeScript para facturación electrónica con **ARCA/AFIP Argentina** — WSAA + WSFEv1, PDFs con QR AFIP, sin hardcodeos.

`createArca()` te da, en una sola llamada, todo el stack listo para emitir facturas electrónicas: autenticación automática con ARCA (con renovación y caché del TA), cliente SOAP tipado, generación de PDFs con código QR AFIP, validación con Zod, y errores tipados.

Pensado para embeber en cualquier backend Node.js ≥ 20, sin acoplarte a ningún framework.

---

## ✨ Características

- **Cero hardcodeos**: rutas, CUIT, razón social, IVA, todo configurable por env o inyección.
- **Inyección de dependencias**: podés reemplazar CMS signer, SOAP client, TA storage, emisor provider, servicio de CUIT.
- **Validación con Zod**: requests validados con reglas de negocio AFIP (NC requiere comprobantes asociados, FC no discrimina IVA, etc.).
- **Errores tipados**: jerarquía `ArcaError` con códigos estables (no rompen en minor releases).
- **PDF opcional**: Puppeteer solo si lo necesitás; sino, el módulo es headless.
- **Emisor multi-source**: traé los datos del emisor de tu DB, env, vault, o donde quieras.
- **Server standalone o librería**: usá solo el `BillingService` o levantá un microservicio HTTP completo.
- **OpenSSL para CMS**: usa el binario del sistema (más seguro que librerías JS).
- **TypeScript estricto**: sin `any`, sin castings inseguros.

---

## 📦 Instalación

```bash
# Requisitos
# • Node.js >= 20
# • OpenSSL >= 1.1 (casi siempre ya instalado)
# • Certs .crt + .key de AFIP (homologación o producción)

# Como librería
npm install arca-api-tordini

# O copiá este repo a tu workspace y linkealo
```

---

## 🚀 Quick start

```ts
import { createArca, CBTE_TIPO, DOC_TIPO, CONCEPTO, CONDICION_IVA } from 'arca-api-tordini'
import { writeFileSync } from 'node:fs'

const arca = createArca({
  cuit: 20223565078,
  razonSocial: 'Mi Empresa S.A.',
  domicilio: 'Av. Siempre Viva 742',
  condicionIva: 'Responsable Inscripto',
  inicioActividades: '01/01/2020',
  ingresosBrutos: '123456789',
  ptoVtaDefault: 1,
})

const result = await arca.billing.emitir({
  ptoVta: 1,
  cbteTipo: CBTE_TIPO.FACTURA_B,
  concepto: CONCEPTO.PRODUCTOS,
  receptor: {
    docTipo: DOC_TIPO.CONSUMIDOR_FINAL,
    docNro: 0,
    condicionIVA: CONDICION_IVA.CONSUMIDOR_FINAL,
    razonSocial: 'Consumidor Final',
  },
  items: [
    { descripcion: 'Producto 1', cantidad: 1, precioUnitario: 826.45, iva: 21 },
  ],
  condicionVenta: 'Contado',
})

console.log('CAE:', result.cae, 'Vto:', result.vtoCae)
if (result.pdfBuffer) {
  writeFileSync(result.fileName, result.pdfBuffer)
}

await arca.close()
```

---

## 🔧 Configuración (env vars)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `ARCA_ENV` | `homologacion` | `homologacion` \| `produccion` |
| `ARCA_SERVICE` | `wsfe` | Servicio WSAA para facturación (`wsfe`) |
| `CERTS_DIR` | `./certs` | Carpeta raíz de certs |
| `ARCA_CERT_FILE` | `cert.crt` | Nombre del archivo .crt |
| `ARCA_KEY_FILE` | `private.key` | Nombre del archivo .key |
| `ARCA_TA_FILE` | `TA_wsfe.xml` | Nombre del archivo TA cacheado |
| `ARCA_TRA_FILE` | `tra.xml` | Nombre del archivo TRA (scripts CLI) |
| `ARCA_CMS_FILE` | `cms.der` | Nombre del archivo CMS firmado (scripts CLI) |
| `ARCA_HTTP_HOST` | `0.0.0.0` | Host del server standalone |
| `ARCA_HTTP_PORT` | `3001` | Puerto del server standalone |
| `ARCA_CORS_ORIGINS` | `*` | Lista separada por comas. `*` para todos |
| `ARCA_RATE_LIMIT_WINDOW_MS` | `60000` | Ventana del rate limit HTTP (ms) |
| `ARCA_RATE_LIMIT_MAX` | `100` | Requests por ventana |
| `ARCA_JWT_SECRET` | _(vacío)_ | Si se setea, las rutas HTTP piden Bearer token |
| `ARCA_JWT_EXPIRES_IN` | `12h` | Vencimiento de los JWT emitidos |
| `ARCA_PUPPETEER_EXECUTABLE_PATH` | _(auto)_ | Ruta al binario de Chrome/Chromium |
| `ARCA_PUPPETEER_CONCURRENCY` | `2` | PDFs renderizados en simultáneo |
| `ARCA_PUPPETEER_MAX_USOS` | `100` | Reiniciar browser cada N usos |
| `ARCA_TEMPLATE_FACTURA` | _(built-in)_ | Path a un template HTML de Factura custom |
| `ARCA_TEMPLATE_PRESUPUESTO` | _(built-in)_ | Path a un template HTML de Presupuesto custom |
| `ARCA_MONTO_MAX_CF` | `10000000` | Importe desde el cual se rechaza Consumidor Final sin identificar (RG 5700/2025). `0` desactiva |
| `ARCA_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |

Ver [.env.example](.env.example).

### Padrón A13 (consulta de CUIT)

`arca.cuit.lookup(cuit)` (y `GET /cuit/:cuit` en el server) consulta el Padrón A13 en nombre del CUIT del emisor. Usa el mismo cert, pero el servicio `ws_sr_padron_a13` tiene que estar autorizado en WSASS (homologación) o en el Administrador de Relaciones (producción). Su TA se cachea aparte, en `TA_ws_sr_padron_a13.xml` (o en `padronTaStorage`).

### Templates de PDF custom

`ARCA_TEMPLATE_FACTURA` / `ARCA_TEMPLATE_PRESUPUESTO` (o `pdf.templateFactura` / `pdf.templatePresupuesto`) apuntan a un HTML propio. Placeholders:

- `{{campo}}` → texto escapado: `letra`, `codigo`, `tipoComprobante`, `ptoVta`, `nro`, `fecha`, `cuitEmisor`, `razonSocialEmisor`, `domicilioEmisor`, `condicionIvaEmisor`, `ingresosBrutos`, `inicioActividades`, `docReceptor`, `razonSocialReceptor`, `domicilioReceptor`, `condicionIvaReceptor`, `condicionVenta`, `cbtesAsoc`, `datosBancarios`, `cae`, `vtoCae`, `qr` (data URL del QR AFIP), `titulo`.
- `{{{items}}}` y `{{{totales}}}` → HTML generado (tabla de ítems y totales según la letra).
- Presupuesto: además `tituloDocumento` y `referenciaOrigen` (sin `cae`, `vtoCae`, `qr` ni `letra`).

Sin `ARCA_PUPPETEER_EXECUTABLE_PATH`, se usa `PUPPETEER_EXECUTABLE_PATH`, un Chrome del sistema o el de `npx puppeteer browsers install chrome`.

---

## 📂 Estructura del proyecto

```
Arca-api-Tordini/
├── src/
│   ├── domain/        # tipos, errores, enums, helpers puros (sin IO)
│   ├── config/        # carga y normalización de env vars
│   ├── core/          # CMS signer, SOAP client, WSAA, WSFE (lógica de protocolos)
│   ├── services/      # casos de uso de alto nivel (billing, comprobantes, cuit)
│   ├── pdf/           # generación de PDFs (Puppeteer)
│   ├── http/          # router Express, middlewares, server standalone
│   ├── bin/           # scripts CLI tipados
│   └── index.ts       # API pública
├── examples/          # ejemplos de uso (ver examples/README.md)
├── tests/             # tests unitarios (vitest)
├── docs/              # documentación extendida (ver docs/README.md)
├── certs/             # (gitignored) acá van los .crt y .key
└── package.json
```

---

## 🏗️ Arquitectura

El detalle completo (diagramas, decisiones de diseño, ciclo de vida del TA) no está documentado todavía. Acá va el resumen:

```
┌────────────────────────────────────────────────────────┐
│                     Tu aplicación                       │
└────────────┬───────────────────────────────────────────┘
             │ createArca() factory
             ▼
┌────────────────────────────────────────────────────────┐
│                    ArcaModule                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Billing  │ │ Comprob. │ │  Cuit    │ │  PDF     │   │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │             │            │            │         │
│  ┌────▼─────────────▼────┐ ┌────▼────────────▼────┐    │
│  │   WsaaClient (TA)     │ │    WsfeClient (CAE)  │    │
│  │  - TRA builder        │ │  - FECAESolicitar    │    │
│  │  - CMS signer         │ │  - FECompUltimoAut.  │    │
│  │  - TA cache           │ │  - FECompConsultar   │    │
│  └────────────┬──────────┘ └─────────────┬────────┘    │
│               │ SoapClient (axios)       │             │
└───────────────┼──────────────────────────┼─────────────┘
                ▼                          ▼
        ┌───────────────────────────────────────┐
        │   ARCA/AFIP SOAP (wsaa + wsfev1)      │
        └───────────────────────────────────────┘
```

**Capas** (de abajo hacia arriba):
1. **`core/`**: lógica de protocolo (SOAP, XML, CMS). No conoce reglas de negocio.
2. **`services/`**: casos de uso de facturación. Conoce reglas de AFIP pero no de HTTP.
3. **`http/`**: capa de transporte (Express). Validación de input, auth, errores a JSON.
4. **`index.ts`**: composición (factory `createArca`) y re-exports.

---

## 💡 Patrón de inyección

Todo lo "hardcodeable" es inyectable:

```ts
// Traer el emisor de tu DB
class MyEmisorProvider implements EmisorProvider {
  async getEmisor() {
    return { ... } // de tu tabla config
  }
}

// Storage de TA en Redis en vez de archivo
class RedisTaStorage implements TaStorage { ... }

// CMS signer alternativo (ej. con node-forge)
class NodeForgeCmsSigner implements CmsSigner { ... }

// SOAP client mockeado para tests
class FakeSoapClient implements SoapClient { ... }

const arca = createArca({
  emisorProvider: new MyEmisorProvider(),
  taStorage: new RedisTaStorage(),
  cmsSigner: new NodeForgeCmsSigner(),
  soapClient: new FakeSoapClient(),
  ...
})
```

---

## 📜 Scripts CLI

Todos aceptan `-e homologacion|produccion` (default `ARCA_ENV`) y `-h/--help`. Los paths por defecto salen de `CERTS_DIR` y `ARCA_*_FILE`.

```bash
# Conectividad con WSFEv1 (FEDummy, no requiere certs)
tsx src/bin/wsfev1-dummy.ts

# Generar TRA → certs/<env>/tra.xml (-s <servicio>, -o <archivo>)
tsx src/bin/generate-tra.ts

# Firmar TRA con CMS (salida .der = binario, otra extensión = base64)
tsx src/bin/sign-cms.ts ./tra.xml ./cms.der --cert ./cert.crt --key ./private.key

# Login completo (TRA + firma + loginCms); reutiliza el TA vigente salvo --force
tsx src/bin/submit-login.ts -e homologacion
tsx src/bin/submit-login.ts -s ws_sr_padron_a13   # TA del Padrón A13

# FEParamGetPtosVenta (CUIT de ARCA_CUIT o --cuit)
tsx src/bin/wsfev1-params.ts

# Chequeo completo: FEDummy → TA → FEParamGetPtosVenta → FECompUltimoAutorizado (no emite)
tsx src/bin/pipeline.ts -p 1 -t 6
```

Compilados, quedan como `arca-tra`, `arca-sign-cms`, `arca-submit-login`, `arca-wsfev1-dummy`, `arca-wsfev1-params` y `arca-pipeline`.

---

## 🐳 Docker

```bash
docker build -t arca-api-tordini .
docker run -p 3001:3001 \
  -v $(pwd)/certs:/app/certs \
  -e ARCA_ENV=produccion \
  arca-api-tordini
```

Ver [Dockerfile](Dockerfile).

---

## 🧪 Tests

```bash
npm test           # corre vitest
npm run typecheck  # verifica TypeScript strict
npm run build      # compila a dist/
npm run lint       # eslint
```

---

## 🤝 Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 Licencia

MIT © Tordini. Ver [LICENSE](LICENSE).

---

## 🙏 Créditos

- Basado en la documentación oficial de AFIP: [FE - Webservice](https://www.afip.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf)
- Templates HTML de comprobantes: basados en los modelos de AFIP.

---

## ✅ Estado

| Componente | Estado |
|---|---|
| Tipos, enums, helpers, schemas Zod, errores | ✅ |
| Factory `createArca()` y capa HTTP | ✅ |
| `WsaaClient` (TRA, firma CMS con OpenSSL, cache del TA) | ✅ |
| `WsfeClient` (FECAESolicitar, FECompUltimoAutorizado, FECompConsultar) | ✅ |
| `BillingService.emitir()` y `ComprobantesService` | ✅ |
| Tests unitarios + E2E contra homologación | ✅ |
| `PdfService` + `PuppeteerManager` (PDFs con QR AFIP) y templates | ✅ |
| `CuitService` (Padrón A13) | ✅ |
| Scripts CLI | ✅ |
