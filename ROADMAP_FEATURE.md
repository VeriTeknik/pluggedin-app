# Achievement-Weighted Community Roadmap

A gamified feature voting system integrated into the `/analytics` dashboard.

## Overview

Users can:
- Submit feature requests
- Vote YES/NO on features
- Earn increased voting power (1-5×) by unlocking achievements
- View their voting tier (Bronze → Diamond)

Admins can:
- Review pending features
- Accept/decline with reasons
- Set roadmap priorities
- Track vote analytics

## Setup Instructions

### 1. Run Database Migration

```bash
pnpm db:migrate
```

This will create:
- `feature_requests` table
- `feature_votes` table
- Auto-updating triggers for vote counts
- Performance indexes

### 2. Verify Schema

The migration creates these enums:
- `feature_request_status`: pending, accepted, declined, completed, in_progress
- `feature_request_category`: mcp_servers, ui_ux, performance, api, social, library, analytics, security, mobile, other
- `vote_type`: YES, NO

### 3. Access the Feature

Navigate to `/analytics` and click the **Roadmap** tab (Lightbulb icon).

## Vote Weight Calculation

**Formula**: `1 (base) + number of achievements unlocked`

- Vote weight is calculated per profile (workspace). The active profile selected in `/analytics` controls which achievements and tier are used across the roadmap UI and when casting votes.

### Voting Tiers

| Tier | Achievements | Vote Weight | Badge Color |
|------|--------------|-------------|-------------|
| Bronze | 0 | 1× | Orange |
| Silver | 1 | 2× | Gray |
| Gold | 2 | 3× | Yellow |
| Platinum | 3 | 4× | Cyan |
| Diamond | 4 | 5× | Purple |

Achievements are tracked in `/analytics` → **Productivity** tab.

## Features

### User Flow
1. **View Tier**: See current voting power and progress to next tier
2. **Create Request**: Click "New Feature Request" button
3. **Vote**: Click YES/NO buttons (can change vote anytime)
4. **Filter/Sort**: Filter by status/category, sort by trending/recent/top/controversial

### Admin Flow
(Coming soon - extend `/admin` panel)
1. Navigate to `/admin/roadmap`
2. Review pending queue sorted by vote weight
3. Accept (set priority 1-5) or Decline (with reason)
4. Mark as In Progress or Completed

### Gamification Elements
- **Tier Badges**: Visual indicator of voting power
- **Progress Tracking**: Shows achievements needed for next tier
- **Unlock Incentive**: Link to Productivity tab to see achievement progress
- **Weight Display**: Vote buttons show user's multiplier (e.g., "3×")

## Components

### Created Files

**Server Actions** (`app/actions/roadmap.ts`):
- `createFeatureRequest()` - Submit new feature
- `voteOnFeature()` - Cast YES/NO vote with automatic weight
- `getFeatureRequests()` - List with filters/sorting
- `updateFeatureStatus()` - Admin accept/decline
- `getUserVotingTier()` - Get user's tier info

**UI Components**:
- `VoteButton.tsx` - YES/NO voting interface
- `VoteWeightBadge.tsx` - Tier badge with tooltip
- `CreateFeatureDialog.tsx` - Feature request form
- `FeatureRequestsTable.tsx` - Main table with filters
- `RoadmapTab.tsx` - Analytics dashboard tab

**Database**:
- `drizzle/0066_roadmap_tables.sql` - Migration
- `db/schema.ts` - Table definitions and relations

**Translations**:
- `public/locales/en/roadmap.json` - English (complete)
- TODO: `tr`, `zh`, `hi`, `ja`, `nl` (copy structure from `en`)

## API Endpoints (via Server Actions)

### Public
- `createFeatureRequest(data)` - Rate limit: 5/hour
- `voteOnFeature({ featureRequestUuid, vote })` - Rate limit: 50/hour
- `getFeatureRequests({ status?, category?, sortBy?, limit?, offset? })`
- `getFeatureRequestDetails(uuid)`
- `getUserVotingTier()`

### Admin Only
- `updateFeatureStatus({ featureRequestUuid, status, priority?, declinedReason? })`

## Technical Details

### Vote Count Denormalization
Votes are denormalized for performance:
- `votes_yes_count` / `votes_no_count` - User counts
- `votes_yes_weight` / `votes_no_weight` - Weighted totals

Auto-updated via PostgreSQL trigger on INSERT/UPDATE/DELETE.

### Indexes for Performance
- Status + created_at (pending queue)
- Status + vote weight (trending)
- Feature + user (unique vote constraint)
- Created by user (user's requests)

### Security
- Input sanitization (HTML stripped)
- Zod validation
- User authentication required
- Admin role check for status updates
- One vote per user per feature (DB constraint)
- Display names use `@username` only when a user enables their public profile; otherwise voters remain anonymous

## TODO: Remaining Tasks

### High Priority
1. **Translations**: Create 5 language files
   - Copy `public/locales/en/roadmap.json`
   - Translate to: `tr`, `zh`, `hi`, `ja`, `nl`

2. **Admin Panel**: Extend `/admin`
   - Create `/admin/roadmap` page
   - Pending queue with bulk actions
   - Vote analytics dashboard

### Medium Priority
3. **Notifications**: Alert users when their feature is accepted/declined
4. **Email Integration**: Optional email notifications
5. **Mobile Optimization**: Responsive card view for mobile
6. **Vote Analytics**: Charts showing tier distribution per feature

### Low Priority
7. **Comments**: Optional discussion threads per feature
8. **Follow Feature**: Get notified on status changes
9. **GitHub Integration**: Link accepted features to GitHub issues
10. **Public Changelog**: Show completed features

## Testing Checklist

- [ ] Run migration: `pnpm db:migrate`
- [ ] Verify tables created in database
- [ ] Navigate to `/analytics` → Roadmap tab
- [ ] Check voting tier displays correctly
- [ ] Create a feature request
- [ ] Vote YES on a feature
- [ ] Change vote to NO
- [ ] Filter by status
- [ ] Sort by different options
- [ ] Unlock an achievement (check weight increases)
- [ ] Test as admin (when panel is built)

## Troubleshooting

### Vote weight showing as 1× despite achievements
- Check that productivity metrics are working
- Verify user has a profile
- Check console for calculation errors

### Migration fails
- Ensure PostgreSQL version is 15+
- Check for existing `feature_requests` table
- Verify enum types don't already exist

### "Unauthorized" when voting
- User must be signed in
- Check NextAuth session is active

## Future Enhancements

- **Auto-accept threshold**: Auto-accept if YES votes > threshold
- **Controversy score**: Highlight polarizing features
- **Trending algorithm**: Weight recent votes higher
- **User reputation**: Additional weight for active contributors
- **Feature dependencies**: Link related features
- **Milestones**: Group features into release milestones

## Credits

Implementation by Claude Code following CLAUDE.md guidelines:
- Generic, extensible solutions
- Achievement-based gamification
- i18n support for all 6 languages
- Security-first approach
- Performance optimization with denormalization
