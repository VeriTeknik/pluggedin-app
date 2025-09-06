# MCP Servers Onboarding Popup - TODO

## Overview
Create a simplified onboarding experience for new users on the `/mcp-servers` page to help them quickly connect Plugged.in MCP proxy to their favorite clients and start exploring plugins.

## Implementation Tasks

### Phase 1: Core Components
- [ ] Create onboarding popup component with multi-step wizard
- [ ] Implement 3-step flow:
  1. Connect your client (Claude Desktop, Cursor, Claude Code, VS Code, etc.)
  2. Explore plugins (show registry link and categories)
  3. Get started (success message and next steps)
- [ ] Add progress indicator for steps
- [ ] Implement smooth transitions between steps

### Phase 2: Client Setup Instructions
- [ ] Create client-specific setup dialogs for:
  - [ ] Claude Desktop (with JSON config)
  - [ ] Claude Code (with CLI commands)
  - [ ] Cursor (with command input)
  - [ ] VS Code (with extension setup)
  - [ ] Smithery (Windows-specific)
- [ ] Add copy-to-clipboard for all commands/configs
- [ ] Integrate API key fetching from user's first API key
- [ ] Add platform detection for relevant instructions

### Phase 3: State Management
- [ ] Create `use-onboarding` hook for:
  - [ ] Tracking completion in localStorage
  - [ ] Per-user state (keyed by user ID)
  - [ ] Skip logic for returning users
  - [ ] Force show via URL parameter
- [ ] Auto-trigger on first visit to `/mcp-servers`
- [ ] Only show for users with no configured servers

### Phase 4: UI Integration
- [ ] Add onboarding trigger to MCP servers page
- [ ] Include "Get Started" button in empty state
- [ ] Add help icon in header to re-trigger onboarding
- [ ] Ensure mobile responsiveness
- [ ] Add keyboard navigation support

### Phase 5: Internationalization
- [ ] Create `onboarding.json` translation file for:
  - [ ] English (en)
  - [ ] Turkish (tr)
  - [ ] Chinese (zh)
  - [ ] Hindi (hi)
  - [ ] Japanese (ja)
  - [ ] Dutch (nl)
- [ ] Translation keys needed:
  - [ ] Step titles and descriptions
  - [ ] Client names and setup instructions
  - [ ] Button labels (Next, Previous, Skip, Get Started)
  - [ ] Success messages

### Phase 6: Polish & Best Practices
- [ ] Implement dismiss option at any step
- [ ] Add "Don't show again" checkbox
- [ ] Visual indicators for completed steps
- [ ] Tooltips for complex terms
- [ ] Loading states for API key fetching
- [ ] Error handling for setup failures

## Files to Create

### New Components
1. `/components/onboarding/onboarding-popup.tsx` - Main wizard component
2. `/components/onboarding/client-setup-dialog.tsx` - Client-specific instructions
3. `/components/onboarding/steps/connect-client-step.tsx` - Step 1 component
4. `/components/onboarding/steps/explore-plugins-step.tsx` - Step 2 component
5. `/components/onboarding/steps/get-started-step.tsx` - Step 3 component

### New Hooks
1. `/hooks/use-onboarding.ts` - Onboarding state management

### New Translations
1. `/public/locales/*/onboarding.json` - All 6 languages

## Files to Modify

1. `/app/(sidebar-layout)/(container)/mcp-servers/page.tsx` - Add onboarding trigger
2. `/app/(sidebar-layout)/(container)/mcp-servers/components/server-hero.tsx` - Add help button

## Success Criteria

1. **User Experience**
   - New users see onboarding on first visit
   - Clear, actionable steps to get started
   - One-click copy for all setup commands
   - Mobile-friendly interface

2. **Technical**
   - State persists across sessions
   - Proper error handling
   - Fully internationalized
   - Accessible (WCAG 2.1 AA compliant)

3. **Performance**
   - Lazy load client instructions
   - Minimal impact on page load
   - Smooth animations

## Testing Checklist

- [ ] Test first-time user experience
- [ ] Test returning user (should not see popup)
- [ ] Test manual trigger via help button
- [ ] Test all client setup flows
- [ ] Test copy-to-clipboard functionality
- [ ] Test mobile responsiveness
- [ ] Test keyboard navigation
- [ ] Test all language translations
- [ ] Test with/without API keys
- [ ] Test dismiss and "don't show again" options

## Notes

- Keep instructions minimal and focused on essential steps only
- Prioritize copy-paste actions over manual typing
- Use visual cues (icons, progress bars) to guide users
- Consider A/B testing different onboarding flows in the future