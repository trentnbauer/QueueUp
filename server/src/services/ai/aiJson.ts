/** Pulls a JSON value out of a model reply. Models often wrap JSON in a code fence or add a line
 * before it, so this takes the first fenced block if there is one, else the outermost [...] or
 * {...}. Returns null when nothing parses; callers must still validate the shape (a reply is
 * untrusted text, never trusted structure). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  for (const raw of [fenced?.[1], text]) {
    if (!raw) continue;
    const trimmed = raw.trim();
    const tries = [trimmed];
    const arr = trimmed.match(/\[[\s\S]*\]/);
    const obj = trimmed.match(/\{[\s\S]*\}/);
    if (arr) tries.push(arr[0]);
    if (obj) tries.push(obj[0]);
    for (const t of tries) {
      try {
        return JSON.parse(t);
      } catch {
        // try the next shape
      }
    }
  }
  return null;
}
