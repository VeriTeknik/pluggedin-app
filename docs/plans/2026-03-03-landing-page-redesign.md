# Landing Page Redesign — Plugin-Centric, claude-mem.ai Inspired

**Date:** 2026-03-03
**Goal:** Redesign plugged.in landing page to put the Claude Code plugin at center, inspired by claude-mem.ai's focused, developer-first approach.

---

## Problem with current landing page

The current page has **22 sections**. It tries to sell everything at once: MCP management, RAG, memory, tools, AI models, pricing, collections, playground, security, open source, developer tools, roadmap, blog posts, and the Jungian Intelligence Layer. The result is a cluttered page where the core value proposition gets buried.

claude-mem.ai has **8 focused sections**. One product. One clear story. One install command.

---

## Design Philosophy

**Before:** "We're a platform that does everything"
**After:** "Install this plugin. Your AI remembers everything. Here's how."

The landing page should answer three questions in order:
1. **What is this?** → AI memory that grows with you
2. **How does it work?** → Install plugin, everything is automatic
3. **Why is it special?** → Jungian archetypes, collective intelligence, measurable growth

---

## New Section Structure (8 sections)

### Section 1: Hero
**Inspired by:** claude-mem.ai hero ("AI MEMORY THAT ACTUALLY WORKS")

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│              [plugged.in logo]                        │
│                                                       │
│         AI MEMORY THAT GROWS WITH YOU                │
│                                                       │
│    Stop explaining context. Start building faster.   │
│    Your AI remembers, learns, and shares wisdom      │
│    across every session.                              │
│                                                       │
│    ┌──────────────────────────────────────────────┐  │
│    │ /plugin marketplace add VeriTeknik/           │  │
│    │       pluggedin-plugin                        │  │
│    │ /plugin install pluggedin                     │  │
│    └──────────────────────────────────────────────┘  │
│                                                       │
│    [Star on GitHub]     [How It Works ↓]             │
│                                                       │
│    ⭐ 1500+ MCP tools · 24 tools · 5 hooks · MIT    │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Key changes:**
- Remove particle background (cleaner, faster)
- Plugin install command front and center (like claude-mem)
- Remove enterprise language — this is developer-first
- Single clear tagline, no "four pillars" spread
- Minimal badges below: star count, tool count, license

**Translation key:** `hero` (rewrite)

---

### Section 2: The One-Liner
**Inspired by:** claude-mem.ai "One AI takes notes about what another AI does"

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│   Your AI develops wisdom. Not just memory.          │
│                                                       │
│   Plugged.in watches your AI work and captures       │
│   what matters. Every error, every fix, every        │
│   decision — remembered automatically. Then it       │
│   shares anonymous patterns across the community     │
│   so everyone's AI gets smarter.                     │
│                                                       │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐     │
│   │  PERSONAL  │ │ COLLECTIVE │ │ ARCHETYPAL  │     │
│   │  Your past │ │ Community  │ │ Jung's 4    │     │
│   │  sessions  │ │ patterns   │ │ archetypes  │     │
│   └────────────┘ └────────────┘ └────────────┘     │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Three columns instead of "Before/Current/Next":**
- **Personal Memory** — what happened in your past sessions
- **Collective Intelligence** — patterns from the community (k-anonymous)
- **Archetypal Guidance** — Shadow/Sage/Hero/Trickster deliver the right pattern at the right moment

---

### Section 3: Live Hook Demo
**Inspired by:** claude-mem.ai "Your AI doesn't have to remember anymore" (live observation)

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│       Zero configuration. Everything automatic.       │
│                                                       │
│   5 lifecycle hooks manage your memory session:      │
│                                                       │
│   ┌─────────────────────────────────────────────┐   │
│   │ > Session started                             │   │
│   │ > Individuation score: 42/100 (Established)  │   │
│   │ > Tip: "Contribute patterns to accelerate"   │   │
│   │                                               │   │
│   │ > PreToolUse: git push                        │   │
│   │ > 🔴 Shadow: "Friday 2PM deploys fail 3.4x"  │   │
│   │ > 🔵 Sage: "Run staging tests first"         │   │
│   │                                               │   │
│   │ > PostToolUse: docker build (ERROR)           │   │
│   │ > Observation recorded                        │   │
│   │ > CBP match: "chmod 755 on host directory"   │   │
│   │                                               │   │
│   │ > PreCompact: 5 memories injected             │   │
│   │ > Session ended → Z-report generated          │   │
│   └─────────────────────────────────────────────┘   │
│                                                       │
│   🔍 SessionStart  ⚡ PreToolUse  📸 PostToolUse    │
│   💾 PreCompact    🛑 Stop                           │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**This is the killer section.** An animated terminal showing a real session with hooks firing. Shows the product in action — not abstract feature bullets.

