# Console.log Removal Commands

This document contains various sed commands to remove console.log statements from your code.

## Quick One-Liner Commands

### 1. Remove Simple Single-Line Console Statements
```bash
# This removes complete lines that only contain console statements
sed -i.bak '/^[[:space:]]*console\.\(log\|error\|warn\|debug\).*);[[:space:]]*$/d' filename.ts
```

### 2. Remove All Console Statements (More Aggressive)
```bash
# This replaces all console statements with empty statements, preserving code structure
sed -i.bak 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' filename.ts
```

### 3. Process Multiple Files at Once
```bash
# For the high-priority files
for file in lib/mcp/client-wrapper.ts lib/mcp/oauth-process-manager.ts lib/mcp/package-manager/index.ts lib/rag-service.ts lib/auth.ts; do
    sed -i.bak 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' "$file"
done
```

### 4. Find and Count Console Statements
```bash
# Count console statements in a file
grep -c "console\.\(log\|error\|warn\|debug\)" filename.ts

# Find all console statements in the project
grep -r "console\.\(log\|error\|warn\|debug\)" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next .
```

### 5. Advanced Multi-Line Console Removal
```bash
# This handles multi-line console statements (use with caution)
perl -0pe 's/console\.(log|error|warn|debug)\([^)]*\);//gs' filename.ts > filename.cleaned.ts
```

## Using the Automated Script

The safest approach is to use the provided script:

```bash
./remove-console-logs.sh
```

This script will:
1. Create backups of all modified files
2. Process high-priority files first
3. Optionally process all TypeScript/JavaScript files
4. Show a summary of removed statements
5. Provide restoration instructions

## Manual Approach for Specific Files

### For lib/mcp/client-wrapper.ts (22 occurrences)
```bash
# Backup first
cp lib/mcp/client-wrapper.ts lib/mcp/client-wrapper.ts.bak

# Remove console statements
sed -i 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' lib/mcp/client-wrapper.ts

# Clean up empty statements and double semicolons
sed -i 's/;;/;/g' lib/mcp/client-wrapper.ts
sed -i '/^[[:space:]]*;[[:space:]]*$/d' lib/mcp/client-wrapper.ts
```

### For lib/mcp/oauth-process-manager.ts (12 occurrences)
```bash
# Backup first
cp lib/mcp/oauth-process-manager.ts lib/mcp/oauth-process-manager.ts.bak

# Remove console statements
sed -i 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' lib/mcp/oauth-process-manager.ts
```

### For lib/rag-service.ts (9 occurrences)
```bash
# Backup first
cp lib/rag-service.ts lib/rag-service.ts.bak

# Remove console statements
sed -i 's/console\.\(log\|error\|warn\|debug\)([^;]*);/;/g' lib/rag-service.ts
```

## Verification Commands

After removal, verify the results:

```bash
# Check if any console statements remain
grep -n "console\.\(log\|error\|warn\|debug\)" lib/mcp/client-wrapper.ts

# See what changed
git diff lib/mcp/client-wrapper.ts

# Run your tests
pnpm test
```

## Restoration

If something goes wrong:

```bash
# Restore from .bak files
for file in $(find . -name "*.bak"); do
    mv "$file" "${file%.bak}"
done

# Or restore from git
git checkout -- lib/mcp/client-wrapper.ts lib/mcp/oauth-process-manager.ts
```

## Important Notes

1. **Always create backups** before running sed commands
2. **Review changes** with `git diff` before committing
3. **Run tests** to ensure functionality isn't broken
4. Some console statements might be inside conditional blocks or have side effects - these may need manual review
5. The automated script handles most edge cases but manual review is recommended for critical files

## Special Cases to Watch For

1. **Commented Console Statements**: Already commented out, can be left as-is
2. **Console Statements with Side Effects**: Like `console.log(someFunction())` - need manual review
3. **Multi-line Console Statements**: The script handles these, but verify the output
4. **Console Statements in String Templates**: May need special handling

## Recommended Workflow

1. Run the automated script first
2. Review the changes with `git diff`
3. Run your test suite
4. Manually check any files with remaining console statements
5. Commit the changes once verified