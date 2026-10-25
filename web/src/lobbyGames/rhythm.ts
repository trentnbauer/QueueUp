import { ENDLESS_LIVES, RHYTHM_GOOD_S, RHYTHM_GREAT_S, RHYTHM_LANES, type RhythmSnapshot } from '@queueup/shared';
import type { MessageKey } from '../i18n';
import type { LobbyGameView } from './index';
import { FONT, STAGE, STRIP_Y, coverTile, drawLives, drawStandings, hueOf, renderScene, rememberSnapshot, stripX, type Scene, type SceneGame } from './kit';
import type { TapRect, TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: four lanes under the standings strip, down to the line the notes are tapped on.
const LANES_X = 0.08;
const LANE_W = (1 - 2 * LANES_X) / RHYTHM_LANES;
const TOP = 0.3;
const LINE = 0.84;
const NOTE_H = 0.05;
/** How long a judgement (GREAT, MISS...) shows. */
const LASTING_MS = 600;
const KEYS = ['D', 'F', 'J', 'K'];
const JUDGE_KEYS: Record<string, MessageKey> = { great: 'spin.lobby.rhythm.great', good: 'spin.lobby.rhythm.good', miss: 'spin.lobby.rhythm.miss', wrong: 'spin.lobby.rhythm.wrong' };

const laneRect = (i: number): TapRect => ({ x: LANES_X + i * LANE_W, y: TOP, w: LANE_W, h: 0.96 - TOP });

/** The lanes are the controller: each is a tall tap target (anywhere in it counts), drawn exactly where it is hit. On a keyboard D, F, J and K do the same. */
export const RHYTHM_TAPS: TapTargets = { rects: Array.from({ length: RHYTHM_LANES }, (_, i) => laneRect(i)), keys: ['d', 'f', 'j', 'k'] };

/** How long ago your last tap or miss was, as of the last snapshot drawn (null for none). */
const previousLast = rememberSnapshot<{ ago: number | null }>();

/** A great hit of yours bursts into confetti on the line, in the lane you hit. Good hits and other people's are left alone, so it stays a treat. */
function celebrate(sc: Scene<RhythmSnapshot>): void {
  const { snapshot } = sc;
  const mine = snapshot.players.find((p) => p.id === sc.me)?.last ?? null;
  const before = previousLast(snapshot, () => ({ ago: mine ? mine.agoMs : null }));
  if (!before || !mine || mine.kind !== 'great') return;
  // A new hit has come since the last snapshot when there was none then, or it was longer ago than this one is.
  if (before.ago === null || mine.agoMs < before.ago) sc.fx.confettiAt(LANES_X + (mine.lane + 0.5) * LANE_W, LINE, sc.info(sc.me).color, 12);
}

function drawWorld(sc: Scene<RhythmSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const age = snapshot.phase === 'playing' ? sc.fx.age(snapshot, sc.now) : 0;
  celebrate(sc);
  const mine = snapshot.players.find((p) => p.id === sc.me);

  // The lanes, with the line the notes are tapped on.
  for (let i = 0; i < RHYTHM_LANES; i++) {
    const r = laneRect(i);
    ctx.fillStyle = i % 2 === 0 ? 'oklch(1 0 0 / 0.045)' : 'oklch(1 0 0 / 0.025)';
    ctx.fillRect(r.x * S, r.y * S, r.w * S, r.h * S);
  }
  // The hit zone: where a note's middle must be when you tap. It is the real timing window turned into distance (how far a note falls in
  // that time), so it stretches as the notes speed up. The outer band is a good hit, the inner one a great hit.
  const nearest = snapshot.notes.reduce<(typeof snapshot.notes)[number] | null>((a, n) => (!a || Math.abs(n.inMs) < Math.abs(a.inMs) ? n : a), null);
  const perSecond = (LINE - TOP) / ((nearest?.fallMs ?? 1400) / 1000);
  const good = RHYTHM_GOOD_S * perSecond;
  const great = RHYTHM_GREAT_S * perSecond;
  const zoneX = LANES_X * S;
  const zoneW = (1 - 2 * LANES_X) * S;
  ctx.fillStyle = theme.acc;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(zoneX, (LINE - good) * S, zoneW, good * 2 * S);
  ctx.fillStyle = theme.mint;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(zoneX, (LINE - great) * S, zoneW, great * 2 * S);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = theme.acc;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(zoneX, (LINE - good) * S, zoneW, good * 2 * S);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = theme.acc;
  ctx.fillRect(zoneX, LINE * S - 1, zoneW, 3);
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.round(S * 0.02)}px ${FONT.mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = theme.accText;
  ctx.fillText(sc.t('spin.lobby.rhythm.zone'), zoneX + S * 0.008, (LINE - good) * S - S * 0.006);
  ctx.font = `700 ${Math.round(S * 0.026)}px ${FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = STAGE.groundTick;
  for (let i = 0; i < RHYTHM_LANES; i++) ctx.fillText(KEYS[i], (LANES_X + (i + 0.5) * LANE_W) * S, (LINE + 0.065) * S);

  // The notes: game covers falling down the lanes, each reaching the line at its moment. The ones you have hit or let by are gone.
  const done = new Set(mine?.done ?? []);
  for (const note of snapshot.notes) {
    if (done.has(note.n)) continue;
    const left = note.inMs - age * 1000;
    const k = 1 - left / note.fallMs; // 0 at the top, 1 at the line
    const y = (TOP + (LINE - TOP) * k) * S;
    if (y < (TOP - NOTE_H) * S || y > S) continue;
    const w = LANE_W * S * 0.84;
    coverTile(ctx, (LANES_X + (note.lane + 0.5) * LANE_W) * S - w / 2, y - (NOTE_H * S) / 2, w, NOTE_H * S, hueOf(note.n), S * 0.012, true);
  }

  // Everyone in the run, with their points and lives.
  drawStandings(sc, { under: (p, cx, y) => drawLives(ctx, cx, y, p.lives, ENDLESS_LIVES, S * 0.01, theme.danger) });

  // What your last tap or miss was, over the line, fading.
  const last = mine?.last;
  if (last && last.agoMs < LASTING_MS) {
    const fade = 1 - last.agoMs / LASTING_MS;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = last.kind === 'great' ? theme.mint : last.kind === 'good' ? theme.star : theme.danger;
    ctx.fillRect((LANES_X + last.lane * LANE_W) * S, (LINE - 0.1) * S, LANE_W * S, 0.1 * S);
    ctx.font = `800 ${Math.round(S * 0.05)}px ${FONT.display}`;
    ctx.textAlign = 'center';
    ctx.fillText(sc.t(JUDGE_KEYS[last.kind]), S / 2, (LINE - 0.1 - (1 - fade) * 0.04) * S);
    ctx.restore();
  }
}

const scene: SceneGame<RhythmSnapshot> = {
  scroll: 'y',
  taps: RHYTHM_TAPS,
  drawWorld,
  // Out, a player bursts where they stand in the standings strip.
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const rhythmView: LobbyGameView<RhythmSnapshot> = {
  // The lanes are the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: RHYTHM_TAPS,
  nameKey: 'spin.lobby.rhythm.name',
  taglineKey: 'spin.lobby.rhythm.tagline',
  hintKey: 'spin.lobby.rhythm.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
