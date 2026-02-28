# Design: Plugged.in Claude Code Plugin

**Date:** 2026-02-28
**Status:** Approved
**Author:** Claude Code + Cem Karaca

---

## Problem Statement

The Plugged.in memory system, RAG, and tool ecosystem are fully functional but LLMs connected via MCP don't know **when** or **how** to use them effectively. Two complementary solutions:

1. **MCP Server Instructions** - Universal baseline for all MCP clients (~250 words at connection time)
2. **Claude Code Plugin** - Deep integration with hooks, skills, agents, and commands for Claude Code users

## Decision: Full Platform Plugin

Plugin name: `pluggedin` (not `pluggedin-memory`)

**Reasoning:**
- Plugged.in's value is memory + RAG + tools working together
- Single powerful plugin gets more marketplace attention
- Context window impact is minimal (skills lazy-load)
- Platform-wide scope enables cross-feature skills

## Architecture

### Two-Piece Design

```
Universal (all MCP clients)          Deep (Claude Code only)
─────────────────────────           ─────────────────────────
MCP Server `instructions`           Claude Code Plugin
  │                                   │
  ├─ ~250 words                      ├─ Skills (lazy-loaded)
  ├─ Tool categories                 ├─ Agents (specialized)
  ├─ Memory workflow basics          ├─ Commands (user-invocable)
  ├─ Progressive disclosure          ├─ Hooks (lifecycle)
  └─ Sent at connection time         └─ .mcp.json (MCP wrapping)
```

### Plugin Repository

**Location:** `VeriTeknik/claude-plugins` (marketplace monorepo)

```
VeriTeknik/claude-plugins/
├── .claude-plugin/
│   └── marketplace.json          ← Marketplace metadata
└── plugins/
    └── pluggedin/
        ├── .claude-plugin/
        │   └── plugin.json       ← Plugin manifest
        ├── skills/
        │   ├── memory-workflow/SKILL.md
        │   ├── memory-extraction/SKILL.md
        │   ├── rag-context/SKILL.md
        │   └── platform-tools/SKILL.md
        ├── agents/
        │   ├── memory-curator.md
        │   └── focus-assistant.md
        ├── commands/
        │   ├── memory-status.md
        │   ├── memory-search.md
        │   ├── memory-forget.md
        │   ├── pluggedin-status.md
        │   └── setup.md
        ├── hooks/
        │   ├── hooks.json
        │   ├── session-start.sh
        │   ├── pre-compact.sh
        │   └── session-end.sh
        └── .mcp.json             ← MCP server wrapping
```

## MCP Server Instructions

Added to `pluggedin-mcp/src/mcp-proxy.ts` Server constructor:

```typescript
instructions: `You are connected to Plugged.in, an AI infrastructure platform with 22 tools across 6 categories.

MEMORY WORKFLOW (use every session):
1. Start session: pluggedin_memory_session_start (with content_session_id)
2. During work: pluggedin_memory_observe for errors, decisions, insights, preferences
3. Before answering: pluggedin_memory_search to check existing knowledge
4. End session: pluggedin_memory_session_end (generates Z-report summary)

PROGRESSIVE DISCLOSURE (save tokens):
- Layer 1: pluggedin_memory_search returns summaries (50-150 tokens each)
- Layer 2: pluggedin_memory_details for full content of selected memories
- Always search first, expand only what's needed

TOOL CATEGORIES:
- Discovery: pluggedin_discover_tools (find tools across all MCP servers)
- Knowledge: pluggedin_ask_knowledge_base (search documentation)
- Clipboard: pluggedin_clipboard_set/get/push/pop (data sharing)
- Memory: session_start/end, observe, search, details
- Documents: pluggedin_list/get/create/update/search_documents
- Notifications: pluggedin_send/list/mark_done/delete_notification

BEST PRACTICES:
- Auto-observe errors, successful patterns, and user preferences
- Search memory before asking the user questions they may have answered before
- Use clipboard for sharing data between tools and sessions`
```

## Plugin Manifest

### plugin.json

