import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';
import { and, eq, sql, isNotNull } from 'drizzle-orm';

const CATEGORY_METADATA = {
  technology: {
    label: 'Technology',
    icon: '💻',
    description: 'Software development, IT, and tech support',
  },
  healthcare: {
    label: 'Healthcare',
    icon: '🏥',
    description: 'Medical advice, health management, and wellness',
  },
  education: {
    label: 'Education',
    icon: '📚',
    description: 'Learning, tutoring, and academic support',
  },
  finance: {
    label: 'Finance',
    icon: '💰',
    description: 'Banking, investments, and financial planning',
  },
  retail: {
    label: 'Retail',
    icon: '🛍️',
    description: 'Shopping assistance and product recommendations',
  },
  entertainment: {
    label: 'Entertainment',
    icon: '🎬',
    description: 'Media, gaming, and content creation',
  },
  travel: {
    label: 'Travel',
    icon: '✈️',
    description: 'Trip planning and travel assistance',
  },
  realestate: {
    label: 'Real Estate',
    icon: '🏠',
    description: 'Property search and real estate services',
  },
  legal: {
    label: 'Legal',
    icon: '⚖️',
    description: 'Legal advice and documentation',
  },
  marketing: {
    label: 'Marketing',
    icon: '📣',
    description: 'Marketing strategy and content creation',
  },
  other: {
    label: 'Other',
    icon: '🔧',
    description: 'Miscellaneous and specialized services',
  },
};

async function handler(req: NextRequest) {
  try {
    // Get counts for each category
    const categoryCounts = await db
      .select({
        category: embeddedChatsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(embeddedChatsTable)
      .where(
        and(
          eq(embeddedChatsTable.is_public, true),
          eq(embeddedChatsTable.is_active, true),
          isNotNull(embeddedChatsTable.category)
        )
      )
      .groupBy(embeddedChatsTable.category);

    // Get subcategory counts
    const subcategoryCounts = await db
      .select({
        category: embeddedChatsTable.category,
        subcategory: embeddedChatsTable.subcategory,
        count: sql<number>`count(*)::int`,
      })
      .from(embeddedChatsTable)
      .where(
        and(
          eq(embeddedChatsTable.is_public, true),
          eq(embeddedChatsTable.is_active, true),
          isNotNull(embeddedChatsTable.category),
          isNotNull(embeddedChatsTable.subcategory)
        )
      )
      .groupBy(embeddedChatsTable.category, embeddedChatsTable.subcategory);

    // Get top expertise areas
    const expertiseAreas = await db.execute(sql`
      SELECT 
        expertise_item,
        COUNT(*) as count
      FROM (
        SELECT 
          unnest(expertise) as expertise_item
        FROM ${embeddedChatsTable}
        WHERE 
          ${embeddedChatsTable.is_public} = true 
          AND ${embeddedChatsTable.is_active} = true
          AND ${embeddedChatsTable.expertise} IS NOT NULL
      ) as expertise_list
      GROUP BY expertise_item
      ORDER BY count DESC
      LIMIT 20
    `);

    // Build response with metadata
    const categories = Object.keys(CATEGORY_METADATA).map(key => {
      const count = categoryCounts.find(c => c.category === key)?.count || 0;
      const subcategories = subcategoryCounts
        .filter(s => s.category === key)
        .map(s => ({
          name: s.subcategory,
          count: s.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 subcategories per category

      return {
        value: key,
        ...CATEGORY_METADATA[key as keyof typeof CATEGORY_METADATA],
        count,
        subcategories,
      };
    });

    // Sort categories by count
    categories.sort((a, b) => b.count - a.count);

    // Calculate total assistants
    const totalAssistants = categories.reduce((sum, cat) => sum + cat.count, 0);

    const response = {
      categories,
      topExpertise: expertiseAreas.rows.map((row: any) => ({
        name: row.expertise_item,
        count: parseInt(row.count),
      })),
      stats: {
        totalCategories: categories.filter(c => c.count > 0).length,
        totalAssistants,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

export const GET = handler;