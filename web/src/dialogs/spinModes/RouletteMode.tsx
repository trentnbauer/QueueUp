import type { RoulettePlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function RouletteMode({ play }: ModeProps<RoulettePlay>) {
  return <Stage>{play.mode}</Stage>;
}
