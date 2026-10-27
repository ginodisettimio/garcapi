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

`padron.test.ts` (Padrón A13) es opt-in: necesita que el cert esté autorizado
también para el servicio `ws_sr_padron_a13` en WSASS.

```bash
ARCA_CUIT=<tu cuit> ARCA_PADRON_A13=1 npm run test:integration
# Opcional: ARCA_PADRON_CUIT=<cuit a consultar> (default ARCA_CUIT)
```

Ver `docs/AMBIENTES.md` para más detalles sobre certs y entornos.

`contingencia.test.ts` (CAEA) también es opt-in: necesita un punto de venta
habilitado como CAEA en homologación. Simula la caída de ARCA y verifica que el
comprobante se emite con CAEA y se informa después.

```bash
ARCA_CUIT=<tu cuit> ARCA_CAEA_PTO_VTA=<pto vta CAEA> npm run test:integration
```

`http.test.ts` recorre la API HTTP como un POS: auth, emisión con PDF y headers
`X-Arca-*`, consulta, validaciones y CORS. Levanta el server en el proceso, o
prueba un deploy ya levantado (por ejemplo Docker):

```bash
ARCA_CUIT=<tu cuit> npm run test:integration                         # server en proceso
ARCA_E2E_URL=http://127.0.0.1:3001 ARCA_E2E_JWT_SECRET=<secreto> \
  npx vitest run tests/integration/http.test.ts                       # deploy existente
```

`tls.test.ts` llama a `FEDummy` de homologación y de producción (no necesita
certificados): detecta problemas de TLS con los servidores de ARCA.
