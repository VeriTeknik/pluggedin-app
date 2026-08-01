# Pre-clearance email to mcp-review@anthropic.com

**Status:** Draft for review before sending
**Purpose:** Get a written answer on whether our session-memory model satisfies the connector review criteria, before we submit rather than after a rejection.
**Related:** [Hosted MCP Connector Design](./2026-07-31-hosted-mcp-connector-design.md)

Send from an address that will still be monitored during review. Attach nothing; keep it readable in one screen plus scroll.

---

**To:** mcp-review@anthropic.com
**Subject:** Pre-submission question — conversation-derived memory in a remote MCP connector

---

Hello,

We're preparing a remote MCP server for directory submission and would like to check one design against the review criteria **before** we submit, because we think it sits in a grey area and we'd rather adjust now than be rejected for it.

**What we're building.** Plugged.in (https://plugged.in) is a knowledge layer for AI clients: a document library with RAG, a clipboard for passing state between clients, a task list, and a persistent memory. The connector exposes only our own first-party API — we are not proxying third-party services. Its main purpose is to let a user's work carry across Claude surfaces, so something worked out in Claude Code is available in Claude Desktop.

**The question.** Our memory feature records observations during a session. The criterion we want to check ourselves against is:

> "Do not collect conversation data beyond what the tool needs for its function."

We believe we comply, but the reasoning depends on a distinction we'd like you to confirm.

**What we store — outcomes, not transcripts.** Our memory tool accepts a fixed set of observation types. On the connector we accept only the ones that record *what was concluded*:

- `decision` — a decision the user made, with its rationale
- `insight` — a conclusion worth keeping
- `user_preference` — a stated preference
- `error_pattern` / `failure_pattern` / `success_pattern` — what went wrong or right, and why

We deliberately **do not** accept the four types that record *what happened* — `tool_call`, `tool_result`, `workflow_step`, `context_switch` — even though our local (non-connector) product supports them. Those are the ones we read as conversation data, and they are also the least useful to the user later.

We are additionally introducing a tool that requires structure — a one-sentence statement plus a mandatory rationale, typed by category — so that what gets stored is a distilled finding rather than free-form text. Free-form text also cannot be reliably anonymised, which matters for the second half of the feature below.

**What the user controls.**

- Recording requires an explicit `memory:write` OAuth scope, presented on the consent screen as: *"Plugged.in will record observations derived from your conversations into your memory."* Without that scope, the write tools return a scope error.
- Every stored item records which client wrote it, from `_meta.clientInfo`. The user sees "Claude Desktop wrote 40 observations on this date" and can inspect, export or delete them individually or in bulk.
- Data is stored in the user's own workspace under their account. It is never used to train models and is not shared with other users unless they explicitly opt in (see below).
- A defined retention policy and a privacy-policy section covering conversation-derived memory specifically.

**Team sharing, if it matters to your assessment.** A user may optionally mark a finding as shareable with their team. That path strips identifying fields and applies a k-anonymity threshold — a pattern only becomes visible to the team once at least five members have independently recorded an equivalent one, so no individual's context is exposed. It is opt-in per item and off by default.

**Specifically, we'd like to know:**

1. Does recording distilled outcomes — under an explicit, separately-consented scope, with per-item attribution and user deletion — fall within "what the tool needs for its function"? Or does any automatic recording during a session count as collecting conversation data regardless of what is stored?

2. Our server instructions currently tell the model to record observations during a session. We're rewriting them to describe a capability conditional on the granted scope rather than to instruct behaviour, to stay clear of the prompt-injection criteria. Is the following acceptable phrasing, or would you prefer the user to trigger every write explicitly?

   > "When the user has granted the `memory:write` scope, you may record decisions, insights and outcome patterns to their memory. Record conclusions, not conversation content."

If either answer is no, we'd rather hear it now — we have a lower-risk variant ready in which memory is read-only over the connector and writes happen only on explicit user request.

Happy to provide a test account with a populated workspace, or to walk through the tool surface, whichever is more useful.

Thank you,

[Name]
[Role], VeriTeknik
[email] · https://plugged.in

---

## Notes before sending

- **Fill in the sender block.** Use the same contact you'll list as the primary review contact in the submission portal, so the thread is easy to correlate.
- **Do not send this from a no-reply or shared alias.** The answer needs to reach a person who can act on it.
- **Keep the fallback offer in.** Naming the read-only variant signals we'll adjust rather than argue, which usually gets a faster and more specific answer.
- **The two questions are deliberately separable.** A "yes to 1, adjust 2" answer is actionable on its own; a single compound question invites a single cautious no.
- **Do not send until the design decisions here are final** — in particular the observation-type split and the scope name — since the answer will be given against exactly what is described.
- **Record the reply** next to this file. If the answer permits the model as described, that correspondence is worth citing in the submission's Data-handling step.
