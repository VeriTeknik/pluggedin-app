# Package Update Plan for pluggedin-app

Generated: 2025-10-20

## Update Strategy Overview

This document outlines a safe, phased approach to updating outdated packages without breaking the system.

---

## ⚠️ Deprecated Packages (Remove or Replace)

These packages are deprecated and should be handled:

1. **@types/diff** (8.0.0 → Deprecated)
   - Action: Consider removing if unused, or switch to official types
   - Risk: Low (dev dependency)

2. **@types/ioredis** (5.0.0 → Deprecated)
   - Action: ioredis now includes its own types, remove this package
   - Risk: Low (dev dependency)

---

## ✅ Phase 1: Low-Risk Updates (Patch/Minor - Safe to update immediately)

These are patch or minor version updates with minimal breaking change risk:

### Dependencies
```bash
# Next.js ecosystem (coordinated update)
pnpm update next@15.5.6 eslint-config-next@15.5.6 @next/bundle-analyzer@15.5.6

# Type definitions (dev)
pnpm update @types/node@24.9.1 @types/react@19.2.2 @types/react-dom@19.2.2 @types/nodemailer@7.0.2

# TypeScript & Linting (dev)
pnpm update typescript@5.9.3 @typescript-eslint/eslint-plugin@8.46.2 eslint@9.38.0 eslint-plugin-unused-imports@4.3.0

# Utilities (low risk)
pnpm update dotenv@17.2.3 nanoid@5.1.6 lru-cache@11.2.2 tsx@4.20.6

# Form handling
pnpm update @hookform/resolvers@5.2.2 react-hook-form@7.65.0

# UI/Animation
pnpm update framer-motion@12.23.24 react-day-picker@9.11.1 lucide-react@0.546.0

# Email & Logging
pnpm update nodemailer@7.0.9 pino-pretty@13.1.2

# Markdown & Text
pnpm update marked@16.4.1 i18next@25.6.0

# Database (coordinated update)
pnpm update drizzle-orm@0.44.6 drizzle-kit@0.31.5

# Testing (dev)
pnpm update @testing-library/jest-dom@6.9.1

# Build tools (dev)
pnpm update knip@5.66.2 @tailwindcss/typography@0.5.19
```

**Estimated Time:** 5-10 minutes
**Testing Required:** Run tests, verify build, check dev server
**Risk Level:** 🟢 Low

---

## ⚠️ Phase 2: Medium-Risk Updates (Minor versions with potential API changes)

These require more careful testing:

### React 19.1 → 19.2
```bash
pnpm update react@19.2.0 react-dom@19.2.0
```
**Testing:** Verify all React components, hooks, and server components work correctly
**Risk Level:** 🟡 Medium

### Database & Auth
```bash
pnpm update @auth/drizzle-adapter@1.11.0
```
**Testing:** Verify authentication flows, session management
**Risk Level:** 🟡 Medium

### MCP SDK
```bash
pnpm update @modelcontextprotocol/sdk@1.20.1
```
**Testing:** Verify all MCP server connections, proxy functionality
**Risk Level:** 🟡 Medium

### Monitoring & Security
```bash
pnpm update @sentry/nextjs@10.20.0
pnpm update dompurify@3.3.0
```
**Testing:** Verify error tracking, sanitization still works
**Risk Level:** 🟡 Medium

### Other Medium-Risk
```bash
pnpm update ioredis@5.8.1
pnpm update mammoth@1.11.0
pnpm update p-limit@7.2.0
pnpm update recharts@3.3.0
```
**Testing:** Verify Redis operations, document parsing, charts rendering
**Risk Level:** 🟡 Medium

**Estimated Time:** 20-30 minutes
**Testing Required:** Full regression testing, E2E tests
**Risk Level:** 🟡 Medium

---

## 🔴 Phase 3: High-Risk Updates (Major versions - DEFER or plan carefully)

### Critical: DO NOT UPDATE Yet (Breaking Changes Expected)

#### 1. **Tailwind CSS 3.4.17 → 4.1.15** 🚨
- **Breaking:** Major CSS framework rewrite
- **Impact:** Could break ALL styling across the app
- **Recommendation:** DEFER until dedicated upgrade sprint
- **Migration Guide:** https://tailwindcss.com/docs/upgrade-guide

#### 2. **Zod 3.25.76 → 4.1.12** 🚨
- **Breaking:** Major validation library changes
- **Impact:** All form validation, API validation schemas
- **Recommendation:** DEFER - requires schema migration
- **Migration Guide:** Check Zod v4 changelog

#### 3. **LangChain Packages 0.x → 1.0** 🚨
```
@langchain/anthropic: 0.3.26 → 1.0.0
@langchain/core: 0.3.73 → 1.0.1
@langchain/google-genai: 0.2.17 → 1.0.0
@langchain/langgraph: 0.4.9 → 1.0.0
@langchain/openai: 0.6.11 → 1.0.0
```
- **Breaking:** Major API changes for 1.0 release
- **Impact:** Embedded chat, RAG features, LLM integrations
- **Recommendation:** DEFER - test in separate branch first
- **Migration Guide:** Check LangChain.js v1.0 migration docs

