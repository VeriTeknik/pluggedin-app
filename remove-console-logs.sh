#!/bin/bash

# Script to safely remove console.log statements from production code
# This script handles various patterns of console statements

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create backup directory
BACKUP_DIR="console-log-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}Console.log Removal Script${NC}"
echo -e "${YELLOW}Creating backups in: $BACKUP_DIR${NC}"
echo ""

# Function to process a file
process_file() {
    local file="$1"
    local backup_file="$BACKUP_DIR/$(basename "$file")"
    
    # Create backup
    cp "$file" "$backup_file"
    
    # Count console statements before
    local before_count=$(grep -c "console\.\(log\|error\|warn\|debug\)" "$file" || echo 0)
    
    if [ "$before_count" -eq 0 ]; then
        echo -e "${YELLOW}No console statements found in: $file${NC}"
        return
    fi
    
    echo -e "${GREEN}Processing: $file (found $before_count console statements)${NC}"
    
    # Create temporary file
    temp_file=$(mktemp)
    
    # Process the file with multiple sed commands
    # This approach handles various patterns safely
    
    # Pattern 1: Single line console statements
    # Matches: console.log('message');
    # Matches: console.error('message');
    # Matches: console.warn('message');
    # Matches: console.debug('message');
    sed -E '/^[[:space:]]*console\.(log|error|warn|debug)\([^;]*\);[[:space:]]*$/d' "$file" > "$temp_file"
    
    # Pattern 2: Single line console statements with comments
    # Matches: console.log('message'); // comment
    sed -E -i '/^[[:space:]]*console\.(log|error|warn|debug)\([^;]*\);[[:space:]]*\/\//d' "$temp_file"
    
    # Pattern 3: Multi-line console statements (most common pattern)
    # This handles console statements that span multiple lines
    sed -E -i ':a; /console\.(log|error|warn|debug)\(/{ :b; /\);/{ s/[[:space:]]*console\.(log|error|warn|debug)\([^)]*\);[[:space:]]*//g; t; }; N; ba; }' "$temp_file"
    
    # Pattern 4: Console statements as part of if/else blocks (preserve the block structure)
    # Replace console statements inside blocks with empty statement
    sed -E -i 's/console\.(log|error|warn|debug)\([^)]*\);/;/g' "$temp_file"
    
    # Pattern 5: Clean up any remaining empty statements or double semicolons
    sed -E -i 's/;;/;/g' "$temp_file"
    sed -E -i 's/^[[:space:]]*;[[:space:]]*$//' "$temp_file"
    
    # Pattern 6: Clean up empty if blocks that might result
    sed -E -i '/if[[:space:]]*\([^)]*\)[[:space:]]*{[[:space:]]*}/d' "$temp_file"
    
    # Move processed file back
    mv "$temp_file" "$file"
    
    # Count console statements after
    local after_count=$(grep -c "console\.\(log\|error\|warn\|debug\)" "$file" || echo 0)
    local removed=$((before_count - after_count))
    
    echo -e "${GREEN}  Removed $removed console statements${NC}"
    
    if [ "$after_count" -gt 0 ]; then
        echo -e "${YELLOW}  Warning: $after_count console statements remain (may need manual review)${NC}"
    fi
}

# High priority files (sorted by number of occurrences)
HIGH_PRIORITY_FILES=(
    "lib/mcp/client-wrapper.ts"
    "lib/mcp/oauth-process-manager.ts"
    "lib/mcp/package-manager/index.ts"
    "lib/rag-service.ts"
    "lib/auth.ts"
)

# Process high priority files first
echo -e "${GREEN}Processing high-priority files...${NC}"
echo ""

for file in "${HIGH_PRIORITY_FILES[@]}"; do
    if [ -f "$file" ]; then
        process_file "$file"
        echo ""
    else
        echo -e "${RED}File not found: $file${NC}"
    fi
done

# Ask if user wants to process all TypeScript/JavaScript files
echo ""
echo -e "${YELLOW}Would you like to process ALL TypeScript/JavaScript files in the project? (y/n)${NC}"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${GREEN}Processing all TypeScript/JavaScript files...${NC}"
    echo ""
    
    # Find all .ts, .tsx, .js, .jsx files excluding node_modules and common build directories
    find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
        -not -path "./node_modules/*" \
        -not -path "./.next/*" \
        -not -path "./dist/*" \
        -not -path "./build/*" \
        -not -path "./$BACKUP_DIR/*" \
        -print0 | while IFS= read -r -d '' file; do
        
        # Skip if already processed
        skip=false
        for processed in "${HIGH_PRIORITY_FILES[@]}"; do
            if [ "$file" = "./$processed" ]; then
                skip=true
                break
            fi
        done
        
        if [ "$skip" = false ]; then
            process_file "$file"
            echo ""
        fi
    done
fi

echo ""
echo -e "${GREEN}Console.log removal complete!${NC}"
echo -e "${YELLOW}Backups saved in: $BACKUP_DIR${NC}"
echo ""
echo -e "${YELLOW}Recommendations:${NC}"
echo "1. Review the changes with: git diff"
echo "2. Run your tests to ensure nothing broke"
echo "3. Check for any remaining console statements with:"
echo "   grep -r 'console\.\(log\|error\|warn\|debug\)' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.next ."
echo "4. If everything looks good, commit the changes"
echo "5. To restore from backup: cp $BACKUP_DIR/* ."