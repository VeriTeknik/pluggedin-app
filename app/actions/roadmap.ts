'use server';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';

import { db } from '@/db';
import {
  FeatureRequestCategory,
  featureRequestsTable,
  FeatureRequestStatus,
  featureVotesTable,
  profilesTable,
  projectsTable,
  VoteType,
} from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { rateLimiter } from '@/lib/rate-limiter';

import { getProductivityMetrics } from './analytics/productivity';

// ===== Validation Schemas =====

const createFeatureRequestSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(2000, 'Description must be less than 2000 characters').optional(),
  category: z.nativeEnum(FeatureRequestCategory),
});

const voteOnFeatureSchema = z.object({
  featureRequestUuid: z.string().uuid(),
  vote: z.nativeEnum(VoteType),
  profileUuid: z.string().uuid().optional(),
});

const updateFeatureStatusSchema = z.object({
  featureRequestUuid: z.string().uuid(),
  status: z.nativeEnum(FeatureRequestStatus),
  priority: z.number().min(1).max(5).optional(),
  declinedReason: z.string().max(500).optional(),
});

const deleteFeatureRequestSchema = z.object({
  featureRequestUuid: z.string().uuid(),
});

const getFeatureRequestsSchema = z.object({
  status: z.nativeEnum(FeatureRequestStatus).optional(),
  category: z.nativeEnum(FeatureRequestCategory).optional(),
  sortBy: z.enum(['trending', 'recent', 'controversial', 'top']).optional().default('trending'),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

type PublicUserSummary = {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  isPublicProfile: boolean;
};

type Achievement = {
  id: string;
  title: string;
  description?: string;
  achieved: boolean;
  progress?: number;
  target?: number;
};

type FeatureUpdateData = {
  status: FeatureRequestStatus;
  updated_at: Date;
  accepted_at?: Date;
  accepted_by_admin_id?: string;
  roadmap_priority?: number;
  declined_at?: Date;
  declined_reason?: string;
};

const buildPublicUserSummary = <
  T extends { username?: string | null; avatar_url?: string | null; is_public?: boolean | null }
>(
  user?: T
): PublicUserSummary | null => {
  if (!user) return null;
  const isPublicProfile = Boolean(user.is_public && user.username);

  if (isPublicProfile && user.username) {
    return {
      displayName: `@${user.username}`,
      username: user.username,
      avatarUrl: user.avatar_url || null,
      isPublicProfile: true,
    };
  }

  return {
    displayName: null,
    username: null,
    avatarUrl: null,
    isPublicProfile: false,
  };
};

// ===== Vote Weight Calculation =====

const MAX_VOTE_WEIGHT = 5;
const DEFAULT_TOTAL_ACHIEVEMENTS = 4;

type VotingStats = {
  weight: number;
  achievementsUnlocked: number;
  totalAchievements: number;
  resolvedProfileUuid: string | null;
};

const tierNames = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'] as const;

const VOTING_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const VOTING_STATS_FALLBACK_TTL_MS = 60 * 1000; // 1 minute
const MAX_VOTING_STATS_CACHE_ENTRIES = 512;

const votingStatsCache = new Map<string, { stats: VotingStats; expiresAt: number }>();

const getVotingStatsCacheKey = (userId: string, profileUuid: string | null | undefined, preferredProfileUuid?: string) =>
  `${userId}:${profileUuid ?? 'none'}:${preferredProfileUuid ?? 'auto'}`;

const getVotingStatsFromCache = (cacheKey: string): VotingStats | null => {
  const cached = votingStatsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // Re-insert to move to end (LRU behavior - most recently accessed stays)
    votingStatsCache.delete(cacheKey);
    votingStatsCache.set(cacheKey, cached);
    return cached.stats;
  }
  return null;
};

const setVotingStatsCache = (
  cacheKey: string,
  stats: VotingStats,
  ttl: number
) => {
  if (votingStatsCache.size >= MAX_VOTING_STATS_CACHE_ENTRIES) {
    // Remove the first (oldest) entry - Maps maintain insertion order
    const oldestKey = votingStatsCache.keys().next().value;
    if (oldestKey) {
      votingStatsCache.delete(oldestKey);
    }
  }
  votingStatsCache.set(cacheKey, { stats, expiresAt: Date.now() + ttl });
};

async function resolveProfileUuidForUser(userId: string, preferredProfileUuid?: string): Promise<string | null> {
  if (preferredProfileUuid) {
    const profile = await db
      .select({ uuid: profilesTable.uuid })
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(and(eq(profilesTable.uuid, preferredProfileUuid), eq(projectsTable.user_id, userId)))
      .limit(1);

    if (profile.length > 0) {
      return profile[0].uuid;
    }
  }

  const project = await db.query.projectsTable.findFirst({
    where: (projects, { eq }) => eq(projects.user_id, userId),
    columns: { active_profile_uuid: true },
    with: {
      profiles: {
        columns: { uuid: true, created_at: true },
        orderBy: (profiles, { asc }) => [asc(profiles.created_at)],
        limit: 1,
      },
    },
  });

  if (!project) {
    return null;
  }

  if (project.active_profile_uuid) {
    return project.active_profile_uuid;
  }

  if (project.profiles && project.profiles[0]) {
    return project.profiles[0].uuid;
  }

  return null;
}

async function getVotingStatsForUser(userId: string, preferredProfileUuid?: string): Promise<VotingStats> {
  let resolvedProfileUuid: string | null = null;

  try {
    resolvedProfileUuid = await resolveProfileUuidForUser(userId, preferredProfileUuid);
    const cacheKey = getVotingStatsCacheKey(userId, resolvedProfileUuid, preferredProfileUuid);

    // Check cache using proper LRU getter
    const cachedStats = getVotingStatsFromCache(cacheKey);
    if (cachedStats) {
      return cachedStats;
    }

    if (!resolvedProfileUuid) {
      const fallbackStats: VotingStats = {
        weight: 1,
        achievementsUnlocked: 0,
        totalAchievements: DEFAULT_TOTAL_ACHIEVEMENTS,
        resolvedProfileUuid: null,
      };
      setVotingStatsCache(cacheKey, fallbackStats, VOTING_STATS_FALLBACK_TTL_MS);
      return fallbackStats;
    }

    const metricsResult = await getProductivityMetrics(resolvedProfileUuid, 'all');

    if (!metricsResult.success || !metricsResult.data) {
      const fallbackStats: VotingStats = {
        weight: 1,
        achievementsUnlocked: 0,
        totalAchievements: DEFAULT_TOTAL_ACHIEVEMENTS,
        resolvedProfileUuid,
      };
      setVotingStatsCache(cacheKey, fallbackStats, VOTING_STATS_FALLBACK_TTL_MS);
      return fallbackStats;
    }

    const achievements = (metricsResult.data.achievements as Achievement[]) || [];
    const unlockedCount = achievements.filter((achievement) => achievement?.achieved).length;
    const weight = Math.min(1 + unlockedCount, MAX_VOTE_WEIGHT);

    const stats: VotingStats = {
      weight,
      achievementsUnlocked: unlockedCount,
      totalAchievements: achievements.length || DEFAULT_TOTAL_ACHIEVEMENTS,
      resolvedProfileUuid,
    };

    setVotingStatsCache(cacheKey, stats, VOTING_STATS_CACHE_TTL_MS);
    return stats;
  } catch (error) {
    console.error('Error calculating voting stats:', error);
    const cacheKey = getVotingStatsCacheKey(userId, resolvedProfileUuid, preferredProfileUuid);
    const fallbackStats: VotingStats = {
      weight: 1,
      achievementsUnlocked: 0,
      totalAchievements: DEFAULT_TOTAL_ACHIEVEMENTS,
      resolvedProfileUuid,
    };
    setVotingStatsCache(cacheKey, fallbackStats, VOTING_STATS_FALLBACK_TTL_MS);
    return fallbackStats;
  }
}

export async function calculateVoteWeight(userId: string, profileUuid?: string): Promise<number> {
  const stats = await getVotingStatsForUser(userId, profileUuid);
  return stats.weight;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Unauthorized. Please sign in.');
  }

  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, session.user.id),
    columns: { is_admin: true },
  });

  if (!user?.is_admin) {
    throw new Error('Unauthorized. Admin access required.');
  }

  return session.user.id;
}

