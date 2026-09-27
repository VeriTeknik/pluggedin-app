/**
 * Serialize data for embedding inside an inline `<script type="application/ld+json">`.
 *
 * JSON.stringify leaves `<`, `>` and `&` as-is, so a value containing
 * `</script>` closes the element and whatever follows is parsed as HTML.
 * Escaping them as JSON unicode escapes keeps the output valid JSON with the
 * same decoded values, while the HTML parser never sees a tag. U+2028/U+2029
 * are escaped too so the text is also safe if ever evaluated as JavaScript.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
