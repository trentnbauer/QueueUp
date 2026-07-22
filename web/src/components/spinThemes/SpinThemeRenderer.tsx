import type { ConcreteSpinWheelTheme } from '@queueup/shared';
import type { SpinThemeProps } from './types';
import { SlotMachineTheme } from './SlotMachineTheme';
import { CrateTheme } from './CrateTheme';
import { CardFlipTheme } from './CardFlipTheme';
import { RouletteTheme } from './RouletteTheme';

interface SpinThemeRendererProps extends SpinThemeProps {
  theme: ConcreteSpinWheelTheme;
}

/** Maps each concrete theme to its component - the one place that needs a new branch when a theme
 * ships. */
export function SpinThemeRenderer({ theme, ...props }: SpinThemeRendererProps) {
  if (theme === 'slot') return <SlotMachineTheme {...props} />;
  if (theme === 'crate') return <CrateTheme {...props} />;
  if (theme === 'card_flip') return <CardFlipTheme {...props} />;
  if (theme === 'roulette') return <RouletteTheme {...props} />;
  return <SlotMachineTheme {...props} />;
}
