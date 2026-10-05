import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/** Every overlay the app can show, keyed so any component can open/close any of them without
 * prop-drilling - the design's sheets/dialogs all hang off one shared set of open flags. */
export type DialogKey =
  | 'add'
  | 'import'
  | 'addRoom'
  | 'roomSettings'
  | 'shelfSettings'
  | 'notifications'
  | 'me'
  | 'friends'
  | 'spin'
  | 'ranked'
  | 'deck'
  | 'needsReview'
  | 'duplicates'
  | 'aiTonight'
  | 'playtime'
  | 'completions'
  | 'playnite'
  | 'steam'
  | 'xbox'
  | 'exophase'
  | 'psn'
  | 'retroachievements'
  | 'changelog'
  | 'dlc'
  | 'review'
  | 'journal';

export type AddRoomStep = 'options' | 'create' | 'join' | 'browse';

interface DialogPayloads {
  addRoom: { step: AddRoomStep };
  add: { query?: string };
  /** `sync`: opened from Add game (issue #859) - a linked library's button syncs it right there instead of
   * opening its settings. Without it (from Settings) the button is Manage. */
  import: { mode?: 'sync' };
  /** `edit`: opened to write or change the review of an already-Beaten game, rather than straight
   * after marking it Beaten - closing it then leaves the game detail open. `syncShelf`: opened from
   * "someone beat this in the room" - saving or skipping then marks it Beaten on the viewer's shelf
   * too, review included. */
  review: { gameId: string; edit?: boolean; syncShelf?: boolean };
  /** Play journal (#802): one room's, or (no roomId) everything the viewer has played. */
  journal: { roomId?: string };
}

type OpenState = { [K in DialogKey]?: K extends keyof DialogPayloads ? DialogPayloads[K] : true };

interface UiContextValue {
  dialogs: OpenState;
  openDialog: <K extends DialogKey>(key: K, payload?: K extends keyof DialogPayloads ? DialogPayloads[K] : never) => void;
  closeDialog: (key: DialogKey) => void;
  isOpen: (key: DialogKey) => boolean;

  /** The game whose detail is showing (right panel on desktop, sheet on phones). */
  selectedGameId: string | null;
  selectGame: (id: string | null) => void;

  /** Transient bottom-centre toast (2.4s, or 5.2s when it carries an action). */
  toast: { message: string; action?: { label: string; run: () => void }; key: number; error?: boolean } | null;
  notify: (message: string, action?: { label: string; run: () => void }, durationMs?: number, isError?: boolean) => void;
  dismissToast: () => void;

  /** Errors now surface as a (longer-lived) toast; `errorMessage` stays null. */
  errorMessage: string | null;
  showError: (message: string | null) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [dialogs, setDialogs] = useState<OpenState>({});
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [toast, setToast] = useState<UiContextValue['toast']>(null);
  const errorMessage: string | null = null;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastKey = useRef(0);

  const openDialog = useCallback<UiContextValue['openDialog']>((key, payload) => {
    setDialogs((prev) => ({ ...prev, [key]: payload ?? true }));
  }, []);
  const closeDialog = useCallback((key: DialogKey) => {
    setDialogs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const notify = useCallback((message: string, action?: { label: string; run: () => void }, durationMs?: number, isError?: boolean) => {
    clearTimeout(toastTimer.current);
    toastKey.current += 1;
    setToast({ message, action, key: toastKey.current, error: isError });
    toastTimer.current = setTimeout(() => setToast(null), durationMs ?? (action ? 5200 : 2400));
  }, []);

  const showError = useCallback(
    (message: string | null) => {
      if (message) notify(message, undefined, 6500, true);
    },
    [notify],
  );

  const value = useMemo<UiContextValue>(
    () => ({
      dialogs,
      openDialog,
      closeDialog,
      isOpen: (key) => key in dialogs,
      selectedGameId,
      selectGame: setSelectedGameId,
      toast,
      notify,
      dismissToast,
      errorMessage,
      showError,
    }),
    [dialogs, openDialog, closeDialog, selectedGameId, toast, notify, dismissToast, errorMessage, showError],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used within UiProvider');
  return ctx;
}
