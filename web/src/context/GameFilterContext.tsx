import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ALL_FILTER_VALUE } from '../components/gameGridLogic';
import { useView } from './ViewContext';

interface GameFilterContextValue {
  platformFilter: string;
  genreFilter: string;
  statusFilter: string;
  searchQuery: string;
  setPlatformFilter: (value: string) => void;
  setGenreFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  setSearchQuery: (value: string) => void;
}

const GameFilterContext = createContext<GameFilterContextValue | undefined>(undefined);

/** Platform/genre/status filter selection lives here (not local to GameGrid) so the Header - a
 * sibling of the Personal Shelf/Room views, not a parent - can render the filter pills next to the
 * Add Game button while GameGrid applies them. Resets whenever the active view changes (switching
 * rooms or shelf) so a filter that matched one room's games doesn't silently carry over and hide
 * everything in the next one. */
export function GameFilterProvider({ children }: { children: ReactNode }) {
  const { view } = useView();
  const [platformFilter, setPlatformFilter] = useState(ALL_FILTER_VALUE);
  const [genreFilter, setGenreFilter] = useState(ALL_FILTER_VALUE);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER_VALUE);
  const [searchQuery, setSearchQuery] = useState('');
  const viewKey = view.type === 'room' ? `room:${view.roomId}` : 'personal';

  useEffect(() => {
    setPlatformFilter(ALL_FILTER_VALUE);
    setGenreFilter(ALL_FILTER_VALUE);
    setStatusFilter(ALL_FILTER_VALUE);
    setSearchQuery('');
  }, [viewKey]);

  return (
    <GameFilterContext.Provider
      value={{
        platformFilter,
        genreFilter,
        statusFilter,
        searchQuery,
        setPlatformFilter,
        setGenreFilter,
        setStatusFilter,
        setSearchQuery,
      }}
    >
      {children}
    </GameFilterContext.Provider>
  );
}

export function useGameFilter() {
  const ctx = useContext(GameFilterContext);
  if (!ctx) throw new Error('useGameFilter must be used within GameFilterProvider');
  return ctx;
}
