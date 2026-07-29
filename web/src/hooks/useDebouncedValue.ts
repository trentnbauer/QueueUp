import { useEffect, useState } from 'react';

/** Delays reflecting `value` until it's held still for `delayMs` - used to keep a search box's
 * every-keystroke state from firing a network request per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
