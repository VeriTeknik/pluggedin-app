# Landing Page Collective Memory Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the landing page to position collective memory as the core value proposition, replacing Jungian terminology with scenario-driven storytelling.

**Architecture:** Rewrite/replace 6 landing section components, update page.tsx section order, replace translation keys in all 6 locale files. Existing component patterns (framer-motion, useInView, useMounted, useTranslation) are preserved.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, framer-motion, react-i18next, lucide-react

---

## Context

**Trigger**: Mentor feedback — "My AI's memory already grows with the model I use, why do I need you?"

**Design doc**: `docs/plans/2026-03-08-landing-collective-memory-redesign.md` (this file, design section below)

**Key decisions**:
- Target: Individual developers
- Core value: Collective memory — "Your mistake was already made, don't make it"
- Tone: Story/scenario-driven
- Jung: Show value, never mention terminology
- Privacy: Prominent, human-readable

---

## Design (Approved)

### New Section Flow

### Section 1: Hero

**Badge**: "AI Memory That Learns From Everyone"
**Headline**: "Yapay Zekân Sadece Seni Hatırlıyor. Biz Herkesi Hatırlıyoruz." / "Your AI Remembers You. We Remember Everyone."
**Subheadline**: "Collective memory distilled from thousands of developers. The mistake you're about to make? Someone already made it. Plugged.in knows."
**Tagline**: "Individual memory is limited. Collective memory is a superpower."

3 contrast cards side by side:

| Model Memory | Plugged.in |
|---|---|
| Only your session | Experience of thousands of developers |
| Forgets when context fills | Patterns are permanent |
| You repeat the same mistake | Warns you: "don't do this" |

**CTA**: "Join the Community" + "How It Works"

### Section 2: Scenarios — "Has This Happened to You?"

3 realistic developer stories in before/after format:

**Scenario 1: "3 Hours, 1 Bug"**
- Before: Recursive query infinite loop. 14 Stack Overflow tabs. Asked ChatGPT 3 times, different answer each time. Solved it — 3 hours later.
- With Plugged.in: "This pattern seen 47 times. 89% caused by missing base case." — 5 minutes.

**Scenario 2: "2 AM in Production"**
- Before: Pushed .env.staging values to .env.production. Alerts fired. Rollback, postmortem, shame.
- With Plugged.in: "This config was wrongly deployed to production 12 times. Are you sure?" — Before deploy.

**Scenario 3: "New Framework, Old Mistakes"**
- Before: Learning a new framework. Read docs, did tutorials. But unexpected edge cases in production.
- With Plugged.in: "Top 3 mistakes with this framework: connection pooling, cache invalidation, missing error boundaries." — Before you start.

### Section 3: How It Works — "Show, Don't Tell"

No Jung terminology. 3 layers the user actually sees:

**"Don't Do This"** (red tones)
- Recurring mistakes, anti-patterns, known traps from the community. Your AI warns you — because others already fell.

**"Try This"** (green tones)
- Proven solutions, best practices, community-validated approaches. Not one person's opinion — hundreds of developers' experience.

**"Nobody Tried This But..."** (amber tones)
- Unconventional but working solutions. Creative approaches from the community — beyond standard answers.

Minimal flow diagram:
```
You code → Pattern detected → Matched with community → Your AI tells you
```

### Section 4: Privacy — "Nobody Sees Your Code"

**Headline**: "Patterns are shared. Code never is."

3 guarantees, simple and human:

**"Your identity is erased"**
- Your experiences are one-way encrypted. Can't be traced back to you. Irreversible.

**"You're invisible alone"**
- A pattern isn't shared with the community until at least 3 different developers discover it. One person's mistake is never exposed.

**"Time is blurred"**
- When you did something is also anonymized. Not "Tuesday at 2:32 PM" but "this month."

Bottom line: *"Privacy is math, not promises. HMAC-SHA256 + k-anonymity (k>=3)."*

### Section 5: Numbers — "The Community Is Already Learning"

Live metrics (from existing API):
- **X** patterns detected
- **X** developers contributing
- **X** hours saved (estimated)
- **92%** token reduction (memory compression)

### Section 6: CTA

**Headline**: "The community already learned. Are you still learning alone?"

Install Plugged.in. Join the collective memory.

[Get Started] [How It Works ->]

---

## Sections Removed

