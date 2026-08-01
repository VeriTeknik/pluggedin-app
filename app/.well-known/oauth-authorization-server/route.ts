import { NextResponse } from 'next/server';

import { buildAuthorizationServerMetadata, connectorBaseUrl } from '@/lib/oauth/provider/metadata';

// Discovery must be reachable from Anthropic's egress range 160.79.104.0/21.
// A WAF in front of this route breaks the flow even when /api/mcp is reachable.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(buildAuthorizationServerMetadata(connectorBaseUrl()), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
