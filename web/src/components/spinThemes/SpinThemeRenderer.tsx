import type { ConcreteSpinWheelTheme } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import { SlotMachineTheme } from './SlotMachineTheme';
import { CrateTheme } from './CrateTheme';

interface SpinThemeRendererProps extends SpinThemeProps {
  theme: ConcreteSpinWheelTheme;
}

/** Maps each concrete theme to its component - the one place that needs a new branch when a theme
 * ships (card flip: issue #299, roulette: #300 - not built yet, so they fall back to the slot
 * machine below rather than rendering nothing). */
export function SpinThemeRenderer({ theme, ...props }: SpinThemeRendererProps) {
  if (theme === 'slot') return <SlotMachineTheme {...props} />;
  if (theme === 'crate') return <CrateTheme {...props} />;
  return <SlotMachineTheme {...props} />;
}
