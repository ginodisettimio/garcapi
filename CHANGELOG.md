# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public release
- `createArca()` factory con inyección de dependencias
- `BillingService` para emitir comprobantes (Factura A/B/C, NC, ND)
- `ComprobantesService` para consultar último y por número
- `CuitService` sobre el Padrón A13 (`PadronA13CuitService`, `PadronA13Client`); `GET /cuit/:cuit` devuelve 404 si el CUIT no existe
- `WsaaClient` con cache de TA y auto-renovación
- `WsfeClient` con FECAESolicitar, FECompUltimoAutorizado, FECompConsultar
- `CmsSigner` con default OpenSSL
- `SoapClient` con default Axios
- `TaStorage` con `FileTaStorage` y `MemoryTaStorage`
- `EmisorProvider` con `StaticEmisorProvider` default
- `PdfService` + `PuppeteerManager`: PDFs de factura/nota (con QR AFIP, RG 4892) y presupuesto; templates HTML por defecto y custom
- `createArcaRouter()` y `createArcaServer()` para Express
- Validación con Zod (reglas de negocio AFIP)
- Jerarquía de errores tipados
- CLI scripts: `generate-tra`, `sign-cms`, `submit-login`, `pipeline`, `wsfev1-dummy`, `wsfev1-params`
- `WsfeClient.feDummy()` y `WsfeClient.feParamGetPtosVenta()`
- 10+ tests unitarios
- 6 ejemplos
- Dockerfile multi-stage
- docker-compose.yml
- GitHub Actions CI
- `buildQrUrl` para armar la URL del QR AFIP
- Formato ticket para impresoras térmicas (80/58 mm, alto según contenido): `ARCA_PDF_FORMATO`, `ARCA_PDF_TICKET_MM`, `ARCA_TEMPLATE_TICKET` y `generateFacturaPdf(data, fileName, { formato })`
- Validación de Consumidor Final por monto: desde `MONTO_MAX_CONSUMIDOR_FINAL` ($10.000.000, RG 5700/2025) se rechaza DocTipo 99; configurable con `ARCA_MONTO_MAX_CF`
- `ARCA_TA_DIR` para cachear el TA fuera de la carpeta de certs
- Contingencia CAEA (`ContingenciaService`, `CaeaStore`, `ARCA_CAEA_PTO_VTA`, CLI `caea`): si ARCA no responde, `emitir()` autoriza con CAEA y lo informa cuando vuelve (`FECAEASolicitar`, `FECAEAConsultar`, `FECAEARegInformativo`, `FECAEASinMovimientoInformar`)
- El server standalone no arranca en producción sin `ARCA_JWT_SECRET` y avisa si `ARCA_CORS_ORIGINS` es `*`

### Changed
- Requiere Node.js ≥ 22.12 (Node 20 está fuera de soporte); Docker usa Node 24 LTS y puppeteer 25
- JWT: solo HS256, y se rechazan los tokens emitidos (`iat`) hace más de `ARCA_JWT_EXPIRES_IN`. En producción el secreto debe tener al menos 32 caracteres
- Los errores 5xx ya no devuelven `details` (quedan en el log), salvo `CAE_RESULTADO_INCIERTO` y `CAEA_NO_DISPONIBLE`; los errores no previstos responden `Error interno`. Los 400 de validación del body traen `code: VALIDATION_ERROR`
- Body máximo 1 MB, hasta 1000 ítems y 50 comprobantes asociados
- Se quitaron dependencias sin uso: `xml2js`, `cors`, `helmet`, `express-rate-limit`, `pino`, `pino-http`
- Un corte de red durante `FECAESolicitar` ahora lanza `CAE_RESULTADO_INCIERTO` (HTTP 504) en vez de `NetworkError`, porque ARCA pudo haber autorizado el comprobante
- `NETWORK_ERROR` responde HTTP 503 (antes 500)

### Fixed
- **WSFE de producción no conectaba**: `servicios1.afip.gov.ar` negocia DHE con una clave que OpenSSL 3 rechaza ("dh key too small"). El cliente SOAP ahora solo ofrece ECDHE
- El server standalone leía `ARCA_ENV` y los datos del emisor antes de cargar el `.env`: con `ARCA_ENV=produccion` solo en el `.env`, la config decía producción pero se emitía en homologación
- Al apagar (SIGTERM) el server espera las requests en curso en vez de cortar emisiones a mitad de camino
- Variables de entorno numéricas inválidas (`ARCA_MONTO_MAX_CF`, `ARCA_CAEA_PTO_VTA`, …) se convertían en `NaN` en silencio; ahora el arranque falla con `ConfigError`
- La validación de arrays acumulaba un error por elemento sin tope (memoria, GHSA-mrhx-c7xc-m3w5)
- Contingencia: un comprobante CAEA ya informado a ARCA (corte entre la respuesta y el guardado) quedaba trabado como rechazado; ahora se verifica con `FECompConsultar`. Tampoco se puede emitir con CAE en el punto de venta de contingencia
- La ruta de comprobantes caía a "sin autenticación" si no recibía el middleware; los PDFs se renderizan con JavaScript deshabilitado; sin `X-Powered-By` y con `X-Content-Type-Options: nosniff`
- `.gitignore`: `ta/` y `certs/**/*.json` (TA y estado CAEA)
- Dependencias con vulnerabilidades conocidas actualizadas (`npm audit`: de 19 a 1, la de zod, mitigada con los topes de arrays)
- Condición IVA del receptor según la tabla de ARCA (`FEParamGetCondicionIvaReceptor`): la Factura C se rechazaba para responsables inscriptos y monotributistas (1, 6, 13, 16) y faltaba la condición 16 (Monotributo Trabajador Independiente Promovido) en A. El mensaje `condicion_iva_invalida_para_BC` pasa a `condicion_iva_invalida_para_B` / `condicion_iva_invalida_para_C`
- `docNro` no numérico pasaba la validación como `NaN`; `ptoVta` 0 se aceptaba; la regla de `docNro` 0 para consumidor final ahora aplica también a las notas B
- `GET /afip/fa-auth/status` no pedía JWT y exponía la ruta del TA y los datos del certificado: ahora requiere el mismo token que el resto de `/afip/*`
- `POST /afip/facturas` con PDF binario no devolvía CAE, número ni vencimiento: ahora van en headers `X-Arca-*` (expuestos por CORS); la respuesta JSON incluye `tipoAutorizacion` y `pendienteInformar`
- `docker-compose.yml`: montaba dos volúmenes en `/app/certs` (y en solo lectura, sin poder escribir el TA), usaba `ARCA_HTTP_CORS_ORIGINS` en vez de `ARCA_CORS_ORIGINS` y no pasaba los datos del emisor que exige el server
- CORS con origen limitado responde con `Vary: Origin`
- `items[].iva` se interpreta siempre como porcentaje. Antes `iva: 5` se tomaba como el Id 5 de ARCA y se facturaba al 21 % (lo mismo con 4, 6, 8 y 9). **Cambio de comportamiento:** los Ids de ARCA ya no se aceptan como `iva` y `mapAlicuota` lanza `ValidationError` ante una alícuota desconocida en vez de devolver 0 %.

[Unreleased]: https://github.com/tordini/arca-api-tordini/compare/main...HEAD