- **Jungian Intelligence** — terminology removed, value lives in Section 3
- **Dream Processing** — technical detail, user doesn't care
- **Individuation Score** — internal metric, no place on landing
- **Problem Statement** — scenarios already tell the problem
- **AI Models section** — model-agnostic message sufficient in hero

## Sections Kept (simplified)

- **Terminal Demo** — transformed to show collective memory in action
- **Platform Capabilities** — shortened to 4-5 feature cards
- **Pricing** — stays as-is (free forever)

---

## Translation Strategy

All new copy needs translations in: en, tr, zh, hi, ja, nl
Existing translation keys will be replaced, not appended.

---

## Implementation Plan

### File Inventory

**Files to modify:**
- `app/page.tsx` — Section order and imports
- `components/landing-sections/hero-plugin.tsx` — New hero with contrast cards
- `components/landing-sections/one-liner.tsx` — Rewrite as Scenarios section
- `components/landing-sections/jungian-intelligence.tsx` — Rewrite as How It Works
- `components/landing-sections/privacy.tsx` — Update copy, keep structure
- `components/landing-sections/terminal-demo.tsx` — Update terminal output for collective memory
- `components/landing-sections/cta-plugin.tsx` — New CTA copy
- `public/locales/en/landing.json` — English translations (source of truth)
- `public/locales/tr/landing.json` — Turkish translations
- `public/locales/zh/landing.json` — Chinese translations
- `public/locales/hi/landing.json` — Hindi translations
- `public/locales/ja/landing.json` — Japanese translations
- `public/locales/nl/landing.json` — Dutch translations

**Files removed from page.tsx imports (components kept, just not rendered):**
- `components/landing-sections/dream-processing.tsx`
- `components/landing-sections/individuation-score.tsx`

**Files kept as-is:**
- `components/landing-sections/platform-capabilities.tsx`
- `components/landing-sections/pricing.tsx` (if currently rendered)
- `components/landing-sections/install-snippet.tsx`

**Shared patterns (do NOT change):**
- `hooks/use-mounted.ts`
- `components/ui/button.tsx`
- All framer-motion, react-i18next, react-intersection-observer imports

---

### Task 1: Update English Translations (Source of Truth)

**Files:**
- Modify: `public/locales/en/landing.json`

**Step 1: Add new translation keys to en/landing.json**

Replace/add the following key groups in the English landing.json. Keep all existing keys that other sections use (pricing, platformCapabilities, etc.). Replace these key groups:

