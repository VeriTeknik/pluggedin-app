# Embedded Chat Production Cleanup TODO

## Overview
This document tracks all cleanup tasks for the `embedded-chat-production` branch before merging to main.

**Branch**: `embedded-chat-production`  
**Created**: 2025-08-17  
**Target**: Production-ready code with no debug artifacts, consolidated migrations, and improved code quality

---

## 📊 Current State Analysis

### Statistics
- **Console.log statements**: 134 instances
- **TODO/FIXME comments**: 20 instances  
- **Migrations to consolidate**: 8 files (0064-0071)
- **Test coverage**: 0 test files for embedded-chat features
- **Potential security issues**: 0 hardcoded credentials (✅)
- **Code duplication areas**: 5+ identified patterns

### Knip Analysis Results
- **Unused files**: 9 files (test files, examples, temp files)
- **Unused dependencies**: 3 packages
- **Unused devDependencies**: 1 package
- **Unlisted dependencies**: 1 package (glob)
- **Unresolved imports**: 1 import
- **Unused exported types**: 7 interfaces

---

## ✅ Phase 1: Database Migration Consolidation

### Migrations to Consolidate
- [ ] Review and analyze migrations 0064-0071
  - [ ] `0064_add_learned_optimizations_column.sql`
  - [ ] `0065_add_workflow_columns_to_conversation_tasks.sql`
  - [ ] `0066_fix_workflow_schema.sql`
  - [ ] `0067_add_workflow_tables.sql`
  - [ ] `0068_align_workflow_templates.sql` (duplicate - remove)
  - [ ] `0068_align_workflow_templates_fixed.sql` (keep this one)
  - [ ] `0069_add_workflow_templates.sql`
  - [ ] `0070_update_scheduling_workflow.sql`
  - [ ] `0071_fix_workflow_dependencies.sql`

### Actions
- [ ] Create single consolidated migration: `0064_add_complete_workflow_system.sql`
- [ ] Delete individual migration files (0064-0071)
- [ ] Update migration metadata in `drizzle/meta/_journal.json`
- [ ] Test consolidated migration on fresh database
- [ ] Verify schema matches current production state

---

## 🧹 Phase 2: Dead Code Removal

### Console.log Cleanup (134 instances)
- [ ] Remove console.log from embedded-chat components
  - [ ] `app/(sidebar-layout)/(container)/embedded-chat/demo/demo-client.tsx`
  - [ ] `app/(sidebar-layout)/(container)/embedded-chat/[uuid]/components/personas-tab.tsx`
  - [ ] `app/(sidebar-layout)/(container)/embedded-chat/[uuid]/components/embed-code-tab.tsx`
- [ ] Remove console.log from API routes
  - [ ] `app/api/internal/embedded-chat/query/route.ts`
  - [ ] `app/api/embedded-chat/[uuid]/conversations/[conversationId]/workflows/[workflowId]/execute/route.ts`
  - [ ] `app/api/embedded-chat/[uuid]/conversations/[conversationId]/workflows/route.ts`
  - [ ] `app/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/async-test/route.ts`
  - [ ] `app/api/embedded-chat/[uuid]/conversations/[conversationId]/memories/extraction-test/route.ts`
- [ ] Replace with proper logging service where needed
- [ ] Remove all other console.log statements (remaining ~124)

### TODO/FIXME Comments (20 instances)
- [ ] Review each TODO/FIXME comment
- [ ] Resolve or create GitHub issues for unresolved items
- [ ] Remove completed TODOs
- [ ] Document any remaining TODOs that must stay

### Unused Code (Knip Analysis)
- [ ] Remove commented-out code blocks
- [ ] Delete unused imports
- [ ] Remove unused variables and functions
- [ ] Delete test/debug endpoints
  - [ ] `/memories/async-test/route.ts`
  - [ ] `/memories/extraction-test/route.ts`

