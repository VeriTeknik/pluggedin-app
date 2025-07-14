#!/usr/bin/env node

/**
 * AST-based console statement remover
 * This is more accurate than regex-based approaches as it understands TypeScript/JavaScript syntax
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

// Console methods to remove
const CONSOLE_METHODS = ['log', 'error', 'warn', 'debug'];

/**
 * Remove console statements from code using AST parsing
 */
function removeConsoleStatements(code, filename) {
  try {
    // Parse the code into an AST
    const ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'asyncGenerators',
        'objectRestSpread',
        'dynamicImport',
        'optionalCatchBinding',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });

    let removedCount = 0;

    // Traverse the AST and remove console statements
    traverse(ast, {
      CallExpression(path) {
        const { callee } = path.node;
        
        // Check if this is a console.method() call
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'console' &&
          callee.property.type === 'Identifier' &&
          CONSOLE_METHODS.includes(callee.property.name)
        ) {
          // Check if the console call is the only expression in a statement
          if (path.parent.type === 'ExpressionStatement') {
            // Remove the entire statement
            path.parentPath.remove();
            removedCount++;
          } else {
            // Console call is part of a larger expression
            // Replace with undefined to maintain expression structure
            path.replaceWith({
              type: 'Identifier',
              name: 'undefined',
            });
            removedCount++;
          }
        }
      },
    });

    // Generate the modified code
    const output = generate(ast, {
      retainLines: true,
      retainFunctionParens: true,
      compact: false,
    });

    return {
      code: output.code,
      removedCount,
      success: true,
    };
  } catch (error) {
    console.error(`Error parsing ${filename}:`, error.message);
    return {
      code: code,
      removedCount: 0,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const result = removeConsoleStatements(code, filePath);

  if (result.success && result.removedCount > 0) {
    // Create backup
    const backupPath = `${filePath}.console-backup`;
    fs.writeFileSync(backupPath, code);

    // Write modified code
    fs.writeFileSync(filePath, result.code);

    console.log(`✓ ${filePath}: Removed ${result.removedCount} console statements`);
    return result.removedCount;
  } else if (!result.success) {
    console.error(`✗ ${filePath}: ${result.error}`);
    return 0;
  } else {
    console.log(`- ${filePath}: No console statements found`);
    return 0;
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node remove-console-ast.js <file1> [file2] [...]');
    console.log('');
    console.log('Example:');
    console.log('  node remove-console-ast.js lib/mcp/client-wrapper.ts');
    console.log('  node remove-console-ast.js lib/**/*.ts');
    process.exit(1);
  }

  console.log('AST-based Console Statement Remover');
  console.log('===================================');
  console.log('');

  let totalRemoved = 0;

  args.forEach(pattern => {
    // Handle glob patterns
    const files = pattern.includes('*') 
      ? require('glob').sync(pattern, { ignore: ['node_modules/**', '.next/**'] })
      : [pattern];

    files.forEach(file => {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        totalRemoved += processFile(file);
      }
    });
  });

  console.log('');
  console.log(`Total console statements removed: ${totalRemoved}`);
  console.log('');
  console.log('Note: Backup files created with .console-backup extension');
}

// Check if required dependencies are installed
try {
  require('@babel/parser');
  require('@babel/traverse');
  require('@babel/generator');
} catch (error) {
  console.error('Missing required dependencies. Please install:');
  console.error('  npm install --save-dev @babel/parser @babel/traverse @babel/generator');
  process.exit(1);
}

// Run if called directly
if (require.main === module) {
  main();
}