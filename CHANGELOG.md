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
- `CuitService` placeholder (extensible)
- `WsaaClient` con cache de TA y auto-renovación
- `WsfeClient` con FECAESolicitar, FECompUltimoAutorizado, FECompConsultar
- `CmsSigner` con default OpenSSL
- `SoapClient` con default Axios
- `TaStorage` con `FileTaStorage` y `MemoryTaStorage`
- `EmisorProvider` con `StaticEmisorProvider` default
- `PdfService` con Puppeteer + templates HTML
- `createArcaRouter()` y `createArcaServer()` para Express
- Validación con Zod (reglas de negocio AFIP)
- Jerarquía de errores tipados
- CLI scripts: `generate-tra`, `sign-cms`, `submit-login`, `pipeline`, `wsfev1-dummy`, `wsfev1-params`
- 10+ tests unitarios
- 6 ejemplos
- Dockerfile multi-stage
- docker-compose.yml
- GitHub Actions CI

[Unreleased]: https://github.com/tordini/arca-api-tordini/compare/main...HEAD
