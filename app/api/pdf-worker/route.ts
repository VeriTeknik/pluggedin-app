import { readFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';

// Cache the worker content in memory for better performance
let workerContent: Buffer | null = null;

export async function GET() {
  try {
    if (!workerContent) {
      // Try to find the worker file in node_modules
      const possiblePaths = [
        // Standard paths
        join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
        join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.mjs'),
        // pnpm paths
        join(process.cwd(), 'node_modules/.pnpm/pdfjs-dist@4.4.168/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
        join(process.cwd(), 'node_modules/.pnpm/pdfjs-dist@4.4.168/node_modules/pdfjs-dist/build/pdf.worker.mjs'),
        // Legacy paths
        join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
        join(process.cwd(), 'node_modules/.pnpm/pdfjs-dist@4.4.168/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
      ];

      let fileRead = false;
      let lastError: Error | null = null;
      
      for (const path of possiblePaths) {
        try {
          workerContent = await readFile(path);
          fileRead = true;
          console.log(`PDF worker loaded from: ${path}`);
          break;
        } catch (e) {
          lastError = e as Error;
          // Try next path
        }
      }

      if (!fileRead) {
        console.error('PDF worker not found in any of the expected paths:', possiblePaths);
        
        // As a fallback, use the CDN version
        console.log('Falling back to CDN PDF worker');
        const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
        const response = await fetch(cdnUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF worker from CDN: ${response.statusText}`);
        }
        
        const text = await response.text();
        workerContent = Buffer.from(text);
      }
    }

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