import type { KnockoutPlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function KnockoutMode({ play }: ModeProps<KnockoutPlay>) {
  return <Stage>{play.mode}</Stage>;
}