The terminal should be animated (typewriter effect, staggered lines appearing). Could be a pre-recorded sequence or code-driven animation.

---

### Section 4: Four Archetypes
**Inspired by:** claude-mem.ai auto-categorization ("decision/bugfix/feature/discovery")

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│    How your AI thinks — guided by Jung's archetypes  │
│                                                       │
│   Every pattern flows through four archetypes.       │
│   No LLM call. Pure context-to-archetype mapping.   │
│                                                       │
│   ┌────────────┐  ┌────────────┐                    │
│   │ 🔴 SHADOW  │  │ 🔵 SAGE    │                    │
│   │ "Don't     │  │ "Here's    │                    │
│   │  do this"  │  │  the way"  │                    │
│   │            │  │            │                    │
│   │ Anti-      │  │ Best       │                    │
│   │ patterns   │  │ practices  │                    │
│   │ Security   │  │ Solutions  │                    │
│   │ warnings   │  │ Perf tips  │                    │
│   └────────────┘  └────────────┘                    │
│                                                       │
│   ┌────────────┐  ┌────────────┐                    │
│   │ 🟡 HERO    │  │ 🟣 TRICKSTER│                    │
│   │ "Follow    │  │ "Watch     │                    │
│   │  this path"│  │  out"      │                    │
│   │            │  │            │                    │
│   │ Complete   │  │ Edge       │                    │
│   │ workflows  │  │ cases      │                    │
│   │ Sequences  │  │ Gotchas    │                    │
│   └────────────┘  └────────────┘                    │
│                                                       │
└─────────────────────────────────────────────────────┘
```

**Reuse existing `jungian-intelligence.tsx` component** but enhanced:
- Add concrete examples under each archetype (not just descriptions)
- Add a live counter showing community pattern counts (if available)
- Animated cards with hover effects showing real pattern examples

---

### Section 5: Dream Processing & Token Economics
**Inspired by:** claude-mem.ai "Progressive Disclosure" section

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│      Your AI sleeps. And gets smarter.               │
│                                                       │
│   During quiet periods, Dream Processing clusters    │
│   and consolidates fragmented memories.              │
│                                                       │
│   ┌─────────────┐         ┌─────────────┐           │
│   │ 15 memories │ ──────▶ │ 1 guide     │           │
│   │ 7,500 tokens│  Dream  │ 600 tokens  │           │
│   │ overlapping │ Process │ authoritative│           │
│   │ Docker      │         │ Docker       │           │
│   │ errors      │         │ fix guide    │           │
│   └─────────────┘         └─────────────┘           │
│                                                       │
│            92% token reduction                       │
│            Higher quality                            │
│                                                       │
│   Memory decay stages:                               │
│   FULL ──▶ COMPRESSED ──▶ SUMMARY ──▶ ESSENCE       │
│   500t      250t           150t        50t           │
│                                                       │
│   What you reinforce survives.                       │
│   What you don't fades gracefully.                   │
│                                                       │
└─────────────────────────────────────────────────────┘
```

Visual: animated flow from many fragmented cards to one consolidated card. Token counter animating from 7,500 down to 600.

---

