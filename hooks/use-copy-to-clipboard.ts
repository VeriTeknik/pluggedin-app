'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseCopyToClipboardOptions {
  /** Milliseconds the "copied" flag stays true. Defaults to 2000. */
  resetAfterMs?: number;
}

interface UseCopyToClipboardReturn {
  /** True for `resetAfterMs` after a successful copy. */
  copied: boolean;
  /**
   * Write `text` to the clipboard. No-op when `navigator.clipboard` is missing
   * (insecure context / older browser) and swallows promise rejections (e.g.
   * permission denied) so callers don't need to wrap the call in try/catch.
   */
  copy: (text: string) => void;
}

/**
 * Shared copy-to-clipboard hook with a transient "copied" flag. Centralises
 * the timer-reset pattern that was repeated across DualInstallSnippet,
 * McpProxySection, and InstallSnippet.
 */
export function useCopyToClipboard({
  resetAfterMs = 2000,
}: UseCopyToClipboardOptions = {}): UseCopyToClipboardReturn {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    (text: string) => {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        return;
      }
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), resetAfterMs);
        })
        .catch(() => {
          // Permission denied / write failure — leave the UI in the idle state.
        });
    },
    [resetAfterMs],
  );

  return { copied, copy };
}
