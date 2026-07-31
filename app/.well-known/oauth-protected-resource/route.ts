import { NextResponse } from 'next/server';

import { buildProtectedResourceMetadata, connectorBaseUrl } from '@/lib/oauth/metadata';

export const dynamic = 'force-dynamic';

export async function GET() {
  const issuer = connectorBaseUrl();
  // The resource must match the URL the user types into Claude byte for byte,
  // including the /api/mcp path.
  return NextResponse.json(buildProtectedResourceMetadata(`${issuer}/api/mcp`, issuer), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