### Section 6: Individuation Score
**New section — no direct claude-mem equivalent**

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│     Your AI's growth, measured.                      │
│                                                       │
│   ┌─────────────────────────────────────────────┐   │
│   │                                               │   │
│   │  Individuation Score: 67 / 100               │   │
│   │  Level: MATURE                                │   │
│   │  ████████████████████░░░░░░░░░░              │   │
│   │                                               │   │
│   │  Memory Depth      ████████░░  18/25         │   │
│   │  Learning Velocity ██████████  22/25         │   │
│   │  Collective Contrib████████░░  16/25         │   │
│   │  Self-Awareness    ███████░░░  11/25         │   │
│   │                                               │   │
│   │  Tip: "Your collective contribution is       │   │
│   │  strong — focus on memory consolidation"     │   │
│   │                                               │   │
│   └─────────────────────────────────────────────┘   │
│                                                       │
│   Nascent → Developing → Established → Mature →     │
│   Individuated                                       │
│                                                       │
│   New team members inherit collective wisdom from    │
│   day one. By week 2, measurably outperform         │
│   months of solo experience.                         │
│                                                       │
└─────────────────────────────────────────────────────┘
```

Interactive: animated score card that fills up as user scrolls. Show the journey from Nascent to current level.

---

### Section 7: Privacy
**Inspired by:** claude-mem.ai keeps this implicit, but we need it because collective learning raises questions

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│     Privacy is math, not promises.                   │
│                                                       │
│   ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│   │ IDENTITY     │  │ k-ANONYMITY │  │ TEMPORAL   │  │
│   │ ERASURE      │  │             │  │ AGGREGATION│  │
│   │              │  │             │  │            │  │
│   │ HMAC-SHA256  │  │ Patterns    │  │ "Fridays   │  │
│   │ one-way hash │  │ invisible   │  │ are risky" │  │
│   │              │  │ until 3+    │  │ — not which│  │
│   │ Can't reverse│  │ profiles    │  │ Friday     │  │
│   │ it. Period.  │  │ contribute  │  │ or who     │  │
│   └─────────────┘  └─────────────┘  └───────────┘  │
│                                                       │
│   Learn from everyone. Identified by no one.         │
│   Open source. Self-hostable. MIT licensed.          │
│                                                       │
└─────────────────────────────────────────────────────┘
```

Three cards. Simple. Concrete. No compliance badge theater.

---

