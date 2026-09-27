/**
 * Streamable HTTP servers normally go through StreamableHTTPWrapper, which
 * fetches with the SSRF-pinned safeMcpFetch. A config without uuid/profile_uuid
 * fell back to a bare StreamableHTTPClientTransport with no `fetch`, i.e. the
 * global fetch — URL validation at connect time, but no pinning against DNS
 * rebinding or redirects to internal addresses.
 */
import { expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ http: vi.fn() }));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = async () => {};
    close = async () => {};
    getServerCapabilities = () => ({});
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {
    constructor(url: unknown, options: unknown) {
      m.http(url, options);
    }
    close = async () => {};
  },
}));

import { McpServerType } from '@/db/schema';
import { listToolsFromServer } from '@/lib/mcp/client-wrapper';
import { safeMcpFetch } from '@/lib/mcp/safe-fetch';

it('connects the fallback Streamable HTTP transport through the pinned fetch', async () => {
  await listToolsFromServer({
    name: 'no-ids',
    type: McpServerType.STREAMABLE_HTTP,
    url: 'https://mcp.example.com/mcp',
  } as any);

  expect(m.http).toHaveBeenCalledWith(
    new URL('https://mcp.example.com/mcp'),
    expect.objectContaining({ fetch: safeMcpFetch })
  );
});
