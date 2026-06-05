#!/usr/bin/env node
/**
 * Versión pública — la implementación está en la versión completa.
 * Ver https://mpago.la/31zH7xo para obtener acceso al código fuente.
 */

const PLACEHOLDER = 'Disponible en la versión completa — https://mpago.la/31zH7xo'

console.log('='.repeat(70))
console.log(' generate-tra.ts — Versión pública')
console.log('='.repeat(70))
console.log('')
console.log(PLACEHOLDER)
console.log('')
console.log('El script original genera el archivo TRA (Ticket Request Access)')
console.log('y lo guarda en certs/<env>/tra.xml. La versión completa incluye:')
console.log('  - generate-tra.ts   (TRA)')
console.log('  - sign-cms.ts       (firma CMS con OpenSSL)')
console.log('  - submit-login.ts   (loginCms → TA)')
console.log('  - wsfev1-dummy.ts   (conectividad)')
console.log('  - wsfev1-params.ts  (parámetros WSFEv1)')
console.log('  - pipeline.ts       (TRA→CMS→TA→Dummy→FEParamGet)')
console.log('')
process.exit(1)

export {}
