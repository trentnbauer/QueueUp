/** The viewer's own piece, drawn answering a press at once instead of a round trip later. The server only hears about a press a moment after it is made and
 * sends the result about 15 times a second, so a game that runs on the server shows your own piece late. Here it moves on its own between snapshots,
 * the way the rules would move it for the direction you are holding (`step`), and is pulled back toward where the server says it is (`pull` a second) so
 * the two never drift far apart. Kept between frames per effects object and `slot`. */
const states = new WeakMap<object, Map<string, { value: number; at: number }>>();

export function predictOwn(owner: object, slot: string, now: number, server: number, step: (value: number, dt: number) => number, pull = 6): number {
  let slots = states.get(owner);
  if (!slots) states.set(owner, (slots = new Map()));
  const last = slots.get(slot) ?? { value: server, at: now };
  const dt = Math.min(0.1, Math.max(0, (now - last.at) / 1000));
  let value = step(last.value, dt);
  value += (server - value) * Math.min(1, dt * pull);
  slots.set(slot, { value, at: now });
  return value;
}
