import type { SlotPlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function SlotMode({ play }: ModeProps<SlotPlay>) {
  return <Stage>{play.mode}</Stage>;
}
