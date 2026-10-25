import { ENDLESS_LIVES, type TempoJudge, type TempoSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, STRIP_Y, drawLives, drawPrompt, drawStandings, renderScene, stripX, type Scene, type SceneGame } from './kit';
import type { TapTargets } from './taps';

// Where things are on the arena, as fractions of its side: the caption on the prompt line, the beat in the middle, the silent beats as dots, and the gauge.
const CX = 0.5;
const CY = 0.46;
const RING = 0.15;
const DOTS_Y = 0.72;
const GAUGE_Y = 0.86;
const GAUGE_W = 0.7;
/** How long a judgement shows. */
const LASTING_MS = 700;

/** The whole arena is the one target: tap anywhere (or press Space) on the beat. */
export const TEMPO_TAPS: TapTargets = { cols: 1, rows: 1, keys: [' '] };

function colourOf(sc: Scene<TempoSnapshot>, kind: TempoJudge | null): string {
  if (kind === 'great') return sc.theme.mint;
  if (kind === 'good') return sc.theme.star;
  if (kind === null) return 'oklch(1 0 0 / 0.18)';
  return sc.theme.danger;
}

function drawWorld(sc: Scene<TempoSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  const playing = snapshot.phase === 'playing';
  const age = playing ? sc.fx.age(snapshot, sc.now) : 0;
  const mine = snapshot.players.find((p) => p.id === sc.me);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // The beat: a ring that flashes outward on each guide tick, and stays dim while it is silent.
  ctx.lineWidth = S * 0.012;
  ctx.strokeStyle = snapshot.stage === 'play' ? 'oklch(1 0 0 / 0.1)' : 'oklch(1 0 0 / 0.2)';
  ctx.beginPath();
  ctx.arc(CX * S, CY * S, RING * S, 0, Math.PI * 2);
  ctx.stroke();
  for (const tick of snapshot.ticks) {
    const since = -(tick.inMs - age * 1000);
    if (since < 0 || since > 450) continue;
    const k = since / 450;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = theme.acc;
    ctx.lineWidth = S * (0.03 * (1 - k) + 0.006);
    ctx.beginPath();
    ctx.arc(CX * S, CY * S, (RING + 0.09 * k) * S, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const caption = snapshot.stage === 'guide' ? 'spin.lobby.tempo.listen' : snapshot.stage === 'play' ? 'spin.lobby.tempo.keep' : 'spin.lobby.tempo.rest';
  drawPrompt(sc, sc.t(caption), snapshot.stage === 'play' ? 'go' : 'text');
  ctx.font = `600 ${Math.round(S * 0.024)}px ${FONT.mono}`;
  ctx.fillStyle = theme.accText;
  ctx.fillText(sc.t('spin.lobby.tempo.round', { n: snapshot.round, bpm: snapshot.bpm }), CX * S, CY * S);

  // The silent beats as dots: lit by how each of yours went.
  const n = snapshot.silent;
  const dot = Math.min(0.022, 0.8 / (n * 2.6));
  const marks = mine?.marks ?? [];
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = colourOf(sc, marks[k] ?? null);
    ctx.beginPath();
    ctx.arc((CX + (k - (n - 1) / 2) * dot * 2.6) * S, DOTS_Y * S, dot * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // How far from the beat your last tap was: a gauge with the margin in the middle and a mark where it fell (left is early, right is late).
  const last = mine?.last;
  const w = GAUGE_W * S;
  ctx.fillStyle = 'oklch(1 0 0 / 0.1)';
  ctx.fillRect(CX * S - w / 2, GAUGE_Y * S, w, S * 0.01);
  // The gauge spans three margins either side, so the margin itself is a third of each half.
  ctx.fillStyle = theme.mint;
  const tol = snapshot.tolMs;
  const half = w / 2 / 3;
  ctx.fillRect(CX * S - half, GAUGE_Y * S - S * 0.006, half * 2, S * 0.022);
  if (last && last.agoMs < LASTING_MS) {
    const fade = 1 - last.agoMs / LASTING_MS;
    ctx.save();
    ctx.globalAlpha = fade;
    const x = CX * S + Math.max(-1, Math.min(1, last.errMs / (tol * 3))) * (w / 2);
    ctx.fillStyle = last.kind === 'miss' ? theme.danger : colourOf(sc, last.kind);
    ctx.fillRect(x - 2, GAUGE_Y * S - S * 0.02, 4, S * 0.05);
    ctx.font = `800 ${Math.round(S * 0.04)}px ${FONT.display}`;
    ctx.fillText(sc.t(`spin.lobby.tempo.${last.kind}` as 'spin.lobby.tempo.great'), CX * S, (GAUGE_Y - 0.07) * S);
    ctx.restore();
  }

  // Everyone in the run, with their points and lives.
  drawStandings(sc, { under: (p, cx, y) => drawLives(ctx, cx, y, p.lives, ENDLESS_LIVES, S * 0.01, theme.danger) });
}

const scene: SceneGame<TempoSnapshot> = {
  scroll: 'y',
  taps: TEMPO_TAPS,
  drawWorld,
  anchor: (snapshot, index) => ({ x: stripX(snapshot.players.length, index), y: STRIP_Y }),
};

export const tempoView: LobbyGameView<TempoSnapshot> = {
  // The arena is the controller: no pad and nothing under the arena.
  pad: 'none',
  actions: [],
  taps: TEMPO_TAPS,
  nameKey: 'spin.lobby.tempo.name',
  taglineKey: 'spin.lobby.tempo.tagline',
  hintKey: 'spin.lobby.tempo.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
