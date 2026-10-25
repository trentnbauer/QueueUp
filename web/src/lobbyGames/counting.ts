import type { CountingSnapshot } from '@queueup/shared';
import { drawPrompt, roundRect, type Scene } from './kit';
import { quizView } from './quiz';

// The shapes fill one field under the prompt line while they are on show (the answer panels are not drawn until they are gone).
const FIELD_X = 0.1;
const FIELD_Y = 0.34;
const FIELD_W = 0.8;
const FIELD_H = 0.6;
const SHAPE_R = 0.028;
/** The two kinds are told apart by shape, not only colour: a circle and a square. */
const KIND_HUES = [25, 250];

function drawQuestion(sc: Scene<CountingSnapshot>): void {
  const { ctx, S, snapshot } = sc;
  if (snapshot.asked === 0) {
    drawPrompt(sc, sc.t('spin.lobby.quiz.ready'));
    return;
  }
  drawPrompt(sc, sc.t('spin.lobby.counting.how', { kind: sc.t(snapshot.kind === 0 ? 'spin.lobby.counting.kind.0' : 'spin.lobby.counting.kind.1') }));
  if (snapshot.stage !== 'show') return;
  for (const item of snapshot.items) {
    const cx = (FIELD_X + item.x * FIELD_W) * S;
    const cy = (FIELD_Y + item.y * FIELD_H) * S;
    const r = SHAPE_R * S;
    ctx.fillStyle = `oklch(0.7 0.16 ${KIND_HUES[item.kind]})`;
    if (item.kind === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.25);
      ctx.fill();
    }
  }
}

export const countingView = quizView<CountingSnapshot>({ nameKey: 'spin.lobby.counting.name', taglineKey: 'spin.lobby.counting.tagline', hintKey: 'spin.lobby.counting.hint' }, drawQuestion, (snapshot) => snapshot.stage !== 'show');