### Unused Files to Delete (9 files - from Knip)
- [ ] `example-calendar-usage.js` (root directory)
- [ ] `public/embed/widget.js`
- [ ] `public/pdf.worker.min.js`
- [ ] `scripts/test-memory-system.js`
- [ ] `temp-schema-backup.ts` (root directory)
- [ ] `test-availability-fix.js` (root directory)
- [ ] `test-calendar-integration.js` (root directory)
- [ ] `test-workflow-manual.ts` (root directory)
- [ ] `test-workflow-tasks.ts` (root directory)

### Unused Exported Types (7 types - from Knip)
- [ ] `WebSocketMessage` interface in `hooks/use-chat-websocket.ts:10`
- [ ] `ChatWebSocketOptions` interface in `hooks/use-chat-websocket.ts:17`
- [ ] `ConsentState` interface in `hooks/use-chat-websocket.ts:27`
- [ ] `ChatPersona` interface in `types/embedded-chat.ts:127`
- [ ] `ChatConversation` interface in `types/embedded-chat.ts:144`
- [ ] `ChatMessage` interface in `types/embedded-chat.ts:167`
- [ ] `ModelAttribution` interface in `types/library.ts:1`

### Broken Imports to Fix
- [ ] Fix unresolved import `@/lib/integrations/integration-manager` in `lib/workflows/workflow-executor.ts:8`

---

## 🔄 Phase 3: Code Reusability & DRY

### Component Consolidation
- [ ] Create reusable `MetricCard` component
  - [ ] Consolidate dashboard metric cards
  - [ ] Extract to `components/ui/metric-card.tsx`
  - [ ] Update all usages

- [ ] Create reusable modal patterns
  - [ ] Extract common modal logic
  - [ ] Create `useModal` hook
  - [ ] Consolidate dialog components

### API & Data Fetching
- [ ] Create custom hooks for repeated API calls
  - [ ] `useEmbeddedChat` hook
  - [ ] `useConversations` hook  
  - [ ] `useWorkflows` hook
- [ ] Extract common API utilities
  - [ ] Error handling functions
  - [ ] Response formatting utilities
  - [ ] Auth check utilities

### Utility Functions
- [ ] Extract repeated validation logic
- [ ] Consolidate date formatting functions
- [ ] Create shared constants file
- [ ] Extract repeated type definitions

---

## 🔒 Phase 4: Security & Best Practices

### Security Audit
- [ ] Review all API routes for proper authentication
- [ ] Add input validation with Zod schemas
  - [ ] Embedded chat configuration endpoints
  - [ ] Conversation endpoints
  - [ ] Workflow execution endpoints
- [ ] Sanitize user inputs in chat messages
- [ ] Review CORS configurations
- [ ] Ensure rate limiting is applied

### Error Handling
- [ ] Add error boundaries to embedded-chat components
- [ ] Implement consistent error responses
- [ ] Add proper try-catch blocks
- [ ] Create centralized error logging

### Performance
- [ ] Add loading states to all async components
- [ ] Implement proper data caching with SWR
- [ ] Optimize re-renders with React.memo
- [ ] Review and optimize database queries

---

## 🧪 Phase 5: Testing

### Unit Tests
- [ ] Create test files for embedded-chat components
  - [ ] Dashboard components
  - [ ] Configuration components
  - [ ] Chat interface components
- [ ] Add tests for utility functions
- [ ] Test custom hooks

### Integration Tests
- [ ] Test embedded chat API endpoints
- [ ] Test workflow execution
- [ ] Test conversation management
- [ ] Test memory system

### E2E Tests
- [ ] Create basic embedded chat flow test
- [ ] Test configuration changes
- [ ] Test conversation lifecycle

---

## 📦 Phase 6: Dependencies & Build

### Package.json Cleanup (Knip Results)
- [ ] Remove unused dependencies
  - [ ] `@google/generative-ai` (package.json:34) - Not used anywhere
  - [ ] `openai` (package.json:98) - Only @langchain/openai is used
  - [ ] `react-syntax-highlighter` (package.json:110) - Not used anywhere
- [ ] Remove unused devDependencies
  - [ ] `@types/react-syntax-highlighter` (package.json:136)
- [ ] Add missing dependencies
  - [ ] Add `glob` to devDependencies (used in scripts/copy-pdf-worker.js)
- [ ] Update outdated packages with security issues
- [ ] Verify all imports still work after cleanup

