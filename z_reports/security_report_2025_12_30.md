# Security and Best Practices Report
**Branch:** `develop`
**Date:** 2025-12-30

## Executive Summary
The codebase generally demonstrates strong adherence to modern web development standards, utilizing **Next.js 15**, **TypeScript**, **Drizzle ORM**, and **Zod** for type safety and validation. The architecture for agent management involves robust state handling and lifecycle event logging.

However, a few areas regarding **Security Headers** consistency and **Data Encryption** for agent configurations warrant attention.

## Security Findings

### 1. Plain Text Storage of Potential Secrets (Medium)
**File:** `db/schema.ts` (agentsTable)
**File:** `app/api/agents/route.ts`

-   **Observation**: The `env_overrides` field in `agentsTable` is stored as part of the `metadata` JSONB column (or `env_overrides` inside creates).
-   **Risk**: Users often place API keys and other secrets in environment variables. Currently, these are stored in plain text in the database.
-   **Comparison**: The `mcpServersTable` correctly uses `env_encrypted` fields for sensitive data.
-   **Recommendation**: Implement an encrypted column for agent environment variables (e.g., `env_overrides_encrypted`) similar to the MCP server implementation.

### 2. Duplicate Content Security Policy (CSP) Logic (Low)
**File:** `lib/security-headers.ts`
**File:** `lib/csp-nonce.ts`

-   **Observation**: There are two separate files managing CSP headers and Nonce generation.
    -   `lib/csp-nonce.ts` appears to be the newer implementation for Next.js 15+ (using `headers()` async API).
    -   `lib/security-headers.ts` contains overlapping logic with slightly different directive values (e.g., `connect-src` lists).
-   **Risk**: Inconsistent security policies. Updates to one file (e.g., allowing a new API domain) might be missed in the other, leading to breakage or security gaps.
-   **Recommendation**: Deprecate `lib/security-headers.ts` in favor of `lib/csp-nonce.ts` or merge them into a single source of truth.

### 3. Weak Nonce Fallback (Low)
**File:** `lib/security-headers.ts`

-   **Observation**: The `generateNonce` function includes a fallback to `Math.random()`:
    ```typescript
    // Last resort fallback (not cryptographically secure)
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
    ```
-   **Risk**: While unlikely to be hit in a Node.js/Edge environment where `crypto` is available, this fallback is cryptographically insecure.
-   **Recommendation**: Remove the insecure fallback or ensure it throws an error if `crypto` is unavailable.

## Best Practices Findings

### 1. Admin Authentication Robustness
**File:** `app/admin/agent-templates/actions.ts` etc.

-   **Observation**: The `checkAdminAuth` function checks the database `is_admin` flag first, then falls back to verifying if the user's email is in the `ADMIN_NOTIFICATION_EMAILS` environment variable.
-   **Status**: **Good**. This provides a secure recovery mechanism while preferring DB status.
-   **Note**: Ensure `ADMIN_NOTIFICATION_EMAILS` is strictly managed in your deployment environment.

### 2. Input Validation
**File:** `app/api/agents/route.ts`

-   **Observation**: Strong validation is in place.
    -   **Zod** schemas for resource limits (`cpu_request`, etc.).
    -   **Size limits** manually enforced for `env_overrides` (64KB max, 8KB per value).
    -   **Control character** checks for environment values.
-   **Status**: **Excellent**. These checks prevent DoS attacks and injection of malformed data.

### 3. Agent Lifecycle Management
**File:** `app/admin/clusters/agent-actions.ts`

-   **Observation**: Actions like `terminateAgent` and `resumeAgent` strictly check current agent state (e.g., can only resume if `DRAINING`).
-   **Status**: **Good**. State machine logic is preserved even in admin overrides.

## Summary of Recommendations

| Priority | Category | Recommendation |
| :--- | :--- | :--- |
| **P1** | Security | encrypt `env_overrides` in `agentsTable` to protect user secrets. |
| **P2** | Refactor | Consolidate CSP logic by keeping `lib/csp-nonce.ts` and removing/merging `lib/security-headers.ts`. |
| **P3** | Security | Remove `Math.random()` fallback in nonce generation. |
