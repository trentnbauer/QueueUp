import type { PotatoSnapshot } from '@queueup/shared';
import type { LobbyGameView } from './index';
import { FONT, renderScene, type Scene, type SceneGame } from './kit';

/** Players stand on a ring round the middle of the arena (fractions of its side). */
const RING_R = 0.33;
const PLAYER_R = 0.05;

/** Where player `index` of `n` stands, clockwise from the top. */
function seat(index: number, n: number): { x: number; y: number } {
  const angle = (index / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + Math.cos(angle) * RING_R, y: 0.5 + Math.sin(angle) * RING_R };
}

function drawWorld(sc: Scene<PotatoSnapshot>): void {
  const { ctx, S, snapshot, theme, now } = sc;
  const n = snapshot.players.length;

  // The ring: a faint circle the players stand on.
  ctx.strokeStyle = 'oklch(1 0 0 / 0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, RING_R * S, 0, Math.PI * 2);
  ctx.stroke();

  for (const i of sc.order()) {
    const p = snapshot.players[i];
    if (!p.alive) continue; // out: the burst has taken them
    const at = seat(i, n);
    sc.drawPlayer(p.id, at.x * S, at.y * S, PLAYER_R * S, PLAYER_R * S);
  }

  // The bomb: held next to its holder, thrown across to the next one. It glows redder and shakes more as the fuse burns.
  const holderIndex = snapshot.players.findIndex((p) => p.id === snapshot.holderId);
  if (holderIndex >= 0 && snapshot.players[holderIndex].alive) {
    const at = seat(holderIndex, n);
    // Held toward the middle of the ring so it is not hidden by the player.
    const hx = at.x + (0.5 - at.x) * 0.3;
    const hy = at.y + (0.5 - at.y) * 0.3;
    const pos = sc.ease('bomb', hx, hy);
    const heat = snapshot.heat;
    const shake = heat * S * 0.006;
    const bx = pos.x * S + Math.sin(now / 35) * shake;
    const by = pos.y * S + Math.cos(now / 41) * shake;
    const r = S * 0.04 * (1 + heat * 0.25);
    ctx.save();
    ctx.shadowColor = theme.danger;
    ctx.shadowBlur = S * (0.02 + 0.07 * heat);
    ctx.fillStyle = `oklch(${0.28 + 0.35 * heat} ${0.04 + 0.16 * heat} 25)`;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The fuse and its spark.
    ctx.strokeStyle = 'oklch(0.8 0.05 80)';
    ctx.lineWidth = Math.max(2, S * 0.006);
    ctx.beginPath();
    ctx.moveTo(bx + r * 0.5, by - r * 0.8);
    ctx.quadraticCurveTo(bx + r * 0.9, by - r * 1.5, bx + r * 0.4, by - r * 1.8);
    ctx.stroke();
    ctx.fillStyle = `oklch(0.85 0.17 ${70 - 40 * heat})`;
    ctx.beginPath();
    ctx.arc(bx + r * 0.4, by - r * 1.8, r * (0.2 + 0.1 * Math.sin(now / 50)), 0, Math.PI * 2);
    ctx.fill();
  }

  // What to do now.
  ctx.font = `800 ${Math.round(S * 0.034)}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.text;
  if (snapshot.phase === 'playing' && snapshot.holderId === sc.me) ctx.fillText(sc.t('spin.lobby.potato.youHaveIt'), S / 2, S * 0.5);
  else if (snapshot.phase === 'playing' && snapshot.round > 0) ctx.fillText(sc.t('spin.lobby.potato.round', { n: snapshot.round }), S / 2, S * 0.5);
}

const scene: SceneGame<PotatoSnapshot> = {
  scroll: 'y',
  drawWorld,
  anchor: (snapshot, index) => seat(index, snapshot.players.length),
};

export const potatoView: LobbyGameView<PotatoSnapshot> = {
  // One button: Pass (Space or Up), or tap anywhere on the arena.
  pad: 'none',
  actions: [{ name: 'pass', labelKey: 'spin.lobby.potato.pass', keys: [' ', 'ArrowUp', 'w'] }],
  tapAction: 'pass',
  nameKey: 'spin.lobby.potato.name',
  taglineKey: 'spin.lobby.potato.tagline',
  hintKey: 'spin.lobby.potato.hint',
  draw: (args) => renderScene(args, scene),
  standings: (snapshot) => snapshot.players.map((p) => ({ id: p.id, score: p.wins, active: p.alive })).sort((a, b) => b.score - a.score),
};
