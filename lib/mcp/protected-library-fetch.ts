import { AsyncLocalStorage } from 'node:async_hooks';

import { safeMcpFetch } from '@/lib/mcp/safe-fetch';

/**
 * safeMcpFetch for MCP transports this app does not construct itself.
 *
 * @h1deya/langchain-mcp-tools builds its own MCP SDK transports and has no
 * option to give them a fetch, so everything they send — initialize, the SSE
 * GET stream, every tools/call — goes to global fetch, which resolves the host
 * on its own and follows redirects unchecked. client-wrapper.ts passes
 * `fetch: safeMcpFetch` to the transports it builds; this is the same guarantee
 * for the ones built where that option cannot reach.
 *
 * Global fetch is wrapped once. Inside a scope opened by withProtectedMcpFetch
 * (or a function bound by bindProtectedMcpFetch) every call is routed through
 * safeMcpFetch: resolved, private destinations refused, the checked address
 * pinned to the socket, every redirect re-validated. Outside a scope the wrapper
 * passes straight through, so nothing else in the process changes behaviour.
 * The scope is an AsyncLocalStorage, so it follows the async work it starts —
 * the SDK's SSE stream and its reconnection timers — without being global.
 */

const STATE = Symbol.for('pluggedin.mcp.protected-library-fetch');
const INSTALLED = Symbol.for('pluggedin.mcp.protected-library-fetch.installed');

type TaggedFetch = typeof fetch & { [INSTALLED]?: true };

// On globalThis so a hot-reloaded copy of this module and an interceptor that
// is already installed share one scope.
const globals = globalThis as typeof globalThis & { [STATE]?: AsyncLocalStorage<true> };
const scope = (globals[STATE] ??= new AsyncLocalStorage<true>());

function ensureInterceptor(): void {
  const current = globalThis.fetch as TaggedFetch;
  if (current[INSTALLED]) return;

  const passthrough = current;
  const interceptor: TaggedFetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) =>
      scope.getStore()
        ? // exit(): safeFetch itself calls global fetch on its development
          // (allowPrivate) path, and that call must not come back here.
          scope.exit(() => safeMcpFetch(input, init))
        : passthrough(input, init),
    { [INSTALLED]: true as const }
  );
  globalThis.fetch = interceptor;
}

export function withProtectedMcpFetch<T>(work: () => Promise<T>): Promise<T> {
  ensureInterceptor();
  return scope.run(true, work);
}

/**
 * For what outlives the call that opened the connection: the tools and cleanup
 * the library returns keep using it — every tool call is another request.
 */
export function bindProtectedMcpFetch<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  return (...args: A) => {
    ensureInterceptor();
    return scope.run(true, () => fn(...args));
  };
}