// ===== Server Actions =====

/**
 * Create a new feature request
 * Rate limited to 5 requests per hour per user
 */
export async function createFeatureRequest(
  data: z.infer<typeof createFeatureRequestSchema>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized. Please sign in.' };
    }

    // Rate limiting: 5 feature requests per hour per user
    const rateLimitCheck = await rateLimiter.check(
      `roadmap-create:${session.user.id}`,
      5,
      3600 // 1 hour
    );

    if (!rateLimitCheck.success) {
      return {
        success: false,
        error: `Rate limit exceeded. You can create ${rateLimitCheck.remaining} more feature request(s) in ${Math.ceil(rateLimitCheck.reset / 60)} minutes.`,
      };
    }

    // Validate input
    const validated = createFeatureRequestSchema.parse(data);

    // Sanitize title and description for XSS protection
    const sanitizedTitle = sanitizeHtml(validated.title, {
      allowedTags: [],  // Strip all HTML tags
      allowedAttributes: {}  // Strip all attributes
    }).trim();

    const sanitizedDescription = validated.description
      ? sanitizeHtml(validated.description, {
          allowedTags: [],  // Strip all HTML tags for security
          allowedAttributes: {}  // Strip all attributes
        }).trim()
      : null;

    // Create feature request
    const [featureRequest] = await db
      .insert(featureRequestsTable)
      .values({
        title: sanitizedTitle,
        description: sanitizedDescription,
        category: validated.category,
        created_by_user_id: session.user.id,
      })
      .returning();

    return {
      success: true,
      data: featureRequest,
    };
  } catch (error) {
    console.error('Error creating feature request:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation error' };
    }
    return { success: false, error: 'Failed to create feature request' };
  }
}

