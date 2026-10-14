import { FONT, STAGE, type StageTheme } from './theme';

/** Drawing building blocks shared by every lobby game, so they all look like one family. Sizes are
 * fractions of `S`, the arena's side in pixels, so everything scales with the canvas. */

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A stable colour for a numbered thing (an obstacle, a pipe): the same number always gives the same hue. */
export function hueOf(n: number): number {
  return (n * 67 + 20) % 360;
}

/** A game-cover tile, the way QueueUp draws a cover with no image (coverGradient in ui/primitives): a
 * tilted two-tone gradient, a soft highlight and a thin edge. Every obstacle in every game is one of
 * these, so the arena looks like it is made of the app's own library. `shade` darkens the bottom (for
 * something standing on the ground). */
export function coverTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hue: number, radius: number, shade = false): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  const lg = ctx.createLinearGradient(x + w * 0.33, y, x + w * 0.67, y + h);
  lg.addColorStop(0, `oklch(0.42 0.09 ${hue})`);
  lg.addColorStop(1, `oklch(0.22 0.05 ${(hue + 50) % 360})`);
  ctx.fillStyle = lg;
  ctx.fillRect(x, y, w, h);
  const reach = Math.max(w, h) * 0.75;
  const rg = ctx.createRadialGradient(x + w * 0.2, y + h * 0.1, 0, x + w * 0.2, y + h * 0.1, reach);
  rg.addColorStop(0, `oklch(0.6 0.12 ${hue} / 0.55)`);
  rg.addColorStop(0.6, `oklch(0.6 0.12 ${hue} / 0)`);
  ctx.fillStyle = rg;
  ctx.fillRect(x, y, w, h);
  if (shade) {
    const sg = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
    sg.addColorStop(0, 'oklch(0 0 0 / 0)');
    sg.addColorStop(1, 'oklch(0 0 0 / 0.55)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.strokeStyle = STAGE.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A soft shadow on the ground under something. `k` (0..1) shrinks and fades it as the thing rises. */
export function groundShadow(ctx: CanvasRenderingContext2D, cx: number, groundY: number, rx: number, k = 1): void {
  ctx.fillStyle = `oklch(0 0 0 / ${0.35 * k})`;
  ctx.beginPath();
  ctx.ellipse(cx, groundY, rx * (0.6 + 0.5 * k), rx * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

export interface AvatarSpec {
  cx: number;
  cy: number;
  /** Half-width and half-height: equal for a circle; taller than wide draws a capsule. */
  rx: number;
  ry: number;
  color: string;
  initial: string;
  isMe: boolean;
}

/** A player: their colour with a gloss and their initial. Everyone else gets a thin light outline; the
 * viewer gets the accent outline and glow and a small "YOU" tag above, so you can always find yourself
 * in a crowd. */
export function avatar(ctx: CanvasRenderingContext2D, a: AvatarSpec, S: number, theme: StageTheme, youLabel: string): void {
  const { cx, cy, rx, ry, color, initial, isMe } = a;
  const capsule = ry > rx * 1.15;
  const shape = () => {
    if (capsule) roundRect(ctx, cx - rx, cy - ry, rx * 2, ry * 2, rx);
    else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
  };
  ctx.save();
  if (isMe) {
    ctx.shadowColor = theme.accGlow;
    ctx.shadowBlur = S * 0.035;
  }
  shape();
  const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, color);
  g.addColorStop(1, color + 'cc');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = isMe ? Math.max(2, S * 0.007) : 1.5;
  ctx.strokeStyle = isMe ? theme.acc : 'oklch(1 0 0 / 0.35)';
  shape();
  ctx.stroke();

  const glossY = capsule ? cy - ry + rx : cy;
  ctx.fillStyle = 'oklch(1 0 0 / 0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.32, glossY - rx * 0.45, rx * 0.32, rx * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(rx * 1.05)}px ${FONT.ui}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, cx, glossY + 1);

  if (isMe) {
    const tagY = cy - ry - S * 0.04;
    const size = Math.round(S * 0.026);
    ctx.font = `600 ${size}px ${FONT.mono}`;
    const width = ctx.measureText(youLabel).width + size;
    roundRect(ctx, cx - width / 2, tagY - size * 0.75, width, size * 1.5, size * 0.75);
    ctx.fillStyle = theme.acc;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 4, tagY + size * 0.7);
    ctx.lineTo(cx + 4, tagY + size * 0.7);
    ctx.lineTo(cx, tagY + size * 0.7 + 4);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.fillText(youLabel, cx, tagY + 1);
  }
}

/** Text with a dark outline, readable over any background. */
export function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, family: string = FONT.display, align: CanvasTextAlign = 'center'): void {
  ctx.font = `800 ${Math.round(size)}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 8);
  ctx.strokeStyle = STAGE.ink;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
