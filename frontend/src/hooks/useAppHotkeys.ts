import { useHotkeys, Options } from 'react-hotkeys-hook';

/**
 * A centralized wrapper around react-hotkeys-hook to enforce consistent
 * defaults across the application (e.g., ignoring input fields by default,
 * but allowing specific overrides).
 */
export function useAppHotkeys(
  keys: string,
  callback: (e: KeyboardEvent) => void,
  options?: Options,
  dependencies?: any[]
) {
  // We use our custom wrapper to enforce default options or add logging in the future.
  useHotkeys(
    keys,
    callback,
    {
      // By default, do not trigger shortcuts if the user is typing in an input,
      // textarea, or contenteditable element, UNLESS explicitly overridden.
      enableOnFormTags: false,
      preventDefault: true,
      ...options,
    },
    dependencies || []
  );
}
