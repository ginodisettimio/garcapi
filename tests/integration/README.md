# Tests E2E / Integración

Esta carpeta está reservada para tests de integración contra ARCA en
homologación (requieren certs `.crt`/`.key` reales y conexión a internet).

`emitir.test.ts` emite una Factura B a Consumidor Final y verifica el CAE.
Se saltea solo si `ARCA_CUIT` no está definido. Para ejecutarlo:

```bash
# 1. Generá los certs de homologación desde
#    https://auth.afip.gob.ar/contribuyente_/login.xhtml
# 2. Ponelos en certs/homologacion/ (cert.crt, private.key)
# 3. Habilitá un punto de venta para Web Services (default ARCA_PTO_VTA=1)
# 4. Corré
ARCA_CUIT=<tu cuit> npm run test:integration
```

Ver `docs/AMBIENTES.md` para más detalles sobre certs y entornos.