/**
 * Vote on a feature request (YES or NO)
 * Automatically calculates vote weight based on user achievements
 * Rate limited to 10 votes per minute per user
 */
export async function voteOnFeature(
  data: z.infer<typeof voteOnFeatureSchema>
): Promise<{ success: boolean; voteWeight?: number; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized. Please sign in.' };
    }

    // Rate limiting: 10 votes per minute per user
    const rateLimitCheck = await rateLimiter.check(
      `roadmap-vote:${session.user.id}`,
      10,
      60 // 1 minute
    );

    if (!rateLimitCheck.success) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimitCheck.reset} seconds before voting again.`,
      };
    }

    // Validate input
    const validated = voteOnFeatureSchema.parse(data);

    // Check if feature request exists
    const featureRequest = await db.query.featureRequestsTable.findFirst({
      where: eq(featureRequestsTable.uuid, validated.featureRequestUuid),
    });

    if (!featureRequest) {
      return { success: false, error: 'Feature request not found' };
    }

    // Validate profile ownership if profileUuid is provided
    const votingStats = await getVotingStatsForUser(session.user.id, validated.profileUuid);
    if (!votingStats.resolvedProfileUuid) {
      return { success: false, error: 'Profile not found for voting' };
    }

    // If a specific profileUuid was requested, ensure it matches the resolved one
    if (validated.profileUuid && validated.profileUuid !== votingStats.resolvedProfileUuid) {
      return { success: false, error: 'Invalid profile. You do not have access to this profile.' };
    }

    const voteWeight = votingStats.weight;

    // Use database transaction to prevent race conditions
    await db.transaction(async (tx) => {
      // Check if user has already voted
      const existingVote = await tx.query.featureVotesTable.findFirst({
        where: and(
          eq(featureVotesTable.feature_request_uuid, validated.featureRequestUuid),
          eq(featureVotesTable.user_id, session.user.id)
        ),
      });

      if (existingVote) {
        // Update existing vote
        await tx
          .update(featureVotesTable)
          .set({
            vote: validated.vote,
            vote_weight: voteWeight,
            updated_at: new Date(),
          })
          .where(eq(featureVotesTable.uuid, existingVote.uuid));
      } else {
        // Create new vote
        await tx.insert(featureVotesTable).values({
          feature_request_uuid: validated.featureRequestUuid,
          user_id: session.user.id,
          vote: validated.vote,
          vote_weight: voteWeight,
        });
      }

    });

    // Invalidate voting stats cache for this user to ensure fresh data on next fetch
    const cacheKey = getVotingStatsCacheKey(session.user.id, votingStats.resolvedProfileUuid, validated.profileUuid);
    votingStatsCache.delete(cacheKey);

    return {
      success: true,
      voteWeight,
    };
  } catch (error) {
    console.error('Error voting on feature:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation error' };
    }
    return { success: false, error: 'Failed to record vote' };
  }
}

/**
 * Get all feature requests with votes
 */
export async function getFeatureRequests(
  params?: Partial<z.infer<typeof getFeatureRequestsSchema>>
): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
  currentUserVotes?: Record<string, { vote: VoteType; weight: number }>;
}> {
  try {
    const session = await getServerSession(authOptions);
    const validated = getFeatureRequestsSchema.parse(params || {});

    // Build where conditions
    const conditions = [];
    if (validated.status) {
      conditions.push(eq(featureRequestsTable.status, validated.status));
    }
    if (validated.category) {
      conditions.push(eq(featureRequestsTable.category, validated.category));
    }

    // Determine sort order
    let orderBy;
    switch (validated.sortBy) {
      case 'trending':
        // Sort by YES vote weight descending
        orderBy = [desc(featureRequestsTable.votes_yes_weight)];
        break;
      case 'recent':
        orderBy = [desc(featureRequestsTable.created_at)];
        break;
      case 'controversial':
        // Sort by highest NO votes
        orderBy = [desc(featureRequestsTable.votes_no_weight)];
        break;
      case 'top':
        // Sort by total weighted votes (YES + NO)
        orderBy = [
          desc(
            sql`${featureRequestsTable.votes_yes_weight} + ${featureRequestsTable.votes_no_weight}`
          ),
        ];
        break;
      default:
        orderBy = [desc(featureRequestsTable.votes_yes_weight)];
    }

    // Query feature requests with creator info
    const query = db.query.featureRequestsTable.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy,
      limit: validated.limit,
      offset: validated.offset,
      with: {
        createdBy: {
          columns: {
            username: true,
            avatar_url: true,
            is_public: true,
          },
        },
        acceptedBy: {
          columns: {
            username: true,
            avatar_url: true,
            is_public: true,
          },
        },
      },
    });

    const featureRequests = await query;

    // Get current user's votes if logged in
    let currentUserVotes: Record<string, { vote: VoteType; weight: number }> = {};
    if (session?.user?.id) {
      const featureUuids = featureRequests.map((f) => f.uuid);
      if (featureUuids.length > 0) {
        const userVotes = await db
          .select()
          .from(featureVotesTable)
          .where(
            and(
              eq(featureVotesTable.user_id, session.user.id),
              inArray(featureVotesTable.feature_request_uuid, featureUuids)
            )
          );

        currentUserVotes = userVotes.reduce((acc, vote) => {
          acc[vote.feature_request_uuid] = {
            vote: vote.vote,
            weight: vote.vote_weight,
          };
          return acc;
        }, {} as Record<string, { vote: VoteType; weight: number }>);
      }
    }

    const sanitizedFeatures = featureRequests.map(({ createdBy, acceptedBy, ...rest }) => ({
      ...rest,
      createdBy: buildPublicUserSummary(createdBy),
      acceptedBy: buildPublicUserSummary(acceptedBy ?? undefined),
    }));

    return {
      success: true,
      data: sanitizedFeatures,
      currentUserVotes,
    };
  } catch (error) {
    console.error('Error fetching feature requests:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation error' };
    }
    return { success: false, error: 'Failed to fetch feature requests' };
  }
}

/**
 * Get a single feature request with detailed vote breakdown
 */
export async function getFeatureRequestDetails(
  featureRequestUuid: string,
  options?: {
    voteLimit?: number;
    voteOffset?: number;
    voteDirection?: 'latest' | 'oldest';
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized. Please sign in.' };
    }

    // Rate limiting: 30 requests per minute per user
    const rateLimitCheck = await rateLimiter.check(
      `roadmap-details:${session.user.id}`,
      30,
      60 // 1 minute
    );

    if (!rateLimitCheck.success) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateLimitCheck.reset} seconds before trying again.`,
      };
    }

    const voteLimit = Math.min(Math.max(options?.voteLimit ?? 50, 1), 200);
    const voteOffset = Math.min(Math.max(options?.voteOffset ?? 0, 0), 10000); // Add max offset to prevent performance issues
    const orderDirection = options?.voteDirection === 'oldest' ? 'oldest' : 'latest';

    const featureRequest = await db.query.featureRequestsTable.findFirst({
      where: eq(featureRequestsTable.uuid, featureRequestUuid),
      with: {
        createdBy: {
          columns: {
            username: true,
            avatar_url: true,
            is_public: true,
          },
        },
        acceptedBy: {
          columns: {
            username: true,
            avatar_url: true,
            is_public: true,
          },
        },
      },
    });

    if (!featureRequest) {
      return { success: false, error: 'Feature request not found' };
    }

    const votesQuery = await db.query.featureVotesTable.findMany({
      where: eq(featureVotesTable.feature_request_uuid, featureRequestUuid),
      orderBy: (votes, { asc, desc }) => [
        orderDirection === 'oldest' ? asc(votes.created_at) : desc(votes.created_at),
      ],
      limit: voteLimit + 1, // Fetch one extra to detect "has more"
      offset: voteOffset,
      with: {
        user: {
          columns: {
            username: true,
            avatar_url: true,
            is_public: true,
          },
        },
      },
    });

    const hasMore = votesQuery.length > voteLimit;
    const trimmedVotes = hasMore ? votesQuery.slice(0, voteLimit) : votesQuery;

    // Calculate vote weight distribution
    const voteDistribution = {
      weight1: 0,
      weight2: 0,
      weight3: 0,
      weight4: 0,
      weight5: 0,
    };

    const distributionRows = await db
      .select({
        weight: featureVotesTable.vote_weight,
        count: sql<number>`COUNT(*)`,
      })
      .from(featureVotesTable)
      .where(eq(featureVotesTable.feature_request_uuid, featureRequestUuid))
      .groupBy(featureVotesTable.vote_weight);

    distributionRows.forEach((row) => {
      // Validate weight is between 1-5 before using to prevent potential injection
      if (row.weight >= 1 && row.weight <= 5) {
        const weightKey = `weight${row.weight}` as keyof typeof voteDistribution;
        if (weightKey in voteDistribution) {
          voteDistribution[weightKey] = Number(row.count);
        }
      }
    });

    const sanitizedVotes = trimmedVotes.map(({ user, ...vote }) => ({
      ...vote,
      user: buildPublicUserSummary(user),
    }));

    const totalVotes = Number(featureRequest.votes_yes_count) + Number(featureRequest.votes_no_count);

    return {
      success: true,
      data: {
        ...featureRequest,
        createdBy: buildPublicUserSummary(featureRequest.createdBy),
        acceptedBy: buildPublicUserSummary(featureRequest.acceptedBy ?? undefined),
        votes: sanitizedVotes,
        voteDistribution,
        pagination: {
          limit: voteLimit,
          offset: voteOffset,
          hasMore,
          nextOffset: hasMore ? voteOffset + voteLimit : null,
          totalVotes,
          order: orderDirection,
        },
      },
    };
  } catch (error) {
    console.error('Error fetching feature request details:', error);
    return { success: false, error: 'Failed to fetch feature request details' };
  }
}