#### 4. **pino 9.9.2 → 10.1.0** 🚨
- **Breaking:** Major logging library changes
- **Impact:** All application logging
- **Recommendation:** Update with caution, test logging thoroughly

#### 5. **rate-limiter-flexible 7.3.1 → 8.1.0** 🚨
- **Breaking:** Major rate limiting changes
- **Impact:** Security, API protection
- **Recommendation:** Critical security component - test extensively

#### 6. **uuid 11.1.0 → 13.0.0** 🚨
- **Breaking:** Skips v12, major changes
- **Impact:** ID generation throughout app
- **Recommendation:** Update carefully, verify ID generation

#### 7. **react-i18next 15.7.3 → 16.1.2** 🚨
- **Breaking:** Major i18n changes
- **Impact:** All translations (6 languages)
- **Recommendation:** Test all language switching, translations

#### 8. **react-pdf 9.1.1 → 10.2.0** 🚨
- **Breaking:** Major PDF rendering changes
- **Impact:** Document library PDF viewing
- **Recommendation:** Test PDF rendering thoroughly

#### 9. **Testing Tools**
```bash
@vitejs/plugin-react: 4.7.0 → 5.0.4
jsdom: 26.1.0 → 27.0.1
```
- **Impact:** Test infrastructure
- **Recommendation:** Update in separate PR, verify all tests pass

#### 10. **@types/uuid 10.0.0 → 11.0.0**
- **Breaking:** Type definitions change
- **Impact:** TypeScript compilation
- **Recommendation:** Update with uuid package together

---

## 📋 Recommended Immediate Actions

### Step 1: Remove Deprecated Packages
```bash
# Remove deprecated type packages
pnpm remove @types/ioredis @types/diff
```

### Step 2: Apply Phase 1 Updates (Low Risk)
```bash
# Run all Phase 1 updates together
pnpm update \
  next@15.5.6 \
  eslint-config-next@15.5.6 \
  @next/bundle-analyzer@15.5.6 \
  @types/node@24.9.1 \
  @types/react@19.2.2 \
  @types/react-dom@19.2.2 \
  @types/nodemailer@7.0.2 \
  typescript@5.9.3 \
  @typescript-eslint/eslint-plugin@8.46.2 \
  eslint@9.38.0 \
  eslint-plugin-unused-imports@4.3.0 \
  dotenv@17.2.3 \
  nanoid@5.1.6 \
  lru-cache@11.2.2 \
  tsx@4.20.6 \
  @hookform/resolvers@5.2.2 \
  react-hook-form@7.65.0 \
  framer-motion@12.23.24 \
  react-day-picker@9.11.1 \
  lucide-react@0.546.0 \
  nodemailer@7.0.9 \
  pino-pretty@13.1.2 \
  marked@16.4.1 \
  i18next@25.6.0 \
  drizzle-orm@0.44.6 \
  drizzle-kit@0.31.5 \
  @testing-library/jest-dom@6.9.1 \
  knip@5.66.2 \
  @tailwindcss/typography@0.5.19

# Test immediately after
pnpm lint
pnpm test
pnpm build
```

### Step 3: Verify Everything Works
```bash
# Clean and test
pnpm clean
pnpm dev

# In another terminal, run tests
pnpm test

# Check build
pnpm build
```

---

## 🧪 Testing Checklist After Updates

### Critical Paths to Test:
- [ ] Application starts without errors
- [ ] Authentication works (login/logout/register)
- [ ] MCP servers connect and function
- [ ] Embedded chat works with all LLM providers
- [ ] Document library (upload, view PDFs, RAG queries)
- [ ] Language switching (all 6 languages)
- [ ] Database operations (CRUD on all entities)
- [ ] Social features (follow, share, discover)
- [ ] API endpoints respond correctly
- [ ] Rate limiting works
- [ ] Email notifications send
- [ ] All tests pass: `pnpm test`
- [ ] Build completes: `pnpm build`
- [ ] Linter passes: `pnpm lint`

---

## 📅 Future Planning

### Scheduled for Later (Separate PRs/Branches)

1. **Tailwind CSS 4 Migration**
   - Create feature branch
   - Update all styling
   - Test entire UI
   - Timeline: 1-2 weeks

2. **Zod 4 Migration**
   - Audit all validation schemas
   - Update schema definitions
   - Test all forms and APIs
   - Timeline: 1 week

3. **LangChain 1.0 Migration**
   - Review breaking changes
   - Update embedded chat
   - Update RAG integration
   - Test all LLM providers
   - Timeline: 1-2 weeks

4. **Other Major Updates**
   - Plan individual migration for each
   - Test in isolation
   - Timeline: As needed

---

## 🎯 Summary

**Safe to update now:** ~30 packages (Phase 1)
**Update with testing:** ~10 packages (Phase 2)
**Defer/Plan carefully:** ~10 packages (Phase 3)

**Total time estimate:**
- Phase 1: 30 minutes (update + test)
- Phase 2: 1-2 hours (update + thorough testing)
- Phase 3: Multiple weeks (dedicated migration efforts)

**Recommendation:** Start with Phase 1 today, then tackle Phase 2 after verification. Plan Phase 3 updates as separate initiatives.
