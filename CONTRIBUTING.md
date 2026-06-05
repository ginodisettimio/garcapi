# Contributing

¡Gracias por interesarte en Arca-api-Tordini!

## Setup local

```bash
git clone https://github.com/tordini/arca-api-tordini.git
cd arca-api-tordini
npm install
```

## Flujo de trabajo

1. Fork + branch: `git checkout -b feature/mi-feature`
2. Implementá con tests.
3. Verificá: `npm run lint && npm run typecheck && npm test`
4. Commit con mensaje descriptivo (ver formato abajo).
5. Push y abrí PR.

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: agregar soporte para FCE
fix: corregir validación de IVA en comprobante C
docs: actualizar README con ejemplo de Docker
test: agregar tests de WsaaClient
refactor: extraer parseTa a helper
chore: actualizar tsconfig
```

## Estilo de código

- TypeScript strict, sin `any`.
- Español para mensajes al usuario, inglés para nombres de variables/tipos.
- Sin comentarios innecesarios; el código se autodocumenta.
- Imports agrupados: stdlib, externos, internos.
- Naming: camelCase para variables/funciones, PascalCase para clases, UPPER_SNAKE_CASE para constantes.

## Tests

- Tests unitarios para `domain/` y `services/` con mocks.
- Tests de integración **no** se corren en CI (dependen de certs reales).
- Usá `MemoryTaStorage` y `FakeSoapClient` para aislar el código bajo test.

```bash
npm test                # corre una vez
npm run test:watch      # watch mode
npm run test:coverage   # con coverage
```

## Reportar bugs

Abrí un issue con:
- Versión (`npm list arca-api-tordini`)
- Node version (`node --version`)
- OS
- Pasos para reproducir
- Log completo del error
- Si aplica: TA/xml de la request

## Pull Requests

- Una feature por PR.
- Incluí tests.
- Actualizá el README/API.md si corresponde.
- Asegurate de que el CI pase.
