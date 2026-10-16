import { forwardRef, useEffect, useRef, useState } from 'react';
import type { LobbyTextInput } from '../../lobbyGames';
import { cleanTyped, typedTargets } from '../../lobbyGames/typing';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** What the game says about its text field right now (see `LobbyTextInput.state`). */
export interface TextFieldState {
  /** The letters the game has so far for this person's next word. */
  draft: string;
  /** Changes when the game starts a fresh word (a guess was sent, a new run began): the field then starts again from `draft`. */
  key: string;
  /** Whether typing counts right now. */
  enabled: boolean;
}

/** The text field under the arena for a game whose play is typing (Words). It is a real input, so a phone opens its
 * own keyboard. What is typed is sent to the game one letter at a time (and a letter taken back, and Enter), the
 * same taps the game would get from keys, so the server only ever sees a letter, Backspace or Enter, never text. */
export const TextField = forwardRef<
  HTMLInputElement,
  {
    spec: LobbyTextInput;
    state: TextFieldState;
    phone: boolean;
    /** Sends target `target` to the game: a letter is 0 to 25 (a to z), then the spec's `enter` and `backspace`. */
    onTarget: (target: number) => void;
  }
>(function TextField({ spec, state, phone, onTarget }, ref) {
  const t = useT();
  const [value, setValue] = useState(state.draft);
  /** What the game has been told the draft is, so only the difference is sent. */
  const told = useRef(state.draft);
  const inner = useRef<HTMLInputElement | null>(null);

  // A new word (or run) starts the field again from what the game has.
  useEffect(() => {
    told.current = state.draft;
    setValue(state.draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.key]);

  // On a computer, start with the cursor in the field so typing just works. (A phone only opens its keyboard
  // for a tap, so there it waits for one.)
  useEffect(() => {
    if (!phone && state.enabled) inner.current?.focus();
  }, [phone, state.enabled, state.key]);

  const send = (next: string) => {
    for (const target of typedTargets(told.current, next, spec.backspace)) onTarget(target);
    told.current = next;
  };

  return (
    <input
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      value={value}
      disabled={!state.enabled}
      placeholder={t(state.enabled ? spec.placeholderKey : spec.waitingKey)}
      aria-label={t(spec.placeholderKey)}
      maxLength={spec.length}
      inputMode="text"
      enterKeyHint="send"
      autoCapitalize="none"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => {
        // Letters only, as many as the word has; anything else typed is dropped.
        const next = cleanTyped(e.target.value, spec.length);
        setValue(next);
        send(next);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        // Only a whole word is sent; the game ignores Enter on a short one, so the field keeps what is typed.
        if (value.length !== spec.length) return;
        onTarget(spec.enter);
        told.current = '';
        setValue('');
      }}
      style={st(`width:100%;box-sizing:border-box;padding:${phone ? 14 : 12}px 16px;border-radius:14px;border:1.5px solid var(--line, oklch(1 0 0 / 0.18));background:var(--surface, oklch(1 0 0 / 0.06));color:inherit;font:700 ${phone ? 20 : 18}px var(--font-mono);letter-spacing:.35em;text-transform:uppercase;text-align:center;outline:none;opacity:${state.enabled ? 1 : 0.5}`)}
    />
  );
});
