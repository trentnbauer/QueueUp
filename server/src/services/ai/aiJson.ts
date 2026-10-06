/** Pulls a JSON value out of a model reply. Models often wrap JSON in a code fence or add a line
 * before it, so this takes the first fenced block if there is one, else the outermost [...] or
 * {...}. Returns null when nothing parses; callers must still validate the shape (a reply is
 * untrusted text, never trusted structure). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  for (const raw of [fenced?.[1], text]) {
    if (!raw) continue;
    const trimmed = raw.trim();
    const arr = trimmed.match(/\[[\s\S]*\]/);
    const whole = arr ? [trimmed, arr[0]] : [trimmed];
    for (const t of whole) {
      try {
        return JSON.parse(t);
      } catch {
        // try the next shape
      }
    }
    // A list that was cut off part-way: keep its complete objects (before the loose {...} match below,
    // which would otherwise return just the first one).
    if (trimmed.startsWith('[')) {
      const partial = salvageObjects(trimmed);
      if (partial.length) return partial;
    }
    const obj = trimmed.match(/\{[\s\S]*\}/);
    if (obj) {
      try {
        return JSON.parse(obj[0]);
      } catch {
        // nothing parses in this text
      }
    }
  }
  // Last resort: a list the model ran out of room to finish. Keep the complete objects before the cut.
  const partial = salvageObjects(fenced?.[1] ?? text);
  return partial.length ? partial : null;
}

/** The complete `{...}` objects of a JSON list that was cut off part-way (the model hit its output
 * limit), in order. Anything after the last complete object is dropped. Empty when there is no list
 * or no complete object in it. */
export function salvageObjects(text: string): unknown[] {
  const start = text.indexOf('[');
  if (start === -1) return [];
  const out: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0 && objStart !== -1) {
        try {
          out.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          // skip an object that is not valid JSON
        }
        objStart = -1;
      } else if (depth < 0) {
        depth = 0;
      }
    }
  }
  return out;
}
