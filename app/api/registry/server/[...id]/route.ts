import { NextRequest, NextResponse } from 'next/server';

import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';
import { transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    // Join the path segments back together (e.g., ['io.github.yokingma', 'time-mcp'] -> 'io.github.yokingma/time-mcp')
    const serverId = id.join('/');
    const client = new PluggedinRegistryClient();
    const server = await client.getServerDetails(serverId);
    
    // Transform to McpIndex format
    const transformed = transformPluggedinRegistryToMcpIndex(server);
    
    return NextResponse.json({
      success: true,
      server: transformed
    });
  } catch (error) {
    console.error('Failed to fetch registry server details:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch server details' 
      },
      { status: 500 }
    );
  }
}