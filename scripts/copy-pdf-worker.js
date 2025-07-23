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
  
  // Create public directory if it doesn't exist
  if (!existsSync(publicDir)) {
    await mkdir(publicDir, { recursive: true });
  }

  // Files to copy - include legacy builds for better compatibility
  const filesToCopy = [
    { source: 'pdf.worker.mjs', target: 'pdf.worker.mjs' },
    { source: 'pdf.worker.min.mjs', target: 'pdf.worker.min.mjs' },
    { source: 'pdf.worker.min.mjs', target: 'pdf.worker.min.js' }, // compatibility with old name
    { source: '../legacy/build/pdf.worker.min.js', target: 'pdf.worker.legacy.min.js' } // legacy non-module version
  ];

  // Try different source locations
  const possibleBasePaths = [
    join(projectRoot, 'node_modules/.pnpm/pdfjs-dist@4.4.168/node_modules/pdfjs-dist/build'),
    join(projectRoot, 'node_modules/pdfjs-dist/build'),
  ];

  // Also try to find pdfjs-dist using glob
  try {
    const glob = await import('glob');
    const pattern = join(projectRoot, 'node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/build');
    const dirs = await glob.glob(pattern);
    possibleBasePaths.push(...dirs);
  } catch (err) {
    // Glob not available, continue with static paths
  }

  let copiedCount = 0;
  
  for (const file of filesToCopy) {
    let copied = false;
    
    for (const basePath of possibleBasePaths) {
      const sourcePath = join(basePath, file.source);
      const targetPath = join(publicDir, file.target);
      
      if (existsSync(sourcePath)) {
        try {
          await copyFile(sourcePath, targetPath);
          console.log(`✅ Copied ${file.target} to public directory`);
          copied = true;
          copiedCount++;
          break;
        } catch (err) {
          console.error(`Failed to copy ${file.source}:`, err);
        }
      }
    }
    
    if (!copied && file.source !== 'pdf.worker.min.mjs') {
      console.warn(`⚠️  Could not find ${file.source}`);
    }
  }

  if (copiedCount === 0) {
    console.error('❌ No PDF worker files were copied. PDF preview may not work correctly.');
    console.error('   Please ensure pdfjs-dist is installed: pnpm add pdfjs-dist');
    process.exit(1);
  } else {
    console.log(`✨ Successfully copied ${copiedCount} PDF worker file(s)`);
  }
}

// Run the copy operation
copyPdfWorker().catch(console.error);