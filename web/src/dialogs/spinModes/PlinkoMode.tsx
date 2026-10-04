import type { PlinkoPlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function PlinkoMode({ play }: ModeProps<PlinkoPlay>) {
  return <Stage>{play.mode}</Stage>;
}
