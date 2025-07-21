import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // In production/standalone mode, we can't access local files
    // Always use the CDN version for reliability
    const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    console.log('Fetching PDF worker from CDN:', cdnUrl);
    
    const response = await fetch(cdnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PluggedIn/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF worker from CDN: ${response.status} ${response.statusText}`);
    }
    
    const workerContent = await response.arrayBuffer();

    // Return the worker with appropriate headers
    return new NextResponse(workerContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch (error) {
    console.error('Failed to serve PDF worker:', error);
    
    // Return a minimal worker that shows an error
    const errorWorker = `
      self.addEventListener('message', function(e) {
        self.postMessage({
          error: 'PDF.js worker failed to load. Please refresh the page.',
          details: ${JSON.stringify(error instanceof Error ? error.message : 'Unknown error')}
        });
      });
    `;
    
    return new NextResponse(errorWorker, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
      },
      status: 500,
    });
  }
}