import type { CSSProperties } from 'react';

const cache = new Map<string, CSSProperties>();

/** Splits on `;` but not inside parentheses (url(...), oklch(...) etc.). */
function splitDeclarations(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of input) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth--;
      cur += ch;
    } else if (ch === ';' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Turns a CSS declaration string ("display:flex;gap:8px") into a React style object. The design
 * handoff is written as inline style strings; this keeps the port close to the source so values
 * stay exact. Custom properties (`--x`) keep their name, everything else is camelCased. Results are
 * memoised per string, so call sites can pass literals freely in render. Extra declarations can be
 * appended (later wins) with `st(base, extra)`. */
export function st(css: string, extra?: CSSProperties): CSSProperties {
  let base = cache.get(css);
  if (!base) {
    base = {};
    for (const decl of splitDeclarations(css)) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      const rawProp = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (!rawProp || !value) continue;
      const prop = rawProp.startsWith('--') ? rawProp : rawProp.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      (base as Record<string, string>)[prop] = value;
    }
    cache.set(css, base);
  }
  return extra ? { ...base, ...extra } : base;
}
