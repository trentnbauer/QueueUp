import type { BanDraftPlay } from '@queueup/shared';
import { Stage, type ModeProps } from './shared';

/** Placeholder until the mode's screen is built. */
export function BanDraftMode({ play }: ModeProps<BanDraftPlay>) {
  return <Stage>{play.mode}</Stage>;
}
