import { useEffect, type ReactNode } from 'react';
import { DEFAULT_ACCENT } from '../theme/defaultTheme';
import { contrastTextColor } from '../utils/color';
import { useView } from './ViewContext';

/** Applies the active room's accent color (or the default palette) as a CSS custom property, along
 * with a matching --sq-accent-text so buttons/banners rendered on top of it stay readable - a
 * room's accent is user-editable, and some presets are too bright for a fixed white text color. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { activeRoom } = useView();

  useEffect(() => {
    const accent = activeRoom?.accentColor ?? DEFAULT_ACCENT;
    document.documentElement.style.setProperty('--sq-accent', accent);
    document.documentElement.style.setProperty('--sq-accent-text', contrastTextColor(accent));
  }, [activeRoom]);

  return <>{children}</>;
}