```json
{
  "heroPlugin": {
    "badge": "AI Memory That Learns From Everyone",
    "headline": "Your AI Remembers You. We Remember Everyone.",
    "subtitle": "Collective memory distilled from thousands of developers. The mistake you're about to make? Someone already made it. Plugged.in knows.",
    "tagline": "Individual memory is limited. Collective memory is a superpower.",
    "copy": "Copy install command",
    "copied": "Copied!",
    "setupHint": "Works with Claude Code, Cursor, Windsurf & more",
    "starOnGithub": "Star on GitHub",
    "howItWorks": "How It Works",
    "stats": "Open source. Free forever. Community-powered.",
    "contrast": {
      "title": "Why not just use your model's memory?",
      "model": {
        "col1": "Only your session",
        "col2": "Forgets when context fills",
        "col3": "You repeat the same mistake"
      },
      "pluggedin": {
        "col1": "Experience of thousands of developers",
        "col2": "Patterns are permanent",
        "col3": "Warns you: don't do this"
      },
      "labels": {
        "model": "Model Memory",
        "pluggedin": "Plugged.in"
      }
    }
  },
  "scenarios": {
    "title": "Has This Happened to You?",
    "subtitle": "Every developer has been there. The difference is whether you learn alone or from everyone.",
    "bug": {
      "title": "3 Hours, 1 Bug",
      "before": "Recursive query infinite loop. 14 Stack Overflow tabs. Asked ChatGPT 3 times, different answer each time. Solved it — 3 hours later.",
      "after": "\"This pattern seen 47 times. 89% caused by missing base case.\" — 5 minutes.",
      "label": "Debug Time"
    },
    "production": {
      "title": "2 AM in Production",
      "before": "Pushed .env.staging values to .env.production. Alerts fired. Rollback, postmortem, shame.",
      "after": "\"This config was wrongly deployed to production 12 times. Are you sure?\" — Before deploy.",
      "label": "Deploy Safety"
    },
    "framework": {
      "title": "New Framework, Old Mistakes",
      "before": "Learning a new framework. Read docs, did tutorials. But unexpected edge cases in production.",
      "after": "\"Top 3 mistakes with this framework: connection pooling, cache invalidation, missing error boundaries.\" — Before you start.",
      "label": "Onboarding"
    },
    "beforeLabel": "Without Plugged.in",
    "afterLabel": "With Plugged.in"
  },
  "howItWorks": {
    "title": "Your AI Already Knows What Others Learned",
    "subtitle": "No setup. No configuration. Patterns flow to your AI automatically.",
    "dontDoThis": {
      "title": "Don't Do This",
      "desc": "Recurring mistakes, anti-patterns, known traps from the community. Your AI warns you — because others already fell."
    },
    "tryThis": {
      "title": "Try This Instead",
      "desc": "Proven solutions, best practices, community-validated approaches. Not one person's opinion — hundreds of developers' experience."
    },
    "creative": {
      "title": "Nobody Tried This But...",
      "desc": "Unconventional but working solutions. Creative approaches from the community — beyond standard answers."
    },
    "flow": {
      "step1": "You code",
      "step2": "Pattern detected",
      "step3": "Matched with community",
      "step4": "Your AI tells you"
    }
  },
  "privacy": {
    "title": "Nobody Sees Your Code",
    "subtitle": "Patterns are shared. Code never is.",
    "identity": {
      "title": "Your identity is erased",
      "desc": "Your experiences are one-way encrypted. Can't be traced back to you. Irreversible."
    },
    "kanonymity": {
      "title": "You're invisible alone",
      "desc": "A pattern isn't shared until at least 3 different developers discover it. One person's mistake is never exposed."
    },
    "temporal": {
      "title": "Time is blurred",
      "desc": "When you did something is also anonymized. Not \"Tuesday at 2:32 PM\" but \"this month.\""
    },
    "tagline": "Privacy is math, not promises. HMAC-SHA256 + k-anonymity (k>=3).",
    "openSource": "Fully open source. Verify everything."
  },
  "ctaPlugin": {
    "headline": "The community already learned. Are you still learning alone?",
    "copy": "Copy install command",
    "copied": "Copied!",
    "setupHint": "Install in 30 seconds. Join the collective memory.",
    "starOnGithub": "Star on GitHub",
    "readDocs": "Documentation",
    "platform": "Open Platform",
    "footer": "Free forever. Open source. Your patterns stay private."
  }
}
```

**Step 2: Verify the file is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/locales/en/landing.json','utf8')); console.log('Valid JSON')"`
Expected: "Valid JSON"

**Step 3: Commit**

```bash
git add public/locales/en/landing.json
git commit -m "feat(landing): update English translations for collective memory redesign"
```

---

### Task 2: Update Turkish Translations

**Files:**
- Modify: `public/locales/tr/landing.json`

**Step 1: Replace the same key groups with Turkish translations**

Use the same key structure as Task 1 but with Turkish text. Key translations:

- heroPlugin.badge: "Herkesten Öğrenen AI Hafızası"
- heroPlugin.headline: "Yapay Zekân Sadece Seni Hatırlıyor. Biz Herkesi Hatırlıyoruz."
- heroPlugin.subtitle: "Binlerce geliştiricinin deneyiminden damıtılmış kolektif hafıza. Senin yapacağın hatayı, başkası zaten yaptı. Plugged.in bunu biliyor."
- scenarios.title: "Bu Sana Oldu mu?"
- howItWorks.dontDoThis.title: "Bunu Yapma"
- howItWorks.tryThis.title: "Bunu Dene"
- howItWorks.creative.title: "Bunu Kimse Denemedi Ama..."
- privacy.title: "Kimse Senin Kodunu Görmez"
- privacy.subtitle: "Pattern'ler paylaşılır. Kod asla."
- ctaPlugin.headline: "Topluluk zaten öğrendi. Sen hâlâ tek başına mı öğreniyorsun?"

**Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/locales/tr/landing.json','utf8')); console.log('Valid JSON')"`

**Step 3: Commit**

```bash
git add public/locales/tr/landing.json
git commit -m "feat(landing): update Turkish translations for collective memory redesign"
```

---

### Task 3: Update Remaining Language Translations (zh, hi, ja, nl)

