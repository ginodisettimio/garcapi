# Tests E2E / Integración

Esta carpeta está reservada para tests de integración contra ARCA en
homologación (requieren certs `.crt`/`.key` reales y conexión a internet).

`emitir.test.ts` emite Factura B a Consumidor Final, Factura A a un CUIT,
una Nota de Crédito B asociada y una Factura B de servicios, y verifica el CAE.
Se saltea solo si `ARCA_CUIT` no está definido. Para ejecutarlo:

```bash
# 1. Generá los certs de homologación desde
#    https://auth.afip.gob.ar/contribuyente_/login.xhtml
# 2. Ponelos en certs/homologacion/ (cert.crt, private.key)
# 3. Habilitá un punto de venta para Web Services (default ARCA_PTO_VTA=1)
#    Opcional: ARCA_CUIT_RECEPTOR para la Factura A (default 20111111112;
#    ARCA rechaza que el receptor sea el mismo CUIT del emisor)
# 4. Corré
ARCA_CUIT=<tu cuit> npm run test:integration
```

Ver `docs/AMBIENTES.md` para más detalles sobre certs y entornos.