/**
 * Update feature request status (Admin only)
 */
export async function updateFeatureStatus(
  data: z.infer<typeof updateFeatureStatusSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const adminUserId = await requireAdmin();

    // Validate input
    const validated = updateFeatureStatusSchema.parse(data);

    // Prepare update data with proper typing
    const updateData: Partial<FeatureUpdateData> = {
      status: validated.status,
      updated_at: new Date(),
    };

    if (validated.status === FeatureRequestStatus.ACCEPTED) {
      updateData.accepted_at = new Date();
      updateData.accepted_by_admin_id = adminUserId;
      if (validated.priority) {
        updateData.roadmap_priority = validated.priority;
      }
    } else if (validated.status === FeatureRequestStatus.DECLINED) {
      updateData.declined_at = new Date();
      if (validated.declinedReason) {
        // Sanitize declined reason to prevent XSS
        updateData.declined_reason = sanitizeHtml(validated.declinedReason, {
          allowedTags: [],
          allowedAttributes: {}
        }).trim();
      }
    }

    // Update feature request
    await db
      .update(featureRequestsTable)
      .set(updateData)
      .where(eq(featureRequestsTable.uuid, validated.featureRequestUuid));

    return { success: true };
  } catch (error) {
    console.error('Error updating feature status:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation error' };
    }
    return { success: false, error: 'Failed to update feature status' };
  }
}

