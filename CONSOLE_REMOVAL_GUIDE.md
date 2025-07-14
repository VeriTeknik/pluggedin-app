# Console Statement Removal Guide

This guide provides multiple approaches to remove console.log, console.error, console.warn, and console.debug statements from production code.

## Quick Start

### Option 1: Use the Automated Shell Script (Recommended)
```bash
# Run the automated removal script
./remove-console-logs.sh
```

This script will:
- Create backups of all files
- Process high-priority files first (with the most console statements)
- Optionally process all TypeScript/JavaScript files
- Show progress and summary

### Option 2: Quick One-Liner for Specific Files
```bash
# For a single file (creates .bak backup)
sed -i.bak 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' lib/mcp/client-wrapper.ts

# For multiple high-priority files
for file in lib/mcp/client-wrapper.ts lib/mcp/oauth-process-manager.ts lib/mcp/package-manager/index.ts lib/rag-service.ts lib/auth.ts; do
    echo "Processing $file..."
    sed -i.bak 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' "$file"
done
```

## High Priority Files

Based on the analysis, these files have the most console statements:

1. `lib/mcp/client-wrapper.ts` - 22 occurrences
2. `lib/mcp/oauth-process-manager.ts` - 12 occurrences  
3. `lib/mcp/package-manager/index.ts` - 9 occurrences
4. `lib/rag-service.ts` - 9 occurrences
5. `lib/auth.ts` - 8 occurrences

## Verification Steps

### 1. Check Remaining Console Statements
```bash
# Count console statements in specific file
grep -c "console\.\(log\|error\|warn\|debug\)" lib/mcp/client-wrapper.ts

# Find all remaining console statements in the project
grep -r "console\.\(log\|error\|warn\|debug\)" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.next \
  . | wc -l
```

### 2. Review Changes
```bash
# See what changed
git diff

# See changes for a specific file
git diff lib/mcp/client-wrapper.ts
```

### 3. Run Tests
```bash
# Run your test suite to ensure nothing broke
pnpm test
```

## Advanced Options

### AST-Based Removal (Most Accurate)
For more complex cases or if you want the most accurate removal:

```bash
# First install dependencies (if not already installed)
npm install --save-dev @babel/parser @babel/traverse @babel/generator glob

# Use the AST-based remover
node remove-console-ast.js lib/mcp/client-wrapper.ts

# Or process multiple files
node remove-console-ast.js "lib/**/*.ts"
```

The AST-based approach:
- Understands TypeScript/JavaScript syntax
- Handles edge cases better
- Preserves code structure
- Won't break complex expressions

### Manual Review Cases

Some console statements may need manual review:

1. **Console with side effects**: 
   ```typescript
   console.log(someFunction()); // someFunction might have side effects
   ```

2. **Conditional logging**:
   ```typescript
   if (DEBUG) console.log('debug info');
   ```

3. **Multi-line console statements**:
   ```typescript
   console.log(
     'Complex',
     object,
     'with multiple lines'
   );
   ```

## Restoration

If something goes wrong:

```bash
# Restore from .bak files
for file in $(find . -name "*.bak" -o -name "*.console-backup"); do
    original="${file%.bak}"
    original="${original%.console-backup}"
    mv "$file" "$original"
done

# Or restore from git
git checkout -- lib/mcp/client-wrapper.ts lib/mcp/oauth-process-manager.ts
```

## Best Practices

1. **Always create backups** before bulk operations
2. **Review changes** before committing
3. **Run tests** after removal
4. **Consider using a logger** instead of console for production
5. **Use environment checks** for development-only logging:
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     console.log('Development only message');
   }
   ```

## Adding to package.json

You can add these as npm scripts:

```json
{
  "scripts": {
    "console:check": "grep -r 'console\\.(log|error|warn|debug)' --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=.next . | wc -l",
    "console:remove": "./remove-console-logs.sh",
    "console:remove:priority": "for file in lib/mcp/client-wrapper.ts lib/mcp/oauth-process-manager.ts lib/mcp/package-manager/index.ts lib/rag-service.ts lib/auth.ts; do sed -i.bak 's/console\\.\\(log\\|error\\|warn\\|debug\\)([^;]*);/;/g' \"$file\"; done"
  }
}
```

## Summary

1. Use `./remove-console-logs.sh` for the safest, most comprehensive approach
2. The script creates backups and handles most edge cases
3. Always review changes and run tests
4. Consider using proper logging libraries for production code
5. Keep the removal scripts for future use

The automated approach should handle 95%+ of cases safely. Any remaining console statements can be handled manually after review.