**Files:**
- Modify: `public/locales/zh/landing.json`
- Modify: `public/locales/hi/landing.json`
- Modify: `public/locales/ja/landing.json`
- Modify: `public/locales/nl/landing.json`

**Step 1: For each language file, replace the same key groups with appropriate translations**

Use the English version as source, translate to each language. Maintain the exact same JSON key structure.

**Step 2: Validate all 4 JSON files**

Run: `for lang in zh hi ja nl; do node -e "JSON.parse(require('fs').readFileSync('public/locales/$lang/landing.json','utf8')); console.log('$lang: Valid')"; done`

**Step 3: Commit**

```bash
git add public/locales/zh/landing.json public/locales/hi/landing.json public/locales/ja/landing.json public/locales/nl/landing.json
git commit -m "feat(landing): update zh/hi/ja/nl translations for collective memory redesign"
```

---

### Task 4: Rewrite Hero Section

**Files:**
- Modify: `components/landing-sections/hero-plugin.tsx`

**Step 1: Rewrite the component**

Keep the same component structure (exports, imports, useMounted/useTranslation/useInView pattern). Add contrast cards below the install snippet. The contrast section should be 3 rows comparing "Model Memory" vs "Plugged.in" side by side.

Key changes:
- Badge uses `t('heroPlugin.badge')`
- Headline uses `t('heroPlugin.headline')` with gradient text
- Subtitle uses `t('heroPlugin.subtitle')`
- Add tagline: `t('heroPlugin.tagline')` below subtitle
- Keep InstallSnippet as-is
- Add contrast cards section after InstallSnippet using `t('heroPlugin.contrast.*')` keys
- Contrast cards: 3 rows, left column muted/red tones (model memory), right column green/glow tones (plugged.in)
- Keep CTA buttons (GitHub star + How It Works)
- Stats line uses `t('heroPlugin.stats')`

**Step 2: Verify component renders**

Run: `pnpm build 2>&1 | head -30`
Expected: No TypeScript errors in hero-plugin.tsx

**Step 3: Commit**

```bash
git add components/landing-sections/hero-plugin.tsx
git commit -m "feat(landing): rewrite hero section with collective memory messaging and contrast cards"
```

---

### Task 5: Rewrite One-Liner as Scenarios Section

**Files:**
- Modify: `components/landing-sections/one-liner.tsx`

**Step 1: Rewrite component as ScenariosSection**

Rename export from `OneLinerSection` to `ScenariosSection`. Keep the same file path.

Structure: 3 scenario cards, each with before/after layout:
- Left side (muted/dark): "Without Plugged.in" scenario text
- Right side (highlighted/green accent): "With Plugged.in" result
- Each card has a title and category label

Use translation keys: `t('scenarios.title')`, `t('scenarios.subtitle')`, `t('scenarios.bug.*')`, `t('scenarios.production.*')`, `t('scenarios.framework.*')`

Icons: `Clock` (bug), `AlertTriangle` (production), `BookOpen` (framework) from lucide-react.

Keep framer-motion stagger animation pattern from original.

**Step 2: Update import in page.tsx (done in Task 8)**

**Step 3: Verify no TS errors**

Run: `pnpm build 2>&1 | head -30`

**Step 4: Commit**

```bash
git add components/landing-sections/one-liner.tsx
git commit -m "feat(landing): rewrite one-liner as scenarios section with before/after developer stories"
```

---

### Task 6: Rewrite Jungian Intelligence as How It Works

**Files:**
- Modify: `components/landing-sections/jungian-intelligence.tsx`

**Step 1: Rewrite component as HowItWorksSection**

Rename export from `JungianIntelligenceSection` to `HowItWorksSection`.

Structure:
- Title + subtitle from `t('howItWorks.title')` / `t('howItWorks.subtitle')`
- 3 cards in a row:
  - "Don't Do This" — red/destructive accent, `ShieldAlert` icon
  - "Try This Instead" — green/success accent, `CheckCircle` icon
  - "Nobody Tried This But..." — amber/warning accent, `Lightbulb` icon
- Below cards: horizontal flow diagram with 4 steps connected by arrows
  - `t('howItWorks.flow.step1')` -> `t('howItWorks.flow.step2')` -> `t('howItWorks.flow.step3')` -> `t('howItWorks.flow.step4')`

Keep framer-motion pattern.

**Step 2: Verify**

