import { eq, isNotNull,sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';

async function handler(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const category = searchParams.get('category');
    const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);

    // Build base conditions
    const whereConditions = [
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true),
      isNotNull(embeddedChatsTable.expertise),
    ];

    // Add category filter if provided
    if (category && category !== 'all') {
      whereConditions.push(eq(embeddedChatsTable.category, category));
    }

    // Get expertise areas with counts
    const expertiseQuery = sql`
      SELECT 
        expertise_item,
        COUNT(*) as count,
        array_agg(DISTINCT category) as categories
      FROM (
        SELECT 
          unnest(expertise) as expertise_item,
          category
        FROM embedded_chats
        WHERE 
          is_public = true 
          AND is_active = true
          AND expertise IS NOT NULL
          ${category && category !== 'all' ? sql`AND category = ${category}` : sql``}
      ) as expertise_list
      GROUP BY expertise_item
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    const expertiseAreas = await db.execute(expertiseQuery);

    // Get related keywords for top expertise areas
    const topExpertise = expertiseAreas.rows.slice(0, 10).map((row: any) => row.expertise_item);
    
    let relatedKeywords: any[] = [];
    if (topExpertise.length > 0) {
      const keywordsQuery = sql`
        SELECT 
          keyword,
          COUNT(*) as count
        FROM (
          SELECT 
            unnest(keywords) as keyword
          FROM embedded_chats
          WHERE 
            is_public = true 
            AND is_active = true
            AND keywords IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM unnest(expertise) as exp
              WHERE exp = ANY(ARRAY[${topExpertise}])
            )
        ) as keywords_list
        GROUP BY keyword
        ORDER BY count DESC
        LIMIT 20
      `;
      
      const keywordsResult = await db.execute(keywordsQuery);
      relatedKeywords = keywordsResult.rows;
    }

    // Format the response
    const formattedExpertise = expertiseAreas.rows.map((row: any) => ({
      name: row.expertise_item,
      count: parseInt(row.count),
      categories: row.categories.filter((c: any) => c !== null),
    }));

    const formattedKeywords = relatedKeywords.map((row: any) => ({
      name: row.keyword,
      count: parseInt(row.count),
    }));

    // Group expertise by first letter for alphabetical navigation
    const alphabeticalGroups = formattedExpertise.reduce((acc: any, exp) => {
      const firstLetter = exp.name[0].toUpperCase();
      if (!acc[firstLetter]) {
        acc[firstLetter] = [];
      }
      acc[firstLetter].push(exp);
      return acc;
    }, {});

    // Get statistics - fix the SQL to avoid set-returning function in aggregate
    const statsQuery = sql`
      WITH expertise_data AS (
        SELECT 
          uuid,
          unnest(expertise) as expertise_item
        FROM embedded_chats
        WHERE 
          is_public = true 
          AND is_active = true
          AND expertise IS NOT NULL
      )
      SELECT 
        COUNT(DISTINCT uuid) as "totalAssistants",
        COUNT(DISTINCT expertise_item) as "totalExpertiseAreas"
      FROM expertise_data
    `;
    
    const statsResult = await db.execute(statsQuery);

    const stats = statsResult.rows[0] || { totalAssistants: 0, totalExpertiseAreas: 0 };

    const response = {
      expertise: formattedExpertise,
      relatedKeywords: formattedKeywords,
      alphabeticalGroups,
      stats: {
        totalExpertiseAreas: stats.totalExpertiseAreas,
        totalAssistantsWithExpertise: stats.totalAssistants,
        displayedCount: formattedExpertise.length,
      },
      filters: {
        category,
        limit,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching expertise areas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expertise areas' },
      { status: 500 }
    );
  }
}

export const GET = handler;