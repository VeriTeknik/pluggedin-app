#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Files to process
const patterns = [
  'app/**/*.{ts,tsx,js,jsx}',
  'lib/**/*.{ts,tsx,js,jsx}',
  'components/**/*.{ts,tsx,js,jsx}',
];

// Files to exclude
const excludePatterns = [
  '**/node_modules/**',
  '**/.next/**',
  '**/scripts/**',
  '**/tests/**',
  '**/vitest.config.ts',
  '**/next.config.js',
  '**/drizzle/**',
  '**/db/migrations/**',
];

// Get all files matching the patterns
const files = patterns.flatMap(pattern => 
  glob.sync(pattern, { 
    ignore: excludePatterns,
    cwd: process.cwd()
  })
);

console.log(`Found ${files.length} files to process`);

let totalRemoved = 0;
const filesModified = [];

files.forEach(file => {
  const filePath = path.resolve(file);
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Regular expressions to match console.log statements
  const patterns = [
    // Single line console.log
    /^\s*console\.log\([^;]*\);?\s*$/gm,
    // Multi-line console.log
    /^\s*console\.log\([^;]*\n([^;]|\n)*?\);?\s*$/gm,
    // Console.log with trailing code (be careful)
    /console\.log\([^)]*\);/g,
  ];
  
  let removedCount = 0;
  
  patterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    removedCount += matches.length;
    content = content.replace(pattern, '');
  });
  
  // Clean up empty lines left behind
  content = content.replace(/^\s*\n\s*\n\s*\n/gm, '\n\n');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    totalRemoved += removedCount;
    filesModified.push({ file, count: removedCount });
    console.log(`✓ ${file} - removed ${removedCount} console.log statements`);
  }
});

console.log('\n=== Summary ===');
console.log(`Total console.log statements removed: ${totalRemoved}`);
console.log(`Files modified: ${filesModified.length}`);

if (filesModified.length > 0) {
  console.log('\nTop files with most removals:');
  filesModified
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .forEach(({ file, count }) => {
      console.log(`  ${file}: ${count} removals`);
    });
}