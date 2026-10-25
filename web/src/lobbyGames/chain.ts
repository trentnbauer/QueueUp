import type { ChainSnapshot } from '@queueup/shared';
import { FONT, drawPrompt, type Scene } from './kit';
import { QUIZ_QUESTION_Y, quizView } from './quiz';

function drawQuestion(sc: Scene<ChainSnapshot>): void {
  const { ctx, S, snapshot, theme } = sc;
  if (snapshot.question === '') {
    drawPrompt(sc, sc.t('spin.lobby.quiz.ready'));
    return;
  }
  drawPrompt(sc, sc.t('spin.lobby.chain.starts', { letter: snapshot.letter.toUpperCase() }));
  // The word on show, its last letter picked out: that is the letter the answer starts with.
  const head = snapshot.question.slice(0, -1);
  ctx.font = `800 ${Math.round(S * 0.11)}px ${FONT.display}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const headW = ctx.measureText(head).width;
  const tailW = ctx.measureText(snapshot.letter).width;
  const x = S / 2 - (headW + tailW) / 2;
  ctx.fillStyle = theme.text;
  ctx.fillText(head, x, QUIZ_QUESTION_Y * S);
  ctx.fillStyle = theme.accText;
  ctx.fillText(snapshot.letter, x + headW, QUIZ_QUESTION_Y * S);
  ctx.textAlign = 'center';
}

export const chainView = quizView<ChainSnapshot>({ nameKey: 'spin.lobby.chain.name', taglineKey: 'spin.lobby.chain.tagline', hintKey: 'spin.lobby.chain.hint' }, drawQuestion);
