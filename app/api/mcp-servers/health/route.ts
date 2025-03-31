// app/api/mcp-servers/health/route.ts
import { NextResponse } from 'next/server';

import { getMcpServers } from '@/app/actions/mcp-servers'; // Use path alias relative to app root
import { authenticateApiKey } from '@/app/api/auth'; // Use path alias relative to app root

export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    if (!auth.activeProfile) {
      return NextResponse.json({ error: 'Active profile not found' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const serverUuid = searchParams.get('uuid');

    if (!serverUuid) {
      return NextResponse.json(
        { error: 'Server UUID query parameter is required' },
        { status: 400 }
      );
    }

    // Get the server for the authenticated profile
    const servers = await getMcpServers(auth.activeProfile.uuid);
    const server = servers.find(s => s.uuid === serverUuid);

    if (!server) {
      return NextResponse.json(
        { error: 'Server not found or not associated with this profile' },
        { status: 404 }
      );
    }

    // For WebSocket (SSE) servers, check if the endpoint is reachable
    if (server.type === 'SSE' && server.url) {
      try {
        // Simple HEAD request to check if the server is reachable with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

        const response = await fetch(server.url, {
          method: 'HEAD', // Use HEAD for efficiency
          signal: controller.signal,
          // Add headers if needed, e.g., Authorization if the health endpoint is protected
        });

        clearTimeout(timeoutId);

        return NextResponse.json({
          status: 'ok',
          reachable: response.ok,
          statusCode: response.status
        });
      } catch (error: any) {
        // Handle fetch errors (network error, timeout, etc.)
        return NextResponse.json({
          status: 'error',
          reachable: false,
          error: error.name === 'AbortError' ? 'Request timed out' : (error instanceof Error ? error.message : String(error))
        });
      }
    }

    // For STDIO servers, we can't easily check health remotely
    if (server.type === 'STDIO') {
      return NextResponse.json({
        status: 'unknown',
        message: 'Health check not available for STDIO servers via API'
      });
    }

    // Fallback for other types or missing URL
     return NextResponse.json({
        status: 'unknown',
        message: 'Health check not applicable for this server type or configuration'
      });

  } catch (error) {
    console.error('Error checking server health:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
