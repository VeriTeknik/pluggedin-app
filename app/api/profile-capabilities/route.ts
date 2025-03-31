import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { profilesTable } from '@/db/schema';

import { authenticateApiKey } from '../auth'; // Adjust path if needed

export async function GET(request: Request) {
  try {
    // Authenticate using the API key provided by pluggedin-mcp
    const auth = await authenticateApiKey(request);
    if (auth.error) {
      return auth.error;
    }

    // The authenticateApiKey function should return the activeProfile
    if (!auth.activeProfile) {
      return NextResponse.json(
        { error: 'Active profile not found for the provided API key.' },
        { status: 404 }
      );
    }

    // Fetch the specific profile using the UUID from the authenticated context
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, auth.activeProfile.uuid),
      columns: {
        enabled_capabilities: true, // Select only the capabilities column
      },
    });

    if (!profile) {
      // This case should ideally not happen if authenticateApiKey worked, but good to check
      return NextResponse.json(
        { error: 'Profile details not found.' },
        { status: 404 }
      );
    }

    // Return the capabilities array
    return NextResponse.json({
      profileCapabilities: profile.enabled_capabilities || [], // Return empty array if null/undefined
    });

  } catch (error: any) {
    console.error('Error fetching profile capabilities:', error);
    return NextResponse.json(
      {
        error: 'Internal server error fetching profile capabilities',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
