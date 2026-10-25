import type { MathsSnapshot } from '@queueup/shared';
import { FONT, drawPrompt, type Scene } from './kit';
import { QUIZ_QUESTION_Y, quizView } from './quiz';

function drawQuestion(sc: Scene<MathsSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  if (snapshot.question === '') {
    drawPrompt(sc, sc.t('spin.lobby.quiz.ready'));
    return;
  }
  drawPrompt(sc, sc.t('spin.lobby.maths.solve'));
  ctx.font = `800 ${Math.round(S * 0.11)}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.text;
  ctx.fillText(snapshot.question, S / 2, QUIZ_QUESTION_Y * S);
}

export const mathsView = quizView<MathsSnapshot>({ nameKey: 'spin.lobby.maths.name', taglineKey: 'spin.lobby.maths.tagline', hintKey: 'spin.lobby.maths.hint' }, drawQuestion);
