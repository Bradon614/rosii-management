import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stopped changing for `delayMs`.
 *
 * Used by the client search so a fast typist triggers one request per pause
 * instead of one per keystroke (the shared API client already deduplicates
 * identical concurrent GETs, this avoids issuing them at all).
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
