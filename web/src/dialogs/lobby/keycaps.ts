/** The little keyboard hint printed on a control button ("SPACE", "↓", "A"). Prefers Space, then an
 * arrow, then a letter, so a button that answers to several keys shows the most recognisable one. */
export function keycapOf(keys: string[]): string {
  const names: Record<string, string> = { ' ': 'SPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  const pick = keys.find((k) => k === ' ') ?? keys.find((k) => k.startsWith('Arrow')) ?? keys.find((k) => k.length === 1) ?? keys[0] ?? '';
  return names[pick] ?? pick.toUpperCase();
}
