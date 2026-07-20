import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CardDensity = 'large' | 'medium' | 'small';

export const CARD_DENSITY_LABELS: Record<CardDensity, string> = {
  large: 'Large (1 per row)',
  medium: 'Medium (2 per row)',
  small: 'Small (3 per row)',
};

// Only affects the narrow-viewport grid (see the <=640px breakpoint in GameGrid.module.css) - the
// desktop layout already auto-fills as many 260px columns as fit, so there's nothing to configure
// there.
const MOBILE_COLUMNS: Record<CardDensity, number> = {
  large: 1,
  medium: 2,
  small: 3,
};

const STORAGE_KEY = 'sq-card-density';
const DEFAULT_DENSITY: CardDensity = 'medium';

function isCardDensity(value: string | null): value is CardDensity {
  return value === 'large' || value === 'medium' || value === 'small';
}

function readStored(): CardDensity {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isCardDensity(stored) ? stored : DEFAULT_DENSITY;
}

interface CardDensityContextValue {
  density: CardDensity;
  setDensity: (density: CardDensity) => void;
}

const CardDensityContext = createContext<CardDensityContextValue | undefined>(undefined);

/** How many game cards fit per row on a narrow (mobile-width) screen - a per-browser display
 * preference, same reasoning as CurrencyRegionContext: this is "how do I want my own phone to lay
 * this out," not something that needs to sync across devices. Applied as a CSS custom property on
 * the document root rather than threaded through every GameGrid instance as a prop, so every grid
 * on screen (Personal Shelf, every room) picks it up without prop drilling. */
export function CardDensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<CardDensity>(readStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, density);
    document.documentElement.style.setProperty('--qu-mobile-grid-columns', String(MOBILE_COLUMNS[density]));
  }, [density]);

  return <CardDensityContext.Provider value={{ density, setDensity }}>{children}</CardDensityContext.Provider>;
}

export function useCardDensity() {
  const ctx = useContext(CardDensityContext);
  if (!ctx) throw new Error('useCardDensity must be used within CardDensityProvider');
  return ctx;
}
