import { FONT } from './theme';
import type { Scene } from './scene';

/** Where the "what to do now" line sits by default, as a fraction of the arena: under the standings strip, above the world. */
export const PROMPT_Y = 0.275;

export type PromptTone = 'text' | 'go' | 'warn' | 'accent';

/** The one line telling people what to do now ("Your turn", "Round 3", "Stop it!"). One font, one size, sentence case. Pass `y` only when the
 * game's world needs the line somewhere else (it must still be the only prompt on screen). */
export function drawPrompt(sc: Scene, text: string, tone: PromptTone = 'text', y = PROMPT_Y): void {
  if (!text) return;
  const { ctx, S, theme } = sc;
  ctx.font = `800 ${Math.round(S * 0.044)}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tone === 'go' ? theme.mint : tone === 'warn' ? theme.danger : tone === 'accent' ? theme.accText : theme.text;
  ctx.fillText(text, S / 2, y * S);
}

/** The share of the time left below which the timer turns to the danger colour. */
const TIMER_WARN = 0.3;

/** Time left in a round or a pick, as a thin bar along the very top edge with a faint track under it. `left` is 0..1; null draws nothing. */
export function drawTimer(sc: Scene, left: number | null): void {
  if (left === null || !Number.isFinite(left)) return;
  const { ctx, S, theme } = sc;
  const h = S * 0.008;
  const k = Math.max(0, Math.min(1, left));
  ctx.fillStyle = 'oklch(1 0 0 / 0.08)';
  ctx.fillRect(0, 0, S, h);
  ctx.fillStyle = k < TIMER_WARN ? theme.danger : theme.acc;
  ctx.fillRect(0, 0, S * k, h);
}

/** A canvas font for an emoji, so it is drawn in colour on every system (Geist has no emoji). */
export function emojiFont(px: number): string {
  return `${Math.round(px)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",${FONT.ui}`;
}
