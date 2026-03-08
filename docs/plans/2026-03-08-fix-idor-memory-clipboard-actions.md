# Plan: Fix IDOR in Memory & Clipboard Server Actions

## Problem

Server actions in `app/actions/memory.ts` and `app/actions/clipboard.ts` accept `userId` as a client-provided parameter instead of reading it from the authenticated server session. This is a Broken Access Control (IDOR) vulnerability — any authenticated user could call these actions with another user's ID to access their data.

The correct pattern already exists in the same file: `submitCBPFeedback`, `queryCBPPatterns`, and `getCBPStats` use `getServerSession(authOptions)` to resolve the user server-side.

## Approach

**Approach A**: Shared `requireAuthUserId()` helper + update `createProfileAction` HOF.

### Priority Order

1. Create `requireAuthUserId()` helper in `app/actions/memory.ts` (and clipboard)
2. Update `createProfileAction` to resolve auth internally (no `userId` param)
3. Remove `userId` param from all exported server actions
4. Update all SWR hooks to stop passing `session.user.id`

## Scope

| File | Changes |
|------|---------|
| `app/actions/memory.ts` | Remove `userId` param from 14 actions, add `requireAuthUserId()`, update `createProfileAction` |
| `app/actions/clipboard.ts` | Remove `userId` param from all actions, add or import `requireAuthUserId()` |
| `app/(sidebar-layout)/(container)/memory/hooks/useMemorySessions.ts` | Remove `session.user.id` from SWR fetcher calls |
| `app/(sidebar-layout)/(container)/memory/hooks/useMemorySearch.ts` | Remove `session.user.id` from fetcher calls |
| `app/(sidebar-layout)/(container)/memory/hooks/useMemoryStats.ts` | Remove `session.user.id` from fetcher calls |
| `app/(sidebar-layout)/(container)/memory/hooks/useMemoryRing.ts` | Remove `session.user.id` from fetcher calls |
| `app/(sidebar-layout)/(container)/memory/hooks/useClipboard.ts` | Remove `session.user.id` from fetcher calls |

**Out of scope** (follow-up PRs): `app/actions/library.ts`, `app/actions/social.ts`, `app/actions/roadmap.ts`, `app/actions/registry-servers.ts`.

## Implementation Steps

### Step 1: Create shared auth helper

Add to `app/actions/memory.ts` (top of file, after imports):

```typescript
async function requireAuthUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }
  return session.user.id;
}
```

Note: `getServerSession` and `authOptions` are already imported in memory.ts.

### Step 2: Update `createProfileAction` HOF

Change signature from `(userId: string, input: unknown)` to `(input: unknown)`:

```typescript
function createProfileAction<I, O = unknown>(
  schema: z.ZodSchema<I>,
  handler: (parsed: I, profileUuid: string) => Promise<MemoryResult<O>>
): (input?: unknown) => Promise<MemoryResult<O>> {
  return async (input?: unknown): Promise<MemoryResult<O>> => {
    try {
      const userId = await requireAuthUserId();
      const parsed = schema.parse(input);
      const profileUuid = await getActiveProfileUuid(userId);
      if (!profileUuid) {
        return { success: false, error: 'No active profile found' };
      }
      return handler(parsed, profileUuid);
    } catch (error) {
      return formatError(error);
    }
  };
}
```

### Step 3: Update manual server actions (memory.ts)

For each action that manually accepts `userId`:

**Before:**
```typescript
export async function getMemorySessions(
  userId: string,
  options?: { ... }
): Promise<MemoryResult> {
  try {
    const parsed = getSessionsSchema.parse(options);
    const profileUuid = await getActiveProfileUuid(userId);
    ...
```

**After:**
```typescript
export async function getMemorySessions(
  options?: { ... }
): Promise<MemoryResult> {
  try {
    const userId = await requireAuthUserId();
    const parsed = getSessionsSchema.parse(options);
    const profileUuid = await getActiveProfileUuid(userId);
    ...
```

Actions to update (remove `userId` param, add `requireAuthUserId()` call):
- `startMemorySession`
- `endMemorySession`
- `getMemorySessions`
- `addObservation`
- `getSessionObservations`
- `searchMemories`
- `getMemoryTimeline`
- `getMemoryDetails`
- `getMemoryRing`
- `deleteMemory`
- `getMemoryStats`
- `getZReports`
- `triggerClassification`
- `triggerDecay`

Actions using `createProfileAction` (auto-fixed by Step 2):
- `_searchMemories` / `searchMemories`
- `_getMemoryTimeline` / `getMemoryTimeline`
- `_getMemoryDetails` / `getMemoryDetails`
- `_getMemoryRing` / `getMemoryRing`
- `_deleteMemory` / `deleteMemory`
- `injectWithArchetypeAction`
- `getIndividuationScoreAction`
- `getIndividuationHistoryAction`

### Step 4: Update clipboard.ts

Same pattern — add `requireAuthUserId()` (or import shared), remove `userId` from:
- `getClipboardEntries`
- `setClipboardEntry`
- `deleteClipboardEntry`
- `clearAllClipboardEntries`
- `getClipboardStats`

### Step 5: Update SWR hooks

Remove `session.user.id` from fetcher calls. Hooks still use `session?.user?.id` in SWR keys for cache invalidation (this is fine — it's a cache key, not auth).

**Before:**
```typescript
async () => getMemorySessions(session!.user!.id, options)
```

**After:**
```typescript
async () => getMemorySessions(options)
```

Apply to all 5 hooks:
- `useMemorySessions` (2 fetchers: sessions + z-reports)
- `useMemorySearch` (3 fetchers: search, timeline, details)
- `useMemoryStats` (1 fetcher)
- `useMemoryRing` (2 calls: get + delete)
- `useClipboard` (3 calls: get, set, delete)

### Step 6: Type-check and test

- `npx tsc --noEmit` to verify no type errors
- `pnpm test` to run existing tests
- Manual verification that memory page loads correctly

## Verification Checklist

- [ ] No server action accepts `userId` as a parameter
- [ ] All actions call `requireAuthUserId()` or use updated `createProfileAction`
- [ ] All SWR hooks updated to not pass userId
- [ ] `tsc --noEmit` passes (for our files)
- [ ] Existing tests pass
- [ ] CBP actions unchanged (already correct)
