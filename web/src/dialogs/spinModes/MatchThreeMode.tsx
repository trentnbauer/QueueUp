import type { MatchThreePlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function MatchThreeMode({ play }: ModeProps<MatchThreePlay>) {
  return <Stage>{play.mode}</Stage>;
}
