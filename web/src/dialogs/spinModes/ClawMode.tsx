import type { ClawPlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function ClawMode({ play }: ModeProps<ClawPlay>) {
  return <Stage>{play.mode}</Stage>;
}
