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
| `ARCA_SERVICE` | `wsfe` | `wsfe` (por ahora solo este) |
| `CERTS_DIR` | `./certs` | Carpeta raíz de certs |
| `ARCA_FILE_CERT` | `cert.crt` | Nombre del archivo .crt |
| `ARCA_FILE_KEY` | `private.key` | Nombre del archivo .key |
| `ARCA_FILE_TA` | `TA_wsfe.xml` | Nombre del archivo TA cacheado |
| `ARCA_HTTP_HOST` | `0.0.0.0` | Host del server standalone |
| `ARCA_HTTP_PORT` | `3001` | Puerto del server standalone |
| `ARCA_HTTP_CORS_ORIGINS` | _(vacío)_ | Lista separada por comas. `*` para todos |
| `ARCA_JWT_SECRET` | _(vacío)_ | Si se setea, las rutas HTTP piden Bearer token |
| `ARCA_PUPPETEER_EXECUTABLE_PATH` | _(auto)_ | Ruta al binario de Chrome/Chromium |
| `ARCA_PUPPETEER_CONCURRENCY` | `1` | Browsers simultáneos |
| `ARCA_PUPPETEER_MAX_USOS` | `1000` | Reiniciar browser cada N usos |
| `ARCA_TEMPLATE_FACTURA` | _(built-in)_ | Path a un template HTML de Factura custom |
| `ARCA_TEMPLATE_PRESUPUESTO` | _(built-in)_ | Path a un template HTML de Presupuesto custom |
| `ARCA_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |

Ver [.env.example](.env.example).

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

```bash
# Generar TRA
tsx src/bin/generate-tra.ts -o ./tra.xml

# Firmar TRA con CMS
tsx src/bin/sign-cms.ts ./tra.xml ./cms.b64 --cert ./cert.crt --key ./private.key

# Login completo (genera + firma + autentica)
tsx src/bin/submit-login.ts -e homologacion

# Pipeline completo
tsx src/bin/pipeline.ts

# Dummy FECompUltimoAutorizado
tsx src/bin/wsfev1-dummy.ts

# FEParamGetPtosVenta
tsx src/bin/wsfev1-params.ts
```

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

## 🚧 Estado

| Componente | Estado |
|---|---|
| Tipos, enums, helpers, schemas Zod, errores | ✅ |
| Factory `createArca()` y capa HTTP | ✅ |
| `WsaaClient` (TRA, firma CMS con OpenSSL, cache del TA) | ✅ |
| `WsfeClient` (FECAESolicitar, FECompUltimoAutorizado, FECompConsultar) | ✅ |
| `BillingService.emitir()` y `ComprobantesService` | ✅ |
| Tests unitarios + E2E contra homologación | ✅ |
| `PdfService` + `PuppeteerManager` (PDFs con QR AFIP) y templates | 🚧 pendiente |
| `CuitService` (Padrón A13) | 🚧 pendiente |
| Scripts CLI (salvo `server.ts`) | 🚧 pendiente |
