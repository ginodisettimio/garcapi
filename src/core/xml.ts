/**
 * Helpers mínimos para leer las respuestas SOAP de ARCA.
 *
 * Las respuestas de WSAA/WSFEv1 son planas y con tags de nombre único
 * por nivel, así que alcanza con regex (tolerante a prefijos de
 * namespace como `soap:` o `ns1:`).
 */

function tagRegex(name: string, flags: string): RegExp {
  return new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, flags)
}

/** Devuelve el contenido del primer `<name>…</name>`, o null si no está. */
export function tag(xml: string, name: string): string | null {
  const m = tagRegex(name, '').exec(xml)
  return m ? m[1]!.trim() : null
}

/** Devuelve el contenido de todos los `<name>…</name>`. */
export function tags(xml: string, name: string): string[] {
  return Array.from(xml.matchAll(tagRegex(name, 'g')), (m) => m[1]!.trim())
}

/** Escapa texto para meterlo dentro de un elemento XML. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Revierte `escapeXml` (WSAA devuelve el TA como XML escapado dentro del SOAP). */
export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;|&#13;/g, '\r')
    .replace(/&amp;/g, '&')
}
