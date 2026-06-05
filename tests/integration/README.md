# Tests E2E / Integración

Esta carpeta está reservada para tests de integración contra ARCA en
homologación (requieren certs `.crt`/`.key` reales y conexión a internet).

En la **versión pública** no se incluyen estos tests. La lógica de
WSAA, WSFEv1 y los flujos end-to-end están en la **versión completa**.

Si ya tenés la versión completa, los tests viven en `tests/integration/`
de ese repo. Para ejecutarlos:

```bash
# 1. Generá los certs de homologación desde
#    https://auth.afip.gob.ar/contribuyente_/login.xhtml
# 2. Ponelos en certs/homologacion/ (cert.pem, private.key)
# 3. Configurá ARCA_ENV=homologacion y ARCA_CUIT=<tu cuit>
# 4. Corré
npm run test:integration
```

Ver `docs/AMBIENTES.md` para más detalles sobre certs y entornos.
