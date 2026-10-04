import type { CardVotePlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function CardVoteMode({ play }: ModeProps<CardVotePlay>) {
  return <Stage>{play.mode}</Stage>;
}
