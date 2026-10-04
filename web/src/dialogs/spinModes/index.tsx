import type { SpinPlay, SpinPlayMode } from '@queueup/shared';
import type { ModeProps } from './shared';
import { CardVoteMode } from './CardVoteMode';
import { SlotMode } from './SlotMode';
import { KnockoutMode } from './KnockoutMode';
import { PlinkoMode } from './PlinkoMode';
import { PlinkoStakeMode } from './PlinkoStakeMode';
import { BanDraftMode } from './BanDraftMode';
import { RouletteMode } from './RouletteMode';
import { ClawMode } from './ClawMode';
import { MatchThreeMode } from './MatchThreeMode';

/** The small line above the stage: how this mode picks. */
export const MODE_EXPLAINER: Record<SpinPlayMode, string> = {
  card_vote: 'Three cards, one vote each',
  slot: 'Pairs hold, the odd reel respins',
  knockout: 'Lowest weight tends to go first',
  plinko: 'Bin width = chance to land',
  plinko_stake: 'Your chip boosts that bin',
  ban_draft: 'Take turns banning; last one standing wins',
  roulette: 'Wedge size = chance to land',
  claw: 'Higher votes = stronger grip',
  match_three: 'First game to three wins',
};

/** Draws the round for `play.mode`. */
export function ModeStage(props: ModeProps<SpinPlay>) {
  const { play } = props;
  switch (play.mode) {
    case 'card_vote':
      return <CardVoteMode {...props} play={play} />;
    case 'slot':
      return <SlotMode {...props} play={play} />;
    case 'knockout':
      return <KnockoutMode {...props} play={play} />;
    case 'plinko':
      return <PlinkoMode {...props} play={play} />;
    case 'plinko_stake':
      return <PlinkoStakeMode {...props} play={play} />;
    case 'ban_draft':
      return <BanDraftMode {...props} play={play} />;
    case 'roulette':
      return <RouletteMode {...props} play={play} />;
    case 'claw':
      return <ClawMode {...props} play={play} />;
    case 'match_three':
      return <MatchThreeMode {...props} play={play} />;
  }
}