```json
{
  "name": "pluggedin",
  "version": "1.0.0",
  "displayName": "Plugged.in AI Platform",
  "description": "Memory system, RAG knowledge base, and tool orchestration for Plugged.in",
  "author": "VeriTeknik",
  "homepage": "https://plugged.in",
  "repository": "https://github.com/VeriTeknik/claude-plugins",
  "license": "MIT",
  "minClaudeCodeVersion": "1.0.0",
  "keywords": ["memory", "rag", "ai-tools", "knowledge-base", "mcp"]
}
```

## Hook Lifecycle

### SessionStart Hook

**File:** `hooks/session-start.sh`
**Trigger:** When a new Claude Code session begins

```bash
#!/bin/bash
# Auto-start a Plugged.in memory session

PLUGGEDIN_KEY=$(jq -r '.mcpServers["pluggedin-mcp"].env.PLUGGEDIN_API_KEY // empty' \
  ~/.claude/settings.local.json 2>/dev/null)

if [ -z "$PLUGGEDIN_KEY" ]; then
  echo '{"additional_context":"Plugged.in not configured. Run /pluggedin:setup to connect."}'
  exit 0
fi

SESSION_ID="claude-$(date +%s)-$$"

RESPONSE=$(curl -s -X POST "${PLUGGEDIN_URL:-https://plugged.in}/api/memory/sessions" \
  -H "Authorization: Bearer $PLUGGEDIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"content_session_id\": \"$SESSION_ID\"}" \
  --connect-timeout 5 --max-time 10)

if echo "$RESPONSE" | jq -e '.uuid' >/dev/null 2>&1; then
  UUID=$(echo "$RESPONSE" | jq -r '.uuid')
  MEM_ID=$(echo "$RESPONSE" | jq -r '.memory_session_id')
  echo "{\"additional_context\":\"Memory session started (${MEM_ID}). Use pluggedin_memory_observe to capture insights, errors, and decisions during this session.\"}"
else
  echo '{"additional_context":"Memory session could not start. Memory features available manually via MCP tools."}'
fi
```

### PreCompact Hook

**File:** `hooks/pre-compact.sh`
**Trigger:** Before context window compaction

```bash
#!/bin/bash
# Inject relevant memories before context is compressed

PLUGGEDIN_KEY=$(jq -r '.mcpServers["pluggedin-mcp"].env.PLUGGEDIN_API_KEY // empty' \
  ~/.claude/settings.local.json 2>/dev/null)

if [ -z "$PLUGGEDIN_KEY" ]; then
  exit 0
fi

# Search for memories related to current session context
RESPONSE=$(curl -s -X POST "${PLUGGEDIN_URL:-https://plugged.in}/api/memory/search" \
  -H "Authorization: Bearer $PLUGGEDIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"current session context","limit":5}' \
  --connect-timeout 5 --max-time 10)

if echo "$RESPONSE" | jq -e '.results' >/dev/null 2>&1; then
  MEMORIES=$(echo "$RESPONSE" | jq -r '[.results[] | .content_summary // .content_essence] | join("\n- ")')
  if [ -n "$MEMORIES" ]; then
    echo "{\"additional_context\":\"Relevant memories from previous sessions:\\n- ${MEMORIES}\"}"
  fi
fi
```

### SessionEnd Hook

**File:** `hooks/session-end.sh`
**Trigger:** When Claude Code session ends

```bash
#!/bin/bash
# End memory session and trigger Z-report generation

PLUGGEDIN_KEY=$(jq -r '.mcpServers["pluggedin-mcp"].env.PLUGGEDIN_API_KEY // empty' \
  ~/.claude/settings.local.json 2>/dev/null)

if [ -z "$PLUGGEDIN_KEY" ]; then
  exit 0
fi

# Find active session and end it
RESPONSE=$(curl -s -X POST "${PLUGGEDIN_URL:-https://plugged.in}/api/memory/sessions/end" \
  -H "Authorization: Bearer $PLUGGEDIN_KEY" \
  -H "Content-Type: application/json" \
  --connect-timeout 5 --max-time 15)

# Z-report is generated server-side during session end
```

