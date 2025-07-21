#!/usr/bin/env node

import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function copyPdfWorker() {
  const publicDir = join(projectRoot, 'public');
  const targetFile = join(publicDir, 'pdf.worker.min.mjs');
  
  // Possible source locations
  const possibleSources = [
    join(projectRoot, 'node_modules/.pnpm/pdfjs-dist@4.4.168/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    join(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    join(projectRoot, 'node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  ];

  // Create public directory if it doesn't exist
  if (!existsSync(publicDir)) {
    await mkdir(publicDir, { recursive: true });
  }

  // Skip if target already exists
  if (existsSync(targetFile)) {
    console.log('✓ PDF worker already exists at:', targetFile);
    return;
  }

  // Try to find and copy the worker
  for (const source of possibleSources) {
    if (existsSync(source)) {
      try {
        await copyFile(source, targetFile);
        console.log('✓ PDF worker copied to:', targetFile);
        return;
      } catch (err) {
        console.error('Failed to copy PDF worker from:', source, err);
      }
    }
  }

  // If using glob pattern, try to find any matching file
  try {
    const glob = await import('glob');
    const pattern = join(projectRoot, 'node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
    const files = await glob.glob(pattern);
    
    if (files.length > 0) {
      await copyFile(files[0], targetFile);
      console.log('✓ PDF worker copied to:', targetFile);
      return;
    }
  } catch (err) {
    // Glob not available, skip
  }

  console.warn('⚠ Could not find PDF worker file. PDF preview may not work correctly.');
  console.warn('  You may need to manually copy pdf.worker.min.mjs to the public directory.');
}

// Run the copy operation
copyPdfWorker().catch(console.error);