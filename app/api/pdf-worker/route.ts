import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Cache the worker content in memory for better performance
let workerContent: Buffer | null = null;

export async function GET() {
  try {
    if (!workerContent) {
      // Try to find the worker file in node_modules
      const possiblePaths = [
        join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
        join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
        join(process.cwd(), 'node_modules/.pnpm/pdfjs-dist@4.4.168/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
      ];

      let fileRead = false;
      for (const path of possiblePaths) {
        try {
          workerContent = await readFile(path);
          fileRead = true;
          break;
        } catch (e) {
          // Try next path
        }
      }

      if (!fileRead) {
        throw new Error('PDF worker file not found');
      }
    }

    // Return the worker with appropriate headers
    return new NextResponse(workerContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to serve PDF worker:', error);
    return NextResponse.json(
      { error: 'PDF worker not available' },
      { status: 500 }
    );
  }
}