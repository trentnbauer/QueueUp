import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type SidebarIconSize = 'large' | 'medium' | 'small';

export const SIDEBAR_ICON_SIZE_LABELS: Record<SidebarIconSize, string> = {
  large: 'Large (default)',
  medium: 'Medium',
  small: 'Small',
};

// Room-icon diameter in px for each setting - "large" matches the rail's existing fixed size
// (.roomIcon/.addRoomIcon in Sidebar.module.css) so existing users see no change until they open
// the new setting.
const ICON_DIAMETER: Record<SidebarIconSize, number> = {
  large: 48,
  medium: 40,
  small: 32,
};

const STORAGE_KEY = 'sq-sidebar-icon-size';
const DEFAULT_SIZE: SidebarIconSize = 'large';

function isSidebarIconSize(value: string | null): value is SidebarIconSize {
  return value === 'large' || value === 'medium' || value === 'small';
}

function readStored(): SidebarIconSize {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isSidebarIconSize(stored) ? stored : DEFAULT_SIZE;
}

interface SidebarIconSizeContextValue {
  size: SidebarIconSize;
  setSize: (size: SidebarIconSize) => void;
}

const SidebarIconSizeContext = createContext<SidebarIconSizeContextValue | undefined>(undefined);

/** How large the room rail's icons render on screen (issue #340) - a per-browser display
 * preference, same reasoning as CardDensityContext: this is "how do I want my own screen to lay
 * this out," not something that needs to sync across devices. Applied as a CSS custom property on
 * the document root rather than threaded through Sidebar as a prop, matching CardDensityContext's
 * approach. Unlike card density (mobile-only), this affects every viewport - the rail is visible
 * both docked (desktop) and as the off-canvas drawer (mobile), and there's no separate breakpoint-
 * specific sizing to preserve. */
export function SidebarIconSizeProvider({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<SidebarIconSize>(readStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, size);
    document.documentElement.style.setProperty('--qu-sidebar-icon-size', `${ICON_DIAMETER[size]}px`);
  }, [size]);

  return <SidebarIconSizeContext.Provider value={{ size, setSize }}>{children}</SidebarIconSizeContext.Provider>;
}

export function useSidebarIconSize() {
  const ctx = useContext(SidebarIconSizeContext);
  if (!ctx) throw new Error('useSidebarIconSize must be used within SidebarIconSizeProvider');
  return ctx;
}
