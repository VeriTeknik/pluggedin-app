import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';
import { and, eq, ilike, or, sql, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

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

async function handler(req: NextRequest) {
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
    
    // Normalize expertise to array
    const expertiseArray = Array.isArray(validatedQuery.expertise) 
      ? validatedQuery.expertise 
      : validatedQuery.expertise 
        ? [validatedQuery.expertise]
        : [];

    // Build WHERE conditions
    const conditions = [
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true),
    ];

    // Category filter
    if (validatedQuery.category && validatedQuery.category !== 'all') {
      conditions.push(eq(embeddedChatsTable.category, validatedQuery.category));
    }

    // Location filter (partial match)
    if (validatedQuery.location) {
      conditions.push(
        ilike(embeddedChatsTable.location, `%${validatedQuery.location}%`)
      );
    }

    // Language filter
    if (validatedQuery.language && validatedQuery.language !== 'all') {
      conditions.push(eq(embeddedChatsTable.language, validatedQuery.language));
    }

    // Industry filter
    if (validatedQuery.industry) {
      conditions.push(
        ilike(embeddedChatsTable.industry, `%${validatedQuery.industry}%`)
      );
    }

    // Response time filter
    if (validatedQuery.responseTime && validatedQuery.responseTime !== 'all') {
      conditions.push(eq(embeddedChatsTable.response_time, validatedQuery.responseTime));
    }

    // Pricing model filter
    if (validatedQuery.pricingModel && validatedQuery.pricingModel !== 'all') {
      conditions.push(eq(embeddedChatsTable.pricing_model, validatedQuery.pricingModel));
    }

    // Search filter (across multiple fields)
    if (validatedQuery.search) {
      const searchTerm = `%${validatedQuery.search}%`;
      conditions.push(
        or(
          ilike(embeddedChatsTable.name, searchTerm),
          ilike(embeddedChatsTable.description, searchTerm),
          ilike(embeddedChatsTable.profession, searchTerm),
          ilike(embeddedChatsTable.capabilities_summary, searchTerm),
          sql`${embeddedChatsTable.keywords}::text ILIKE ${searchTerm}`,
          sql`${embeddedChatsTable.expertise}::text ILIKE ${searchTerm}`,
          sql`${embeddedChatsTable.semantic_tags}::text ILIKE ${searchTerm}`
        )
      );
    }

    // Expertise filter (check if any expertise matches)
    if (expertiseArray.length > 0) {
      const expertiseConditions = expertiseArray.map(exp => 
        sql`${exp} = ANY(${embeddedChatsTable.expertise})`
      );
      conditions.push(or(...expertiseConditions));
    }

    // Calculate offset for pagination
    const offset = (validatedQuery.page - 1) * validatedQuery.limit;

    // Build ORDER BY clause based on sort parameter
    let orderByClause;
    switch (validatedQuery.sort) {
      case 'response_time':
        orderByClause = [
          sql`CASE 
            WHEN ${embeddedChatsTable.response_time} = 'instant' THEN 1
            WHEN ${embeddedChatsTable.response_time} = '1-5min' THEN 2
            WHEN ${embeddedChatsTable.response_time} = '5-15min' THEN 3
            WHEN ${embeddedChatsTable.response_time} = '15-30min' THEN 4
            WHEN ${embeddedChatsTable.response_time} = '30-60min' THEN 5
            WHEN ${embeddedChatsTable.response_time} = '1-2hours' THEN 6
            WHEN ${embeddedChatsTable.response_time} = '2-4hours' THEN 7
            WHEN ${embeddedChatsTable.response_time} = '4-8hours' THEN 8
            WHEN ${embeddedChatsTable.response_time} = '24hours' THEN 9
            ELSE 10
          END`,
        ];
        break;
      case 'recent':
        orderByClause = [sql`${embeddedChatsTable.created_at} DESC`];
        break;
      case 'popular':
        orderByClause = [sql`${embeddedChatsTable.message_count} DESC NULLS LAST`];
        break;
      case 'relevance':
      default:
        // For relevance, prioritize matches in name/profession, then other fields
        if (validatedQuery.search) {
          orderByClause = [
            sql`CASE 
              WHEN ${embeddedChatsTable.name} ILIKE ${`%${validatedQuery.search}%`} THEN 1
              WHEN ${embeddedChatsTable.profession} ILIKE ${`%${validatedQuery.search}%`} THEN 2
              ELSE 3
            END`,
            sql`${embeddedChatsTable.message_count} DESC NULLS LAST`
          ];
        } else {
          orderByClause = [sql`${embeddedChatsTable.message_count} DESC NULLS LAST`];
        }
        break;
    }

    // Query for assistants with pagination
    const [assistants, totalCountResult] = await Promise.all([
      db
        .select({
          uuid: embeddedChatsTable.uuid,
          name: embeddedChatsTable.name,
          slug: embeddedChatsTable.slug,
          description: embeddedChatsTable.description,
          location: embeddedChatsTable.location,
          profession: embeddedChatsTable.profession,
          expertise: embeddedChatsTable.expertise,
          category: embeddedChatsTable.category,
          subcategory: embeddedChatsTable.subcategory,
          language: embeddedChatsTable.language,
          timezone: embeddedChatsTable.timezone,
          industry: embeddedChatsTable.industry,
          keywords: embeddedChatsTable.keywords,
          company_name: embeddedChatsTable.company_name,
          company_size: embeddedChatsTable.company_size,
          target_audience: embeddedChatsTable.target_audience,
          response_time: embeddedChatsTable.response_time,
          pricing_model: embeddedChatsTable.pricing_model,
          capabilities_summary: embeddedChatsTable.capabilities_summary,
          interaction_style: embeddedChatsTable.interaction_style,
          bot_avatar_url: embeddedChatsTable.bot_avatar_url,
          message_count: embeddedChatsTable.message_count,
          created_at: embeddedChatsTable.created_at,
          // Get project and user info
          project_uuid: projectsTable.uuid,
          project_name: projectsTable.name,
          user_id: users.id,
          username: users.username,
          user_avatar_url: users.avatar_url,
        })
        .from(embeddedChatsTable)
        .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
        .innerJoin(users, eq(projectsTable.user_id, users.id))
        .where(and(...conditions))
        .orderBy(...orderByClause)
        .limit(validatedQuery.limit)
        .offset(offset),
      
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(embeddedChatsTable)
        .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
        .innerJoin(users, eq(projectsTable.user_id, users.id))
        .where(and(...conditions))
    ]);

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / validatedQuery.limit);

    // Format response
    const response = {
      assistants: assistants.map(assistant => ({
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
          avatarUrl: assistant.user_avatar_url,
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
        expertise: expertiseArray,
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

export const GET = handler;