import type { PlinkoStakePlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function PlinkoStakeMode({ play }: ModeProps<PlinkoStakePlay>) {
  return <Stage>{play.mode}</Stage>;
}
