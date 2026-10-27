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

### Fixed
- `items[].iva` se interpreta siempre como porcentaje. Antes `iva: 5` se tomaba como el Id 5 de ARCA y se facturaba al 21 % (lo mismo con 4, 6, 8 y 9). **Cambio de comportamiento:** los Ids de ARCA ya no se aceptan como `iva` y `mapAlicuota` lanza `ValidationError` ante una alícuota desconocida en vez de devolver 0 %.

[Unreleased]: https://github.com/tordini/arca-api-tordini/compare/main...HEAD
