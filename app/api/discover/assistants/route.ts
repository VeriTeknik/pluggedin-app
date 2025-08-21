import { and, desc, eq, ilike,or, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';

const QuerySchema = z.object({
  category: z.string().optional(),
  location: z.string().optional(),
  language: z.string().optional(),
  expertise: z.array(z.string()).or(z.string()).optional(),
  industry: z.string().optional(),
  responseTime: z.string().optional(),
  pricingModel: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['relevance', 'response_time', 'recent', 'popular']).default('relevance'),
});

export async function GET(req: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const queryData: any = {
      category: searchParams.get('category') || undefined,
      location: searchParams.get('location') || undefined,
      language: searchParams.get('language') || undefined,
      expertise: searchParams.getAll('expertise'),
      industry: searchParams.get('industry') || undefined,
      responseTime: searchParams.get('responseTime') || undefined,
      pricingModel: searchParams.get('pricingModel') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      sort: searchParams.get('sort') || 'relevance',
    };

    // Validate query parameters
    const validatedQuery = QuerySchema.parse(queryData);
    
    // Calculate offset for pagination
    const offset = (validatedQuery.page - 1) * validatedQuery.limit;

    // Build WHERE conditions
    const whereConditions = [
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true),
    ];

    // Category filter
    if (validatedQuery.category && validatedQuery.category !== 'all') {
      whereConditions.push(eq(embeddedChatsTable.category, validatedQuery.category));
    }

    // Location filter (partial match)
    if (validatedQuery.location) {
      whereConditions.push(ilike(embeddedChatsTable.location, `%${validatedQuery.location}%`));
    }

    // Language filter
    if (validatedQuery.language && validatedQuery.language !== 'all') {
      whereConditions.push(eq(embeddedChatsTable.language, validatedQuery.language));
    }

    // Response time filter
    if (validatedQuery.responseTime && validatedQuery.responseTime !== 'all') {
      whereConditions.push(eq(embeddedChatsTable.response_time, validatedQuery.responseTime));
    }

    // Pricing model filter
    if (validatedQuery.pricingModel && validatedQuery.pricingModel !== 'all') {
      whereConditions.push(eq(embeddedChatsTable.pricing_model, validatedQuery.pricingModel));
    }

    // Industry filter
    if (validatedQuery.industry) {
      whereConditions.push(eq(embeddedChatsTable.industry, validatedQuery.industry));
    }

    // Search filter
    if (validatedQuery.search) {
      const searchCondition = or(
        ilike(embeddedChatsTable.name, `%${validatedQuery.search}%`),
        ilike(embeddedChatsTable.description, `%${validatedQuery.search}%`),
        ilike(embeddedChatsTable.profession, `%${validatedQuery.search}%`),
        ilike(embeddedChatsTable.capabilities_summary, `%${validatedQuery.search}%`)
      );
      if (searchCondition) {
        whereConditions.push(searchCondition);
      }
    }

    // Build ORDER BY based on sort parameter - simplified to avoid Drizzle errors
    let orderBy: any[] = [];
    switch (validatedQuery.sort) {
      case 'response_time':
        // Order by response time field directly
        orderBy = [embeddedChatsTable.response_time];
        break;
      case 'recent':
        orderBy = [desc(embeddedChatsTable.created_at)];
        break;
      case 'popular':
        // Order by install count descending
        orderBy = [desc(embeddedChatsTable.install_count)];
        break;
      case 'relevance':
      default:
        // Default to recent for now to avoid complex SQL
        orderBy = [desc(embeddedChatsTable.created_at)];
        break;
    }

    // Main query for assistants - select all fields to avoid Drizzle issues
    const rawResults = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(and(...whereConditions))
      .orderBy(...orderBy)
      .limit(validatedQuery.limit)
      .offset(offset);
    
    // Map the raw results to the expected format
    const assistantsResult = rawResults.map(row => ({
      uuid: row.embedded_chats.uuid,
      name: row.embedded_chats.name,
      slug: row.embedded_chats.slug,
      description: row.embedded_chats.description,
      location: row.embedded_chats.location,
      profession: row.embedded_chats.profession,
      expertise: row.embedded_chats.expertise,
      category: row.embedded_chats.category,
      subcategory: row.embedded_chats.subcategory,
      language: row.embedded_chats.language,
      timezone: row.embedded_chats.timezone,
      industry: row.embedded_chats.industry,
      keywords: row.embedded_chats.keywords,
      company_name: row.embedded_chats.company_name,
      company_size: row.embedded_chats.company_size,
      target_audience: row.embedded_chats.target_audience,
      response_time: row.embedded_chats.response_time,
      pricing_model: row.embedded_chats.pricing_model,
      capabilities_summary: row.embedded_chats.capabilities_summary,
      interaction_style: row.embedded_chats.interaction_style,
      bot_avatar_url: row.embedded_chats.bot_avatar_url,
      message_count: 0, // No message_count field in schema, using default
      created_at: row.embedded_chats.created_at,
      project_uuid: row.projects.uuid,
      project_name: row.projects.name,
      user_id: row.users.id,
      username: row.users.username,
      user_avatar_url: row.users.avatar_url,
      user_image: row.users.image,
    }));

    // Count query for pagination
    const countResult = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(and(...whereConditions));

    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / validatedQuery.limit);

    // Format response
    const response = {
      assistants: assistantsResult.map((assistant) => ({
        uuid: assistant.uuid,
        name: assistant.name,
        slug: assistant.slug,
        description: assistant.description,
        avatarUrl: assistant.bot_avatar_url,
        discovery: {
          location: assistant.location,
          profession: assistant.profession,
          expertise: assistant.expertise || [],
          category: assistant.category,
          subcategory: assistant.subcategory,
          language: assistant.language,
          timezone: assistant.timezone,
          industry: assistant.industry,
          keywords: assistant.keywords || [],
          companyName: assistant.company_name,
          companySize: assistant.company_size,
          targetAudience: assistant.target_audience || [],
          responseTime: assistant.response_time,
          pricingModel: assistant.pricing_model,
          capabilitiesSummary: assistant.capabilities_summary,
          interactionStyle: assistant.interaction_style,
        },
        stats: {
          messageCount: assistant.message_count || 0,
        },
        owner: {
          userId: assistant.user_id,
          username: assistant.username,
          avatarUrl: assistant.user_avatar_url || assistant.user_image,
          image: assistant.user_image,
          projectName: assistant.project_name,
        },
        createdAt: assistant.created_at,
      })),
      pagination: {
        page: validatedQuery.page,
        limit: validatedQuery.limit,
        totalCount,
        totalPages,
        hasMore: validatedQuery.page < totalPages,
      },
      filters: {
        category: validatedQuery.category,
        location: validatedQuery.location,
        language: validatedQuery.language,
        expertise: Array.isArray(validatedQuery.expertise) ? validatedQuery.expertise : [],
        industry: validatedQuery.industry,
        responseTime: validatedQuery.responseTime,
        pricingModel: validatedQuery.pricingModel,
        search: validatedQuery.search,
        sort: validatedQuery.sort,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching assistants:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch assistants' },
      { status: 500 }
    );
  }
}