Run: `pnpm build 2>&1 | head -30`

**Step 3: Commit**

```bash
git add components/landing-sections/jungian-intelligence.tsx
git commit -m "feat(landing): rewrite jungian section as how-it-works with actionable categories"
```

---

### Task 7: Update Privacy Section Copy

**Files:**
- Modify: `components/landing-sections/privacy.tsx`

**Step 1: Update the component**

The privacy section already has the right 3-card structure (identity, kanonymity, temporal). The translation keys are already matching (`privacy.title`, `privacy.subtitle`, `privacy.identity.*`, etc.).

Only changes needed:
- Verify the translation keys match the new copy in landing.json
- Update icon choices if needed: `EyeOff` (identity erased), `Users` (k-anonymity), `Clock` (temporal)
- Ensure the tagline renders: `t('privacy.tagline')`

This may require minimal or no code changes — the new translations will flow through automatically if the keys match.

**Step 2: Verify keys match**

Read the component and confirm all `t()` calls match keys in updated landing.json.

**Step 3: Commit (if changes needed)**

```bash
git add components/landing-sections/privacy.tsx
git commit -m "feat(landing): update privacy section icons and structure"
```

---

### Task 8: Update page.tsx Section Order

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update imports and section order**

New order:
1. HeroPluginSection (keep, already imported)
2. ScenariosSection (was OneLinerSection, update import)
3. HowItWorksSection (was JungianIntelligenceSection, update import)
4. TerminalDemoSection (keep)
5. PrivacySection (keep)
6. PlatformCapabilitiesSection (keep)
7. CtaPluginSection (keep)

Remove from rendering (keep imports commented or remove):
- DreamProcessingSection
- IndividuationScoreSection

Update dynamic imports:
```typescript
const ScenariosSection = dynamicImport(
  () => import('@/components/landing-sections/one-liner').then(mod => ({ default: mod.ScenariosSection })),
  { loading: () => <SectionLoader />, ssr: true }
);

const HowItWorksSection = dynamicImport(
  () => import('@/components/landing-sections/jungian-intelligence').then(mod => ({ default: mod.HowItWorksSection })),
  { loading: () => <SectionLoader />, ssr: true }
);
```

Remove dynamic imports for DreamProcessingSection and IndividuationScoreSection.
Remove their `<Suspense>` + `<ErrorBoundary>` blocks from the JSX.

**Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(landing): update section order — remove dream/individuation, add scenarios/how-it-works"
```

---

### Task 9: Update CTA Section Copy

**Files:**
- Modify: `components/landing-sections/cta-plugin.tsx`

**Step 1: Review and update**

The CTA component already uses `t('ctaPlugin.*')` keys. The new translations will flow through automatically. Verify that all `t()` calls match the updated keys.

If the component references any removed keys, update them.

**Step 2: Commit (if changes needed)**

```bash
git add components/landing-sections/cta-plugin.tsx
git commit -m "feat(landing): update CTA section messaging"
```

---

### Task 10: Update Terminal Demo for Collective Memory

**Files:**
- Modify: `components/landing-sections/terminal-demo.tsx`

**Step 1: Update hardcoded terminal output lines**

The terminal demo has hardcoded strings (not translation keys) showing the memory lifecycle. Update these to show collective memory in action:

```
$ claude "Fix the recursive query bug"
[plugged.in] Session started (mem_7f3a)
[plugged.in] Pattern match found:
             "Recursive query → infinite loop" seen 47 times
             89% caused by missing base case
[plugged.in] Community insight injected:
             "Don't forget to add LIMIT clause" (validated by 23 devs)
[plugged.in] Warning: This pattern led to production issues
             in 12 cases. Consider adding circuit breaker.
[assistant]  Based on community patterns, your issue is likely
             a missing base case. Here's the fix...
[plugged.in] Observation recorded. Pattern strengthened.
[plugged.in] Session complete. Community contribution: +1
```

**Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

**Step 3: Commit**

```bash
git add components/landing-sections/terminal-demo.tsx
git commit -m "feat(landing): update terminal demo to showcase collective memory patterns"
```

---

### Task 11: Full Build & Visual Verification

**Step 1: Run full build**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No new lint errors

**Step 3: Start dev server and verify visually**

Run: `pnpm dev`
Check: http://localhost:12005 — verify all sections render correctly

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(landing): address build/lint issues from redesign"
```