### hooks.json

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "script": "hooks/session-start.sh",
      "timeout": 15000
    },
    {
      "event": "PreCompact",
      "script": "hooks/pre-compact.sh",
      "timeout": 10000
    },
    {
      "event": "SessionEnd",
      "script": "hooks/session-end.sh",
      "timeout": 20000
    }
  ]
}
```

## Skills

### 1. memory-workflow

**Purpose:** Guides the LLM through proper memory session lifecycle.

**When to use:** Every session - establishing memory capture patterns.

**Key guidance:**
- Start session at beginning, end at close
- Observe errors, decisions, preferences, insights
- Search before asking questions
- Use progressive disclosure (search -> details)

### 2. memory-extraction

**Purpose:** Smart observation capture with tier-1/tier-2 extraction.

**When to use:** After tool calls, errors, user preferences, key decisions.

**Key guidance:**
- Tier-1: Deterministic extraction (emails, URLs, UUIDs, error codes)
- Tier-2: LLM gate ("Is this NEW + USEFUL + DURABLE?")
- Classify: tool_call, error_pattern, decision, success_pattern, insight, user_preference

### 3. rag-context

**Purpose:** Integrates RAG knowledge base search into workflows.

**When to use:** When answering questions about project documentation, code, or configuration.

**Key guidance:**
- Search RAG before generating answers about project specifics
- Include source attribution
- Combine with memory search for comprehensive context

### 4. platform-tools

**Purpose:** Full catalog of all 22 Plugged.in tools with usage patterns.

**When to use:** When needing to discover or orchestrate Plugged.in capabilities.

**Key guidance:**
- Discovery, Knowledge Base, Clipboard, Memory, Documents, Notifications
- Common workflows (upload -> search -> cite, observe -> classify -> retrieve)

## Agents

### memory-curator

**System prompt:** Background agent that classifies observations and manages memory lifecycle.

**Capabilities:**
- Batch classify unprocessed fresh memories
- Promote to appropriate ring (procedures, practice, longterm, shocks)
- Merge duplicate/similar memories
- Trigger decay processing

### focus-assistant

**System prompt:** Working set manager that tracks what's "in focus" during a session.

**Capabilities:**
- Maintain 7 +/- 2 items in focus
- Update relevance scores as context shifts
- Surface relevant memories proactively

## Commands

### /pluggedin:setup

API key onboarding flow:
1. Check if key already configured in `~/.claude/settings.local.json`
2. If not, guide user to https://plugged.in/settings/api-keys
3. Validate the key via API call
4. Write to `~/.claude/settings.local.json` under `mcpServers.pluggedin-mcp.env.PLUGGEDIN_API_KEY`
5. Confirm connection

### /pluggedin:memory-status

Show current memory system state:
- Active session info
- Memory ring counts (procedures, practice, longterm, shocks)
- Fresh memory count
- Recent Z-reports

### /pluggedin:memory-search

Interactive memory search:
- Accept search query
- Display Layer 1 results (summaries)
- Allow expanding to Layer 3 (full details)

### /pluggedin:memory-forget

Selective memory deletion:
- Search for memories to forget
- Confirm deletion
- Remove from both PostgreSQL and vector store

### /pluggedin:status

Overall Plugged.in platform status:
- Connection health
- MCP server count
- Tool count
- RAG document count
- Memory statistics

## .mcp.json (MCP Wrapping)

```json
{
  "mcpServers": {
    "pluggedin-mcp": {
      "type": "streamable-http",
      "url": "${PLUGGEDIN_MCP_URL:-https://mcp.plugged.in/mcp}",
      "headers": {
        "Authorization": "Bearer ${PLUGGEDIN_API_KEY}"
      }
    }
  }
}
```

## Security Considerations

- API key stored in `~/.claude/settings.local.json` (not committed to git)
- Hook scripts use `--connect-timeout 5` to avoid hanging
- All API calls include bearer token authentication
- No PII in hook output (only session IDs and memory summaries)
- Plugin does not store credentials in its own files

## Verification Plan

1. Plugin installs: `claude plugin add VeriTeknik/claude-plugins/plugins/pluggedin`
2. `/pluggedin:setup` configures API key correctly
3. SessionStart hook auto-starts memory session
4. PreCompact hook injects relevant memories
5. SessionEnd hook ends session and triggers Z-report
6. Skills load on invocation
7. Commands execute correctly
8. `.mcp.json` connects to pluggedin-mcp-proxy
