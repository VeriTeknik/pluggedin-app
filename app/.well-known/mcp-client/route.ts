import { NextResponse } from 'next/server';

import { buildClientIdMetadataDocument, connectorBaseUrl } from '@/lib/oauth/provider/metadata';

// Our own CIMD: pluggedin-app is an OAuth CLIENT when it connects to downstream
// MCP servers, and 2026-07-28 deprecates DCR in favour of this document.
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = `${connectorBaseUrl()}/.well-known/mcp-client`;
  return NextResponse.json(buildClientIdMetadataDocument(url), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