### Section 8: CTA
**Inspired by:** claude-mem.ai footer CTA

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│   The collective unconscious of machines.            │
│                                                       │
│   ┌──────────────────────────────────────────────┐  │
│   │ /plugin marketplace add VeriTeknik/           │  │
│   │       pluggedin-plugin                        │  │
│   │ /plugin install pluggedin                     │  │
│   └──────────────────────────────────────────────┘  │
│                                                       │
│   [Star on GitHub]  [Read the Docs]  [Platform →]   │
│                                                       │
│   Open source · MIT · Made by VeriTeknik             │
│                                                       │
└─────────────────────────────────────────────────────┘
```

Mirror the hero. Same install command. Bookend the page.

---

## What gets removed

| Current Section | Decision | Reason |
|----------------|----------|--------|
| Hero Enterprise | **Replace** | New plugin-first hero |
| Trust Indicators | **Remove** | SOC2/HIPAA badges feel enterprise-theater, not developer-first |
| Popular Servers | **Remove** | This is MCP registry feature, not plugin |
| Problem Statement | **Merge** → into hero subtitle | Already implied in "stop explaining context" |
| Four Pillars | **Replace** → Three columns in Section 2 | Personal/Collective/Archetypal is a better split |
| Jungian Intelligence | **Enhance** → Section 4 | Keep but expand with examples |
| Video Tutorials | **Remove** | Can link from docs instead |
| Roadmap | **Remove** | Belongs in docs or blog |
| Latest Blog Posts | **Remove** | Belongs in a /blog page |
| Open Source | **Merge** → into CTA section | One line: "Open source. MIT." |
| Features Overview | **Remove** | Replaced by Section 2-6 storytelling |
| AI Models | **Remove** | Not relevant to plugin-first story |
| Pricing | **Remove** | "Free forever" can be a badge in hero |
| Collections | **Remove** | Feature detail, not landing page |
| Search | **Remove** | Feature detail, not landing page |
| MCP Playground | **Remove** | Feature detail, not landing page |
| Security | **Replace** → Section 7 | Privacy-by-math, not compliance badges |
| Developers | **Remove** | Docs link is sufficient |
| Getting Started | **Merge** → into hero install block | Two commands is the getting started |
| CTA | **Replace** → Section 8 | Simpler, mirrors hero |

**Net result:** 22 sections → 8 sections. More focused. Faster to load. Clearer story.

---

## What gets kept but moved

| Content | New Location |
|---------|-------------|
| MCP playground | Separate `/playground` page |
| Video tutorials | Documentation site or `/tutorials` |
| Roadmap | Blog post or `/roadmap` |
| Popular servers | `/registry` page |
| Pricing details | `/pricing` page |
| AI model list | Documentation |
| Blog posts | `/blog` page |
| Developer docs | Documentation site |

**The landing page sells. Other pages inform.**

---

## Navigation (simplified)

**Current:** Enter App · Why · Features · AI Models · Pricing · Community · Collections · Playground · Documentation · Blog · Connect

**New:**
```
plugged.in     How It Works    Docs    GitHub    [Install →]
```

Four links + CTA button. That's it.

---

## Technical Implementation Notes

1. **Reuse existing component pattern** — keep dynamic imports, Suspense, ErrorBoundary
2. **Keep i18n** — update `landing.json` translations for all 6 languages
3. **Animated terminal** — new component: `components/landing-sections/terminal-demo.tsx`
   - Use framer-motion for typewriter effect
   - Hardcoded sequence (not live data)
   - Dark background, monospace font, syntax highlighting for hook names
4. **Token animation** — new component for the 7500→600 counter
   - Use `framer-motion` `useInView` + `animate` for counting
5. **Individuation score card** — extract from existing UI or build new
6. **Remove ParticleBackground** — clean, fast, no gimmicks
7. **Keep `useMounted` + `useTranslation` patterns** — consistent with codebase

---

## Comparison: Before vs After

| Aspect | Current | Proposed |
|--------|---------|----------|
| Sections | 22 | 8 |
| Primary CTA | "Enter App" (generic) | Install command (specific) |
| Story | "Platform for everything" | "Plugin that makes AI remember" |
| Hero focus | Enterprise badges, pillars | Install command, one tagline |
| Tone | Corporate/enterprise | Developer/hacker |
| Navigation | 11 items | 4 items + CTA |
| Load time | Heavy (22 dynamic imports) | Fast (8 sections, simpler) |
| Unique angle | MCP management | Jungian collective intelligence |

---

## File Changes Summary

| Action | File |
|--------|------|
| **Rewrite** | `app/page.tsx` (section order) |
| **Rewrite** | `components/landing-sections/hero-enterprise.tsx` → new hero |
| **Create** | `components/landing-sections/one-liner.tsx` (Section 2) |
| **Create** | `components/landing-sections/terminal-demo.tsx` (Section 3) |
| **Enhance** | `components/landing-sections/jungian-intelligence.tsx` (Section 4) |
| **Create** | `components/landing-sections/dream-processing.tsx` (Section 5) |
| **Create** | `components/landing-sections/individuation-score.tsx` (Section 6) |
| **Rewrite** | `components/landing-sections/security.tsx` → privacy (Section 7) |
| **Rewrite** | `components/landing-sections/cta.tsx` (Section 8) |
| **Rewrite** | `public/locales/*/landing.json` (all 6 languages) |
| **Keep** | `components/landing-sections/landing-navbar.tsx` (simplify links) |
| **Keep** | `components/landing-sections/footer.tsx` (simplify) |
| **Archive** | 14 removed section components (don't delete — move to `/components/landing-sections/archive/`) |

---

## Open Questions

1. **Logo:** Do we have a `pluggedin-logo.png` for the GitHub org? (The current one is `Veriteknik-logo.png`)
2. **YouTube embed:** Should we keep a single demo video, or remove all video from landing?
3. **Existing pages:** Do we want to create `/playground`, `/roadmap`, `/tutorials` pages for moved content, or just link to docs?
4. **Mobile:** claude-mem.ai is quite good on mobile. Should we prioritize mobile-first for the redesign?
