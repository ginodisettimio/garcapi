# API HTTP

Cómo consumir el servicio de facturación: endpoints, requests, respuestas y errores.

- [Conceptos](#conceptos)
- [Autenticación](#autenticación)
- [Errores](#errores)
- Endpoints
  - [`GET /health`](#get-health)
  - [`POST /afip/facturas`](#post-afipfacturas) — emitir un comprobante
  - [`GET /afip/comprobantes/ultimo`](#get-afipcomprobantesultimo) — último número autorizado
  - [`GET /afip/comprobantes/:ptoVta/:tipo/:nro`](#get-afipcomprobantesptovtatiponro) — consultar un comprobante
  - [`GET /afip/cuit/:cuit`](#get-afipcuitcuit) — datos de un CUIT (Padrón A13)
  - [`GET /afip/fa-auth/status`](#get-afipfa-authstatus) — estado del ticket de acceso
- [Tablas de códigos](#tablas-de-códigos)
- [Contingencia (CAEA)](#contingencia-caea)
- [Uso como librería](#uso-como-librería)

---

## Conceptos

| | |
|---|---|
| **Base URL** | La del server standalone (`node dist/bin/server.js` o `docker compose up`), por ejemplo `https://facturacion.example.com`. Si montás el router en tu propia app (`app.use('/api', createArcaRouter(...))`), las rutas quedan bajo ese prefijo: `/api/afip/...`. |
| **Formato** | Requests y respuestas JSON (`Content-Type: application/json`), salvo el PDF de `POST /afip/facturas`. Body máximo: 5 MB. |
| **Entorno** | `ARCA_ENV=homologacion` (pruebas, sin validez fiscal) o `produccion`. `GET /health` informa cuál está activo. |
| **Emisor** | Siempre es el configurado en el server (`ARCA_CUIT`, `ARCA_RAZON_SOCIAL`, …). El cliente solo manda el receptor y los ítems. |
| **Importes** | Números en pesos (o en la moneda indicada) con hasta 2 decimales. `precioUnitario` es **neto, sin IVA**: el servicio calcula el IVA. |
| **Fechas** | Strings `YYYYMMDD` (ej. `"20261026"`). Si no se manda, la fecha del comprobante es hoy en hora de Argentina. |

---

## Autenticación

Si el server tiene `ARCA_JWT_SECRET` (obligatorio en producción), las rutas `/afip/facturas`, `/afip/comprobantes/*` y `/afip/cuit/*` piden un JWT:

```
Authorization: Bearer <token>
```

No hay endpoint de login. El backend del POS firma el token con el mismo secreto (HS256):

```ts
import jwt from 'jsonwebtoken'

const token = jwt.sign({ sub: 'pos-1' }, process.env.ARCA_JWT_SECRET!, { expiresIn: '12h' })
```

Los claims `id`, `role` y `email` son opcionales; el servicio no los usa para autorizar.

Sin token, o con un token inválido o vencido:

```http
HTTP/1.1 401 Unauthorized

{ "ok": false, "error": "unauthorized" }
```

> El secreto no debe llegar al navegador. Si el POS es una app web, el token lo emite su backend.

**CORS**: solo los orígenes de `ARCA_CORS_ORIGINS` reciben `Access-Control-Allow-Origin`. Los headers `X-Arca-*` y `Content-Disposition` están expuestos para que el navegador pueda leerlos.

---

## Errores

Todas las respuestas de error tienen `ok: false`, un mensaje en `error` y, salvo los 401, un `code` estable para que el cliente decida qué hacer.

| HTTP | `code` | Cuándo | Campos extra |
|---|---|---|---|
| 400 | _(sin code)_, `error: "validation_failed"` | El body no cumple el schema (tipos, campos obligatorios, reglas de ARCA) | `issues` |
| 400 | `VALIDATION_ERROR` | Validaciones del servicio: consumidor final por monto, parámetros de URL | `issues` |
| 401 | — | Falta el JWT o es inválido | — |
| 404 | `CUIT_NO_ENCONTRADO` | El CUIT no existe en el Padrón A13 | `details` |
| 502 | `COMPROBANTE_RECHAZADO` | ARCA respondió y rechazó el comprobante | `afipErrors`, `afipObservations` |
| 502 | `WSFE_FAULT` / `WSFE_ERRORES` | ARCA devolvió un error en la consulta (token, parámetros) | `afipErrors`, `faultcode`, `faultstring` |
| 503 | `NETWORK_ERROR` | ARCA no responde (sin contingencia CAEA configurada) | `details` |
| 503 | `CAEA_NO_DISPONIBLE` | ARCA no responde y no hay CAEA para la quincena | `details` |
| 504 | `CAE_RESULTADO_INCIERTO` | Se cortó la comunicación mientras ARCA procesaba el comprobante: **puede haber quedado autorizado** | `details.ptoVta`, `details.cbteTipo`, `details.nro` |
| 500 | `WSAA_FAULT`, `CMS_SIGN_ERROR`, `OPENSSL_NOT_FOUND`, `CONFIG_ERROR`, `INTERNAL_ERROR`, … | Problemas de configuración o de autenticación con ARCA (certificado, servicio no autorizado) | `details` |

`issues` es una lista de `{ path, message }`, donde `path` indica el campo:

```json
{
  "ok": false,
  "error": "validation_failed",
  "issues": [
    { "path": ["items", 0, "iva"], "message": "iva_invalido" },
    { "path": ["receptor", "docTipo"], "message": "docTipo_invalido_para_A" }
  ]
}
```

Qué hacer según el error:

- **400**: corregir el request. No reintentar igual.
- **502 `COMPROBANTE_RECHAZADO`**: no se emitió nada. Revisar `afipErrors` y `afipObservations` (ver [ejemplo](#comprobante-rechazado)).
- **503**: ARCA está caído. Se puede reintentar más tarde.
- **504 `CAE_RESULTADO_INCIERTO`**: **no reintentar a ciegas**, porque se duplicaría la venta. Primero consultá [`GET /afip/comprobantes/:ptoVta/:tipo/:nro`](#get-afipcomprobantesptovtatiponro) con los datos de `details`. Si existe, ese es el comprobante emitido; si no, recién ahí reintentá.

---

## Endpoints

### `GET /health`

Sin autenticación. Lo usa el healthcheck de Docker.

```bash
curl https://facturacion.example.com/health
```

```json
{ "ok": true, "module": "arca-api-tordini", "env": "homologacion" }
```

Solo indica que el proceso está vivo: no consulta a ARCA.

---

### `POST /afip/facturas`

Emite un comprobante (factura, nota de crédito o débito, letras A, B o C), lo autoriza en ARCA y devuelve el CAE. Con PDF habilitado devuelve también el PDF en A4 o ticket, según `ARCA_PDF_FORMATO`.

#### Request

```http
POST /afip/facturas
Authorization: Bearer <token>
Content-Type: application/json
```

| Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|
| `ptoVta` | int | sí | Punto de venta (el de "RECE para aplicativo y web services"). |
| `cbteTipo` | int | sí | Tipo de comprobante: 1, 2, 3, 6, 7, 8, 11, 12 o 13 ([tabla](#tipos-de-comprobante)). |
| `concepto` | int | no | 1 productos (default), 2 servicios, 3 ambos. |
| `fecha` | `YYYYMMDD` | no | Fecha del comprobante. Default: hoy (Argentina). |
| `receptor.docTipo` | int | sí | 80 CUIT, 86 CUIL, 96 DNI, 99 consumidor final, … ([tabla](#tipos-de-documento)). |
| `receptor.docNro` | int o string | sí | Número de documento. `0` si `docTipo` es 99. |
| `receptor.condicionIVA` | int | sí | Condición frente al IVA ([tabla](#condición-frente-al-iva)). |
| `receptor.razonSocial` | string | sí | Nombre o razón social. |
| `receptor.domicilio` | string | no | Se imprime en el PDF (default `-`). |
| `items` | array | sí | Al menos un ítem. |
| `items[].descripcion` | string | sí | |
| `items[].cantidad` | number | sí | Mayor que 0. Admite decimales (ej. `0.75` kg). |
| `items[].precioUnitario` | number | sí | **Neto, sin IVA.** En letra C es el precio final. |
| `items[].iva` | number | sí | Alícuota **en porcentaje**: 0, 2.5, 5, 10.5, 21 o 27. En letra C, siempre 0. |
| `items[].codigo` | string o number | no | Se imprime antes de la descripción. |
| `moneda` | string | no | `PES` (default), `DOL` o `EUR`. |
| `cotizacion` | number | no | Cotización respecto del peso. Default 1. Obligatoria (>0) si la moneda no es `PES`. |
| `cbtesAsoc` | array | NC/ND | Comprobantes asociados. Obligatorio en notas de crédito y débito. |
| `cbtesAsoc[].tipo` | int | sí | Tipo del comprobante original. |
| `cbtesAsoc[].ptoVta` | int | sí | |
| `cbtesAsoc[].nro` | int | sí | |
| `cbtesAsoc[].cuit` | int | no | Default: CUIT del emisor. |
| `fchServDesde`, `fchServHasta`, `fchVtoPago` | `YYYYMMDD` | concepto 2/3 | Período del servicio y vencimiento del pago. Obligatorios si `concepto` es 2 o 3. |
| `condicionVenta` | string | sí | Texto libre que se imprime: `"Contado"`, `"Cuenta Corriente"`, `"30 días"`. |

#### Reglas de validación

Además de los tipos de cada campo, el servicio aplica estas reglas antes de llamar a ARCA (`message` en `issues`):

| `message` | Regla |
|---|---|
| `iva_invalido` | `iva` tiene que ser 0, 2.5, 5, 10.5, 21 o 27 (porcentaje, no el Id de ARCA). |
| `iva_obligatorio_en_A_y_B` | En A y B al menos un ítem tiene que tener IVA > 0. |
| `iva_no_debe_discriminarse_en_C` | En C todos los ítems van con `iva: 0`. |
| `docTipo_invalido_para_A` | La factura A no admite consumidor final (`docTipo` 99). |
| `docNro_debe_ser_0_para_docTipo_99_en_B` | Factura B a consumidor final: `docNro` 0. |
| `condicion_iva_invalida_para_A` | En A, `condicionIVA` tiene que ser 1, 6 o 13. |
| `condicion_iva_invalida_para_BC` | En B y C, `condicionIVA` tiene que ser 4, 5, 7, 8, 9, 10 o 15. |
| `cbtesAsoc_obligatorio_en_NC_y_ND` | Las notas de crédito y débito necesitan `cbtesAsoc`. |
| `fechas_servicio_obligatorias` | Con `concepto` 2 o 3 van `fchServDesde`, `fchServHasta` y `fchVtoPago`. |
| `receptor_debe_identificarse_por_monto` | Consumidor final sin identificar (`docTipo` 99) con un total desde $10.000.000 (RG 5700/2025, configurable con `ARCA_MONTO_MAX_CF`): hay que mandar DNI, CUIL o CDI. Responde con `code: VALIDATION_ERROR`. |
| `cbteTipo_invalido`, `moneda_invalida`, `cotizacion_invalida`, `fecha_formato_invalido_YYYYMMDD`, `items_obligatorios`, `cantidad_debe_ser_positiva`, … | Formato de cada campo. |

#### Ejemplos de request

Factura B a consumidor final:

```json
{
  "ptoVta": 1,
  "cbteTipo": 6,
  "receptor": { "docTipo": 99, "docNro": 0, "condicionIVA": 5, "razonSocial": "Consumidor Final" },
  "items": [
    { "descripcion": "Gaseosa cola 2,25 L", "cantidad": 2, "precioUnitario": 1500, "iva": 21 },
    { "descripcion": "Pan francés", "cantidad": 0.75, "precioUnitario": 2000, "iva": 10.5 }
  ],
  "condicionVenta": "Contado"
}
```

Factura A a un responsable inscripto:

```json
{
  "ptoVta": 1,
  "cbteTipo": 1,
  "receptor": {
    "docTipo": 80,
    "docNro": 30712345671,
    "condicionIVA": 1,
    "razonSocial": "Cliente S.A.",
    "domicilio": "San Martín 10, Córdoba"
  },
  "items": [{ "codigo": "P10", "descripcion": "Servicio técnico", "cantidad": 1, "precioUnitario": 50000, "iva": 21 }],
  "condicionVenta": "Cuenta Corriente"
}
```

Nota de crédito B que anula la factura B 0001-00000042:

```json
{
  "ptoVta": 1,
  "cbteTipo": 8,
  "receptor": { "docTipo": 99, "docNro": 0, "condicionIVA": 5, "razonSocial": "Consumidor Final" },
  "items": [{ "descripcion": "Devolución Gaseosa cola", "cantidad": 1, "precioUnitario": 1500, "iva": 21 }],
  "cbtesAsoc": [{ "tipo": 6, "ptoVta": 1, "nro": 42 }],
  "condicionVenta": "Contado"
}
```

Servicios (concepto 2):

```json
{
  "ptoVta": 1,
  "cbteTipo": 6,
  "concepto": 2,
  "receptor": { "docTipo": 96, "docNro": 30123456, "condicionIVA": 5, "razonSocial": "Juan Pérez" },
  "items": [{ "descripcion": "Abono mensual octubre", "cantidad": 1, "precioUnitario": 10000, "iva": 21 }],
  "fchServDesde": "20261001",
  "fchServHasta": "20261031",
  "fchVtoPago": "20261110",
  "condicionVenta": "Débito automático"
}
```

#### Respuesta exitosa: PDF (default del server)

Con el PDF habilitado, que es el default del server standalone, la respuesta es el **PDF binario** y los datos del comprobante van en headers:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename=F_B_00001-00000042.pdf
X-Arca-Cae: 86431024018336
X-Arca-Cae-Vto: 20261105
X-Arca-Pto-Vta: 1
X-Arca-Nro-Comprobante: 42
X-Arca-Cbte-Tipo: 6
X-Arca-Importe-Total: 5650.5
X-Arca-Tipo-Autorizacion: CAE
X-Arca-Pendiente-Informar: false

%PDF-1.4 …
```

| Header | Descripción |
|---|---|
| `X-Arca-Cae` | CAE asignado por ARCA (14 dígitos), o el CAEA si se emitió en contingencia. |
| `X-Arca-Cae-Vto` | Vencimiento del CAE o CAEA (`YYYYMMDD`). |
| `X-Arca-Pto-Vta` | Punto de venta del comprobante. En contingencia es el de CAEA, no el del request. |
| `X-Arca-Nro-Comprobante` | Número asignado. |
| `X-Arca-Cbte-Tipo` | Tipo de comprobante. |
| `X-Arca-Importe-Total` | Total del comprobante (neto + IVA). |
| `X-Arca-Tipo-Autorizacion` | `CAE` (en línea) o `CAEA` (contingencia). |
| `X-Arca-Pendiente-Informar` | `true` si se emitió con CAEA y todavía no se informó a ARCA. |

El nombre del archivo es `<prefijo>_<letra>_<ptoVta 5 díg.>-<nro 8 díg.>.pdf`, donde el prefijo es `F` para facturas, `F_NC` para notas de crédito y `F_ND` para notas de débito.

#### Respuesta exitosa: JSON

Se responde JSON cuando no hay PDF: el router se montó con `sendPdfAsBinary: false`, el PDF está deshabilitado o falló su generación. En este último caso el comprobante **igual quedó emitido** y `pdfBase64` viene en `null`.

```json
{
  "ok": true,
  "cae": "86431024018336",
  "vtoCae": "20261105",
  "nroComprobante": 42,
  "cbteTipo": 6,
  "ptoVta": 1,
  "importeTotal": 5650.5,
  "fileName": "F_B_00001-00000042.pdf",
  "tipoAutorizacion": "CAE",
  "pendienteInformar": false,
  "pdfBase64": "JVBERi0xLjQK…",
  "xml": "<soap:Envelope …>…</soap:Envelope>"
}
```

`xml` es la respuesta cruda de ARCA a `FECAESolicitar`; en contingencia viene vacío.

#### Comprobante rechazado

ARCA respondió, pero no autorizó el comprobante, así que no hay número asignado:

```http
HTTP/1.1 502 Bad Gateway

{
  "ok": false,
  "error": "El comprobante fue rechazado por ARCA",
  "code": "COMPROBANTE_RECHAZADO",
  "afipErrors": [],
  "afipObservations": ["10069: Campo DocNro no puede ser igual al del emisor."]
}
```

`afipErrors` son errores generales (`{ Code, Msg }`); `afipObservations` son los motivos del rechazo de ese comprobante, con el formato `"<código>: <mensaje>"`.

#### Ejemplo desde un POS (fetch)

```ts
const res = await fetch('https://facturacion.example.com/afip/facturas', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(venta),
})

if (!res.ok) {
  const err = await res.json()
  if (err.code === 'CAE_RESULTADO_INCIERTO') {
    // consultar err.details.ptoVta / cbteTipo / nro antes de reintentar
  }
  throw new Error(err.error)
}

const comprobante = {
  cae: res.headers.get('X-Arca-Cae'),
  vencimiento: res.headers.get('X-Arca-Cae-Vto'),
  ptoVta: Number(res.headers.get('X-Arca-Pto-Vta')),
  nro: Number(res.headers.get('X-Arca-Nro-Comprobante')),
  contingencia: res.headers.get('X-Arca-Tipo-Autorizacion') === 'CAEA',
}
const pdf = await res.blob() // para imprimir o guardar
```

Con `curl`:

```bash
curl -X POST https://facturacion.example.com/afip/facturas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d @venta.json -D headers.txt -o comprobante.pdf
```

#### Concurrencia

Las emisiones se procesan **de a una por proceso**: pedir número y autorizar van juntos para que dos ventas simultáneas no tomen el mismo número. Cada emisión tarda lo que tarda ARCA, normalmente menos de un segundo. Corré **una sola instancia** del server por punto de venta.

---

### `GET /afip/comprobantes/ultimo`

Número del último comprobante autorizado en ARCA para un punto de venta y tipo.

| Query | Tipo | Descripción |
|---|---|---|
| `ptoVta` | int | Punto de venta. |
| `tipo` | int | Tipo de comprobante. |

```bash
curl -H "Authorization: Bearer $TOKEN" \
  'https://facturacion.example.com/afip/comprobantes/ultimo?ptoVta=1&tipo=6'
```

```json
{ "ok": true, "ptoVta": 1, "tipo": 6, "nro": 42 }
```

`nro: 0` significa que todavía no se emitió ninguno. Errores: 400 `VALIDATION_ERROR` si faltan parámetros o el tipo es inválido; 502 si ARCA devuelve error.

---

### `GET /afip/comprobantes/:ptoVta/:tipo/:nro`

Consulta en ARCA un comprobante ya emitido (`FECompConsultar`). Sirve para verificar uno emitido o para resolver un `CAE_RESULTADO_INCIERTO`.

| Query | Descripción |
|---|---|
| `format=raw` | Devuelve el XML directo (`Content-Type: application/xml`) en vez de JSON. |

```bash
curl -H "Authorization: Bearer $TOKEN" https://facturacion.example.com/afip/comprobantes/1/6/42
```

```json
{
  "ok": true,
  "xml": "<soap:Envelope …><FECompConsultarResult><ResultGet><Concepto>1</Concepto><DocTipo>99</DocTipo>…<CbteDesde>42</CbteDesde><CbteFch>20261026</CbteFch><ImpTotal>5650.5</ImpTotal>…<CodAutorizacion>86431024018336</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261105</FchVto><Resultado>A</Resultado>…</ResultGet></FECompConsultarResult>…"
}
```

Campos útiles del XML: `CodAutorizacion` (CAE o CAEA), `EmisionTipo` (`CAE`/`CAEA`), `FchVto`, `ImpTotal`, `CbteFch`, `Resultado`. Si el comprobante no existe, ARCA responde con error 602 y el servicio devuelve **502** con `code: WSFE_ERRORES`, `afipErrors: [{ "Code": 602, … }]`.

---

### `GET /afip/cuit/:cuit`

Datos de un contribuyente en el Padrón A13. El certificado tiene que estar autorizado para el servicio `ws_sr_padron_a13`; si no lo está, responde **500** con `code: WSAA_FAULT` ("Computador no autorizado a acceder al servicio").

`:cuit` lleva 11 dígitos; se aceptan guiones (`20-11111111-2`).

```bash
curl -H "Authorization: Bearer $TOKEN" https://facturacion.example.com/afip/cuit/20111111112
```

```json
{
  "ok": true,
  "cuit": "20111111112",
  "razonSocial": "PEREZ JUAN",
  "tipoPersona": "FISICA",
  "estado": "ACTIVO",
  "domicilio": "AV RIVADAVIA 5000, CABALLITO, CIUDAD AUTONOMA BUENOS AIRES (CP 1405)"
}
```

| Campo | Descripción |
|---|---|
| `razonSocial` | Razón social (persona jurídica) o "APELLIDO NOMBRE" (persona física). |
| `tipoPersona` | `FISICA` o `JURIDICA`. |
| `estado` | `ACTIVO` o `INACTIVO` (estado de la clave). |
| `domicilio` | Domicilio fiscal; si no tiene, el primero informado. |

Los campos que ARCA no informa no aparecen en la respuesta. Errores: 400 si el CUIT no tiene 11 dígitos; 404 `CUIT_NO_ENCONTRADO`.

> El Padrón A13 no devuelve la condición frente al IVA: el `condicionIVA` del receptor lo sigue decidiendo el POS.

---

### `GET /afip/fa-auth/status`

Estado del ticket de acceso (TA) de WSAA que usa el servicio. Si no hay uno vigente, lo renueva. Sirve para diagnosticar el certificado.

```json
{
  "ok": true,
  "valid": true,
  "expiration": "2026-10-27T13:42:27.853Z",
  "header": {
    "source": "CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239",
    "destination": "SERIALNUMBER=CUIT 20219478012, CN=pruebas",
    "uniqueId": "1793065329",
    "generationTime": "2026-10-26T22:42:27.853-03:00",
    "expirationTime": "2026-10-27T10:42:27.853-03:00"
  },
  "taPath": "/app/ta/homologacion/TA_wsfe.xml"
}
```

> Hoy este endpoint **no pide JWT**. No lo expongas públicamente.

---

## Tablas de códigos

### Tipos de comprobante

| `cbteTipo` | Comprobante | | `cbteTipo` | Comprobante | | `cbteTipo` | Comprobante |
|---|---|---|---|---|---|---|---|
| 1 | Factura A | | 6 | Factura B | | 11 | Factura C |
| 2 | Nota de Débito A | | 7 | Nota de Débito B | | 12 | Nota de Débito C |
| 3 | Nota de Crédito A | | 8 | Nota de Crédito B | | 13 | Nota de Crédito C |

Cuál emitir:

- **Emisor responsable inscripto:** A a responsables inscriptos y monotributistas; B a consumidores finales y exentos.
- **Emisor monotributista:** siempre C.

### Tipos de documento

| `docTipo` | Documento |
|---|---|
| 80 | CUIT |
| 86 | CUIL |
| 87 | CDI |
| 94 | Pasaporte |
| 96 | DNI |
| 99 | Consumidor final sin identificar (`docNro: 0`) |

### Condición frente al IVA

| `condicionIVA` | Condición | Letra |
|---|---|---|
| 1 | Responsable Inscripto | A |
| 6 | Monotributo | A |
| 13 | Monotributo Social | A |
| 4 | IVA Sujeto Exento | B / C |
| 5 | Consumidor Final | B / C |
| 7 | Sujeto No Categorizado | B / C |
| 8 | Proveedor del Exterior | B / C |
| 9 | Cliente del Exterior | B / C |
| 10 | IVA Liberado – Ley 19.640 | B / C |
| 15 | IVA No Alcanzado | B / C |

### Alícuotas de IVA

`items[].iva` en porcentaje: `0`, `2.5`, `5`, `10.5`, `21`, `27`. Los Ids de ARCA (3, 4, 5, 6, 8, 9) **no** se aceptan: `5` significa 5 %.

### Conceptos

| `concepto` | |
|---|---|
| 1 | Productos (default) |
| 2 | Servicios (requiere fechas de servicio) |
| 3 | Productos y servicios (requiere fechas de servicio) |

---

## Contingencia (CAEA)

Si el server tiene `ARCA_CAEA_PTO_VTA` y ARCA no responde, `POST /afip/facturas` **igual emite** el comprobante con el CAEA de la quincena, en el punto de venta de contingencia. Para el cliente:

- La respuesta es la misma (200 con PDF o JSON), con `X-Arca-Tipo-Autorizacion: CAEA` / `tipoAutorizacion: "CAEA"` y `pendienteInformar: true`.
- `X-Arca-Pto-Vta` y `nroComprobante` son los del punto de venta CAEA, con su propia numeración. Guardalos tal cual.
- El PDF dice "CAEA" en lugar de "CAE" y el QR lo indica (`tipoCodAut: "A"`). Es un comprobante válido para entregar.
- El server informa el comprobante a ARCA cuando vuelve, con un reintento cada 30 minutos. El cliente no tiene que hacer nada.

Si no hay CAEA disponible responde 503 `CAEA_NO_DISPONIBLE`. Si el corte ocurre en medio de la autorización, responde 504 `CAE_RESULTADO_INCIERTO` (ver [Errores](#errores)).

---

## Uso como librería

Si tu backend es Node.js, podés usar el servicio sin HTTP:

```ts
import { createArca, CBTE_TIPO, DOC_TIPO, CONDICION_IVA } from 'arca-api-tordini'

const arca = createArca({
  cuit: 20219478012,
  razonSocial: 'Mi Empresa S.A.',
  domicilio: 'Av. Siempre Viva 742',
  condicionIva: 'Responsable Inscripto',
  inicioActividades: '01/01/2020',
  ingresosBrutos: '123456789',
  ptoVtaDefault: 1,
})

const r = await arca.billing.emitir({ /* mismo body que POST /afip/facturas */ })
// r: { cae, vtoCae, nroComprobante, cbteTipo, ptoVta, importeTotal, fileName, xml,
//      tipoAutorizacion, pendienteInformar, pdfBuffer? }

await arca.comprobantes.ultimoAutorizado(1, CBTE_TIPO.FACTURA_B) // número
await arca.comprobantes.consultar(1, CBTE_TIPO.FACTURA_B, 42)    // XML
await arca.cuit.lookup('20111111112')                            // CuitInfo
await arca.close()
```

Los errores son clases de `ArcaError` con el mismo `code` de la tabla de [Errores](#errores): `ValidationError`, `ComprobanteRechazadoError`, `WsfeError`, `PadronError`, `NetworkError`, …

Para sumar los endpoints a una app Express existente:

```ts
import { createArcaRouter } from 'arca-api-tordini'

app.use('/api', createArcaRouter({
  wsaa: arca.wsaa,
  billing: arca.billing,
  comprobantes: arca.comprobantes,
  cuit: arca.cuit,
  jwtSecret: process.env.ARCA_JWT_SECRET ?? null,
  sendPdfAsBinary: false, // JSON con pdfBase64 en vez del PDF binario
}))
// → /api/afip/facturas, /api/afip/comprobantes/…, /api/afip/cuit/…
```

Configuración, variables de entorno y deploy: ver el [README](../README.md).
