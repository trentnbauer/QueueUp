import { useAuth } from '../context/AuthContext';
import { useSteamImportContext } from '../context/SteamImportContext';

/** One connected library (Steam today). To add another (Epic, GOG, ...), add an entry below: both
 * Profile & settings buttons ("Sync libraries" and "Sync trophies and achievements") run every
 * linked source in one click, so nothing else in the UI needs to change. */
interface SyncSource {
  id: string;
  label: string;
  linked: boolean;
  /** Pull in new games (and wishlist) from this source. */
  syncLibrary: () => Promise<void>;
  /** Check this source for 100%'d games / trophies and open the review dialog if any are found. */
  syncAchievements: () => Promise<void>;
  /** Starts the sign-in/link flow for this source. */
  link: () => void;
}

export function useSyncSources() {
  const { steamLinked } = useAuth();
  const steam = useSteamImportContext();

  const sources: SyncSource[] = [
    {
      id: 'steam',
      label: 'Steam',
      linked: steamLinked,
      syncLibrary: steam.runSyncLibraryAndWishlist,
      syncAchievements: steam.completions.scan,
      link: () => steam.startLink('library'),
    },
  ];
  const linked = sources.filter((s) => s.linked);

  return {
    /** Names of the connected sources, for button subtitles. */
    linkedLabels: linked.map((s) => s.label),
    hasLinked: linked.length > 0,
    busy: steam.busy || steam.completions.busy || steam.syncingEverything,
    syncLibraries: async () => {
      for (const s of linked) await s.syncLibrary();
    },
    syncAchievements: async () => {
      for (const s of linked) await s.syncAchievements();
    },
    /** With nothing linked yet, the first source's link flow is the way in. */
    linkFirst: () => sources[0].link(),
  };
}
