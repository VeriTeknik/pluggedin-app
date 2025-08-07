import { and, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { embeddedChatsTable, projectsTable, users } from '@/db/schema';

const SemanticSearchSchema = z.object({
  query: z.string().min(1).max(500),
  userContext: z.object({
    location: z.string().optional(),
    language: z.string().optional(),
    timezone: z.string().optional(),
    preferredResponseTime: z.string().optional(),
    budget: z.enum(['free', 'paid', 'any']).optional(),
  }).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

async function handler(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const validatedData = SemanticSearchSchema.parse(body);
    
    const { query, userContext, limit } = validatedData;
    
    // Tokenize the query for better matching
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    // Build relevance scoring query
    // This scoring algorithm considers multiple factors:
    // 1. Direct matches in capabilities_summary (highest weight)
    // 2. Matches in expertise array
    // 3. Matches in keywords and semantic_tags
    // 4. Matches in profession and industry
    // 5. Context matching (location, language, response time)
    
    const relevanceScore = sql`
      (
        -- Capabilities summary match (weight: 5)
        CASE WHEN LOWER(${embeddedChatsTable.capabilities_summary}) LIKE ${`%${query.toLowerCase()}%`} 
          THEN 5 ELSE 0 END +
        
        -- Name/profession match (weight: 4)
        CASE WHEN LOWER(${embeddedChatsTable.name}) LIKE ${`%${query.toLowerCase()}%`} 
          THEN 4 ELSE 0 END +
        CASE WHEN LOWER(${embeddedChatsTable.profession}) LIKE ${`%${query.toLowerCase()}%`} 
          THEN 4 ELSE 0 END +
        
        -- Expertise array match (weight: 3 per match)
        COALESCE((
          SELECT SUM(3) FROM unnest(${embeddedChatsTable.expertise}) AS exp
          WHERE LOWER(exp) LIKE ANY(ARRAY[${queryTokens.map(t => `%${t}%`)}])
        ), 0) +
        
        -- Keywords array match (weight: 2 per match)
        COALESCE((
          SELECT SUM(2) FROM unnest(${embeddedChatsTable.keywords}) AS kw
          WHERE LOWER(kw) LIKE ANY(ARRAY[${queryTokens.map(t => `%${t}%`)}])
        ), 0) +
        
        -- Semantic tags match (weight: 2 per match)
        COALESCE((
          SELECT SUM(2) FROM unnest(${embeddedChatsTable.semantic_tags}) AS st
          WHERE LOWER(st) LIKE ANY(ARRAY[${queryTokens.map(t => `%${t}%`)}])
        ), 0) +
        
        -- Use cases match (weight: 3 per match)
        COALESCE((
          SELECT SUM(3) FROM unnest(${embeddedChatsTable.use_cases}) AS uc
          WHERE LOWER(uc) LIKE ${`%${query.toLowerCase()}%`}
        ), 0) +
        
        -- Industry match (weight: 1)
        CASE WHEN LOWER(${embeddedChatsTable.industry}) LIKE ${`%${query.toLowerCase()}%`} 
          THEN 1 ELSE 0 END +
        
        -- Category match (weight: 1)
        CASE WHEN LOWER(${embeddedChatsTable.category}) LIKE ANY(ARRAY[${queryTokens.map(t => `%${t}%`)}])
          THEN 1 ELSE 0 END +
        
        -- Description match (weight: 1)
        CASE WHEN LOWER(${embeddedChatsTable.description}) LIKE ${`%${query.toLowerCase()}%`} 
          THEN 1 ELSE 0 END
      )`;

    // Add context-based scoring if provided
    let contextBonus = sql`0`;
    const contextConditions = [];

    if (userContext) {
      // Location proximity bonus
      if (userContext.location) {
        contextBonus = sql`${contextBonus} + 
          CASE WHEN LOWER(${embeddedChatsTable.location}) LIKE ${`%${userContext.location.toLowerCase()}%`} 
            THEN 2 ELSE 0 END`;
      }
      
      // Language match bonus
      if (userContext.language) {
        contextBonus = sql`${contextBonus} + 
          CASE WHEN ${embeddedChatsTable.language} = ${userContext.language} 
            THEN 3 ELSE 0 END`;
      }
      
      // Response time preference
      if (userContext.preferredResponseTime) {
        contextBonus = sql`${contextBonus} + 
          CASE WHEN ${embeddedChatsTable.response_time} = ${userContext.preferredResponseTime} 
            THEN 1 ELSE 0 END`;
      }
      
      // Budget preference
      if (userContext.budget) {
        if (userContext.budget === 'free') {
          contextConditions.push(eq(embeddedChatsTable.pricing_model, 'free'));
        } else if (userContext.budget === 'paid') {
          contextConditions.push(sql`${embeddedChatsTable.pricing_model} != 'free'`);
        }
      }
    }

    const finalScore = sql`(${relevanceScore} + ${contextBonus})`;

    // Build WHERE conditions
    const conditions = [
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true),
      sql`${finalScore} > 0`, // Only return results with some relevance
      ...contextConditions,
    ];

    // Execute the semantic search query
    const results = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        name: embeddedChatsTable.name,
        slug: embeddedChatsTable.slug,
        description: embeddedChatsTable.description,
        location: embeddedChatsTable.location,
        profession: embeddedChatsTable.profession,
        expertise: embeddedChatsTable.expertise,
        category: embeddedChatsTable.category,
        language: embeddedChatsTable.language,
        industry: embeddedChatsTable.industry,
        keywords: embeddedChatsTable.keywords,
        company_name: embeddedChatsTable.company_name,
        response_time: embeddedChatsTable.response_time,
        pricing_model: embeddedChatsTable.pricing_model,
        capabilities_summary: embeddedChatsTable.capabilities_summary,
        use_cases: embeddedChatsTable.use_cases,
        semantic_tags: embeddedChatsTable.semantic_tags,
        interaction_style: embeddedChatsTable.interaction_style,
        bot_avatar_url: embeddedChatsTable.bot_avatar_url,
        message_count: embeddedChatsTable.message_count,
        created_at: embeddedChatsTable.created_at,
        // Get project and user info
        project_name: projectsTable.name,
        username: users.username,
        user_avatar_url: users.avatar_url,
        // Include relevance score
        relevanceScore: finalScore,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(and(...conditions))
      .orderBy(sql`${finalScore} DESC`)
      .limit(limit);

    // Calculate match explanations for each result
    const assistantsWithExplanations = results.map(assistant => {
      const matchReasons = [];
      
      // Check what matched
      if (assistant.capabilities_summary?.toLowerCase().includes(query.toLowerCase())) {
        matchReasons.push('Capabilities match your needs');
      }
      if (assistant.profession?.toLowerCase().includes(query.toLowerCase())) {
        matchReasons.push(`Professional expertise in ${assistant.profession}`);
      }
      if (assistant.expertise?.some(e => e.toLowerCase().includes(query.toLowerCase()))) {
        matchReasons.push('Expertise areas align with your query');
      }
      if (assistant.use_cases?.some(uc => uc.toLowerCase().includes(query.toLowerCase()))) {
        matchReasons.push('Handles similar use cases');
      }
      
      // Add context matches
      if (userContext?.location && assistant.location?.toLowerCase().includes(userContext.location.toLowerCase())) {
        matchReasons.push(`Located in ${assistant.location}`);
      }
      if (userContext?.language && assistant.language === userContext.language) {
        matchReasons.push(`Speaks your language`);
      }
      
      return {
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
          language: assistant.language,
          industry: assistant.industry,
          responseTime: assistant.response_time,
          pricingModel: assistant.pricing_model,
          capabilitiesSummary: assistant.capabilities_summary,
          interactionStyle: assistant.interaction_style,
        },
        matchInfo: {
          score: Number(assistant.relevanceScore),
          reasons: matchReasons,
        },
        owner: {
          username: assistant.username,
          avatarUrl: assistant.user_avatar_url,
          projectName: assistant.project_name,
        },
        stats: {
          messageCount: assistant.message_count || 0,
        },
      };
    });

    const response = {
      query,
      userContext,
      results: assistantsWithExplanations,
      totalResults: assistantsWithExplanations.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error performing semantic search:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to perform semantic search' },
      { status: 500 }
    );
  }
}

export const POST = handler;