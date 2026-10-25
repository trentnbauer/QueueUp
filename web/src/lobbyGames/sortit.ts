import { ENDLESS_LIVES, type SortitItem, type SortitSnapshot } from '@queueup/shared';
import type { MessageKey } from '../i18n';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, drawBadge, drawLives, drawPrompt, drawStandings, renderScene, roundRect, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: the rule on the prompt line, a hint of the next one, the belt (coming down the middle to a line), then two bins.
const NEXT_Y = 0.325;
const TOP = 0.36;
const LINE = 0.58;
const BIN_Y = 0.65;
const BIN_W = 0.44;
const BIN_H = 0.3;
const BIN_X = 0.04;
/** How long a judgement shows. */
const LASTING_MS = 600;
const COLOURS = [25, 250];

const binRect = (side: number): TapRect => ({ x: side === 0 ? BIN_X : 1 - BIN_X - BIN_W, y: BIN_Y, w: BIN_W, h: BIN_H });

/** The two bins are the controller: each is a tap target, drawn exactly where it is hit. On a keyboard the left and right arrows do the same. */
export const SORTIT_TAPS: TapTargets = { rects: [binRect(0), binRect(1)], keys: ['ArrowLeft', 'ArrowRight'] };

const RULE_KEYS: MessageKey[] = ['spin.lobby.sortit.rule.0', 'spin.lobby.sortit.rule.1', 'spin.lobby.sortit.rule.2'];
const BIN_KEYS: MessageKey[][] = [
  ['spin.lobby.sortit.bin.0.0', 'spin.lobby.sortit.bin.0.1'],
  ['spin.lobby.sortit.bin.1.0', 'spin.lobby.sortit.bin.1.1'],
  ['spin.lobby.sortit.bin.2.0', 'spin.lobby.sortit.bin.2.1'],
];

/** A circle or a square, red or blue, small or big, centred on (cx, cy). Colour is never the only clue: the shapes and sizes are drawn too. */
function drawThing(ctx: CanvasRenderingContext2D, cx: number, cy: number, S: number, colour: number, shape: number, size: number): void {
  const r = S * (size === 0 ? 0.035 : 0.06);
  ctx.fillStyle = `oklch(0.66 0.17 ${COLOURS[colour]})`;
  ctx.beginPath();
  if (shape === 0) ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else ctx.rect(cx - r * 0.9, cy - r * 0.9, r * 1.8, r * 1.8);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'oklch(1 0 0 / 0.5)';
  ctx.stroke();
}

/** What a bin takes under a rule: a picture of the value that goes in it (the rest of the item is plain). */
function drawBinIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, S: number, rule: number, side: number): void {
  // The other two values are plain: a neutral, middling colour, a circle, a middling size.
  if (rule === 0) drawThing(ctx, cx, cy, S, side, 0, 1);
  else if (rule === 1) drawThing(ctx, cx, cy, S, 1, side, 1);
  else drawThing(ctx, cx, cy, S, 1, 0, side);
}

function drawWorld(sc: Scene<SortitSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const playing = snapshot.phase === 'playing';
  const age = playing ? sc.fx.age(snapshot, sc.now) : 0;
  const mine = snapshot.players.find((p) => p.id === sc.me);
  const done = new Set(mine?.done ?? []);

  // The belt, and the line the items are sorted at.
  ctx.fillStyle = 'oklch(1 0 0 / 0.045)';
  ctx.fillRect(0.4 * S, TOP * S, 0.2 * S, (LINE - TOP) * S + 8);
  ctx.fillStyle = theme.acc;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(0.34 * S, LINE * S, 0.32 * S, 3);
  ctx.globalAlpha = 1;

  // The rule in force for the oldest item you have not dealt with, and a hint if the rule is about to change.
  const waiting = snapshot.items.filter((i) => !done.has(i.n));
  const current = waiting[0] ?? snapshot.items[snapshot.items.length - 1];
  const rule = current?.rule ?? 0;
  drawPrompt(sc, sc.t(RULE_KEYS[rule]));
  const next = waiting.find((i) => i.rule !== rule);
  if (next && playing) {
    ctx.font = `600 ${Math.round(S * 0.024)}px ${FONT.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.accText;
    ctx.fillText(sc.t('spin.lobby.sortit.next', { rule: sc.t(RULE_KEYS[next.rule]) }), S / 2, NEXT_Y * S);
  }

  // The items on the belt, oldest at the bottom (nearest the line). The ones you have sorted or let go by are gone.
  const visible: SortitItem[] = snapshot.items.filter((i) => !done.has(i.n)).reverse();
  for (const item of visible) {
    const left = item.inMs - age * 1000;
    const k = 1 - left / item.travelMs; // 0 at the top, 1 at the line
    const y = (TOP + (LINE - TOP) * k) * S;
    if (y < (TOP - 0.05) * S) continue;
    drawThing(ctx, S / 2, y, S, item.colour, item.shape, item.size);
  }

  // The two bins, showing what goes in each under the rule.
  for (let side = 0; side < 2; side++) {
    const r = binRect(side);
    roundRect(ctx, r.x * S, r.y * S, r.w * S, r.h * S, S * 0.035);
    ctx.fillStyle = 'oklch(1 0 0 / 0.08)';
    ctx.fill();
    ctx.strokeStyle = theme.acc;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawBinIcon(ctx, (r.x + r.w / 2) * S, (r.y + r.h * 0.4) * S, S, rule, side);
    ctx.font = `700 ${Math.round(S * 0.03)}px ${FONT.mono}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(sc.t(BIN_KEYS[rule][side]), (r.x + r.w / 2) * S, (r.y + r.h * 0.84) * S);
  }

  // Everyone in the run, with their items sorted and lives.
  drawStandings(sc, { under: (p, cx, y) => drawLives(ctx, cx, y, p.lives, ENDLESS_LIVES, S * 0.01, theme.danger) });

  // Your last sort, over the line, fading.
  const last = mine?.last;
  if (last && last.agoMs < LASTING_MS) {
    const fade = 1 - last.agoMs / LASTING_MS;
    ctx.save();
    ctx.globalAlpha = fade;
    drawBadge(ctx, S * 0.74, (LINE - (1 - fade) * 0.04) * S, S * 0.03, last.kind === 'right' ? 'ok' : last.kind === 'wrong' ? 'no' : 'late', theme);
    ctx.restore();
  }
}

const scene: SceneGame<SortitSnapshot> = {
  scroll: 'y',
  taps: SORTIT_TAPS,
  drawWorld,
  // Out, a player bursts where they stand in the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const sortitView: LobbyGameView<SortitSnapshot> = {
  // The two bins are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: SORTIT_TAPS,
  nameKey: 'spin.lobby.sortit.name',
  taglineKey: 'spin.lobby.sortit.tagline',
  hintKey: 'spin.lobby.sortit.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
