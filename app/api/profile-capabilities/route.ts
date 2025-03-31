import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { profilesTable } from '@/db/schema';

import { authenticateApiKey } from '../auth';

/**
 * @swagger
 * /api/profile-capabilities:
 *   get:
 *     summary: Get enabled capabilities for the active profile
 *     description: Retrieves the list of enabled capability strings (e.g., 'TOOLS_MANAGEMENT') for the profile associated with the provided API key. Requires API key authentication. This is used by the pluggedin-mcp proxy to determine feature availability.
 *     tags:
 *       - Profiles
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved profile capabilities.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profileCapabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: An array of enabled capability strings for the profile. Defaults to an empty array if none are set.
 *                   example: ["TOOLS_MANAGEMENT", "RESOURCE_TEMPLATES"]
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Active profile not found for the API key.
 *       500:
 *         description: Internal Server Error.
 */
export async function GET(request: Request) {
  try {
    // Authenticate using the API key
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
