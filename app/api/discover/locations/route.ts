import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';
import { and, eq, sql, isNotNull, ilike } from 'drizzle-orm';

async function handler(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    // Build conditions
    const conditions = [
      eq(embeddedChatsTable.is_public, true),
      eq(embeddedChatsTable.is_active, true),
      isNotNull(embeddedChatsTable.location),
    ];

    // Add search filter if provided
    if (query) {
      conditions.push(
        ilike(embeddedChatsTable.location, `%${query}%`)
      );
    }

    // Get unique locations with counts
    const locations = await db
      .select({
        location: embeddedChatsTable.location,
        count: sql<number>`count(*)::int`,
      })
      .from(embeddedChatsTable)
      .where(and(...conditions))
      .groupBy(embeddedChatsTable.location)
      .orderBy(sql`count(*) DESC`)
      .limit(limit);

    // Parse locations to extract cities and countries
    const locationData = locations.map(loc => {
      const location = loc.location || '';
      const parts = location.split(',').map(p => p.trim());
      
      let city = '';
      let country = '';
      
      if (parts.length >= 2) {
        city = parts[0];
        country = parts[parts.length - 1];
      } else if (parts.length === 1) {
        // Could be either city or country
        city = parts[0];
      }
      
      return {
        full: location,
        city,
        country,
        count: loc.count,
      };
    });

    // Get top countries
    const countryMap = new Map<string, number>();
    locationData.forEach(loc => {
      if (loc.country) {
        countryMap.set(
          loc.country,
          (countryMap.get(loc.country) || 0) + loc.count
        );
      }
    });

    const topCountries = Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const response = {
      locations: locationData,
      topCountries,
      totalLocations: locations.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch locations' },
      { status: 500 }
    );
  }
}

export const GET = handler;