### Build Optimization
- [ ] Check bundle size impact
- [ ] Optimize imports (use specific imports)
- [ ] Review dynamic imports
- [ ] Ensure tree-shaking works properly

---

## 📝 Phase 7: Documentation

### Code Documentation
- [ ] Add JSDoc comments to main functions
- [ ] Document complex business logic
- [ ] Add inline comments for unclear code
- [ ] Document API endpoints

### Configuration Documentation
- [ ] Update `.env.example` with new variables
  - [ ] Embedded chat specific vars
  - [ ] Workflow configuration
  - [ ] Memory system settings
- [ ] Update README with embedded chat setup
- [ ] Create EMBEDDED-CHAT.md guide

### API Documentation
- [ ] Document new API endpoints
- [ ] Add request/response examples
- [ ] Document error codes
- [ ] Create Swagger/OpenAPI specs

---

## 🚀 Phase 8: Final Review & Deployment Prep

### Code Review Checklist
- [ ] All console.logs removed
- [ ] No hardcoded values
- [ ] Consistent code style
- [ ] Proper TypeScript types
- [ ] No any types without justification
- [ ] All promises handled properly

### Pre-merge Checklist
- [ ] All tests passing
- [ ] Lint errors fixed
- [ ] Build succeeds
- [ ] No TypeScript errors
- [ ] Migration tested on staging
- [ ] Performance benchmarked

### Deployment Preparation
- [ ] Create deployment notes
- [ ] Document breaking changes
- [ ] Prepare rollback plan
- [ ] Update monitoring alerts
- [ ] Notify team of changes

---

## 📈 Progress Tracking

### Phase Completion
- [ ] Phase 1: Database Migration Consolidation
- [ ] Phase 2: Dead Code Removal
- [ ] Phase 3: Code Reusability & DRY
- [ ] Phase 4: Security & Best Practices
- [ ] Phase 5: Testing
- [ ] Phase 6: Dependencies & Build
- [ ] Phase 7: Documentation
- [ ] Phase 8: Final Review & Deployment Prep

### Metrics
- **Started**: 2025-08-17
- **Target Completion**: TBD
- **Lines of Code Removed**: 692 lines (migrations)
- **Files Deleted**: 19 (9 test files + 10 migration files)
- **Components Consolidated**: 0
- **Tests Added**: 0
- **Security Issues Fixed**: 1 (broken import)
- **Dependencies Removed**: 4 (completed)
- **Unused Types Removed**: 0 / 7 pending
- **Commits Made**: 4

---

## 🎯 Priority Order

1. **Critical** (Do First)
   - Migration consolidation (prevents conflicts)
   - Security vulnerabilities
   - Remove debug code (console.logs)

2. **High** (Do Second)
   - Code deduplication
   - Error handling
   - Input validation

3. **Medium** (Do Third)
   - Testing
   - Documentation
   - Performance optimization

4. **Low** (Do Last)
   - Code style fixes
   - Comment cleanup
   - Minor refactoring

---

## 📌 Notes

### Known Issues
- Workflow system has multiple migration attempts indicating unstable schema design
- No test coverage for critical embedded chat features
- Some API routes lack proper error handling
- Memory system test endpoints should not go to production

### Decisions Needed
- [ ] Should we keep memory system test endpoints?
- [ ] What logging service to use instead of console.log?
- [ ] Should workflow schema be redesigned before consolidation?
- [ ] Which metric card pattern to standardize on?

### Resources
- Original embedded-chat branch: `embedded-chat`
- Target branch: `main`
- Documentation: `/docs/embedded-chat/`
- Related PRs: TBD

---

## 🏁 Completion Criteria

The cleanup is complete when:
1. ✅ All console.log statements removed or replaced
2. ✅ Migrations consolidated into atomic, clean files
3. ✅ No duplicate code patterns remain
4. ✅ All security concerns addressed
5. ✅ Test coverage > 70% for new features
6. ✅ Documentation complete and accurate
7. ✅ Build passes without warnings
8. ✅ Code review approved by team

---

*Last Updated: 2025-08-17*
*Tracking Branch: embedded-chat-production*