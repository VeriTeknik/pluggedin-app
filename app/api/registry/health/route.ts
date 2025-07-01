import { NextResponse } from 'next/server';

import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';

export async function GET() {
  try {
    const client = new PluggedinRegistryClient();
    const isHealthy = await client.healthCheck();
    
    return NextResponse.json({
      status: isHealthy ? 'ok' : 'error',
      registry_url: process.env.REGISTRY_API_URL || 'https://registry.plugged.in/v0'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        registry_url: process.env.REGISTRY_API_URL || 'https://registry.plugged.in/v0'
      },
      { status: 503 }
    );
  }
}