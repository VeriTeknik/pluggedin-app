import { NextRequest, NextResponse } from 'next/server';

import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';
import { transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = new PluggedinRegistryClient();
    const server = await client.getServerDetails(id);
    
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