/**
 * Delete feature request (Admin only)
 */
export async function deleteFeatureRequest(
  data: z.infer<typeof deleteFeatureRequestSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const validated = deleteFeatureRequestSchema.parse(data);

    const existing = await db.query.featureRequestsTable.findFirst({
      where: eq(featureRequestsTable.uuid, validated.featureRequestUuid),
    });

    if (!existing) {
      return { success: false, error: 'Feature request not found' };
    }

    await db
      .delete(featureVotesTable)
      .where(eq(featureVotesTable.feature_request_uuid, validated.featureRequestUuid));

    await db
      .delete(featureRequestsTable)
      .where(eq(featureRequestsTable.uuid, validated.featureRequestUuid));

    return { success: true };
  } catch (error) {
    console.error('Error deleting feature request:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0]?.message || 'Validation error' };
    }
    return { success: false, error: 'Failed to delete feature request' };
  }
}

/**
 * Get voting tier info for current user
 */
export async function getUserVotingTier(profileUuid?: string): Promise<{
  success: boolean;
  data?: {
    tier: string;
    weight: number;
    achievementsUnlocked: number;
    totalAchievements: number;
    nextTierAt: number | null;
    profileUuid?: string | null;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized. Please sign in.' };
    }

    const stats = await getVotingStatsForUser(session.user.id, profileUuid);
    const achievementsUnlocked = Math.min(stats.achievementsUnlocked, MAX_VOTE_WEIGHT - 1);
    const tierIndex = Math.min(achievementsUnlocked, tierNames.length - 1);
    const tier = tierNames[tierIndex] || tierNames[0];
    const nextTierAt =
      achievementsUnlocked < tierNames.length - 1 ? achievementsUnlocked + 1 : null;

    return {
      success: true,
      data: {
        tier,
        weight: stats.weight,
        achievementsUnlocked,
        totalAchievements: stats.totalAchievements,
        nextTierAt,
        profileUuid: stats.resolvedProfileUuid,
      },
    };
  } catch (error) {
    console.error('Error getting user voting tier:', error);
    return { success: false, error: 'Failed to get voting tier' };
  }
}
