/** Fastify's default query parser turns a repeated key (`?q=a&q=b`) into an array, which a route that reads `request.query.q` as a string would then fail on (`.trim` of an array
 * is a TypeError and a 500). No route takes an array from the query string, so every value is one string, the last given, and a key such as `__proto__` is an ordinary own property. */
export function parseQueryString(raw: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(raw));
}
