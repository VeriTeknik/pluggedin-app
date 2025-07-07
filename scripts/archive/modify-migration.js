import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the migration file
const migrationFilePath = path.join(__dirname, '../drizzle/0025_busy_shen.sql');

// Read the current content
console.log(`Reading migration file: ${migrationFilePath}`);
const originalContent = fs.readFileSync(migrationFilePath, 'utf8');

// Modify the content to add IF NOT EXISTS
const modifiedContent = originalContent.replace(
  'CREATE TABLE "release_notes" (',
  'CREATE TABLE IF NOT EXISTS "release_notes" ('
);

// Write the modified content back
console.log('Modifying migration file to use IF NOT EXISTS...');
fs.writeFileSync(migrationFilePath, modifiedContent, 'utf8');

console.log('Migration file has been modified successfully.');
console.log('Original content:');
console.log(originalContent);
console.log('\nModified content:');
console.log(modifiedContent);
