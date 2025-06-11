import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server'; // Re-added NextRequest

import { db } from '@/db';
import { users } from '@/db/schema';

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get public user details by ID
 *     description: Retrieves basic public details for a specific user identified by their ID. This endpoint does not require authentication.
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to fetch details for.
 *     responses:
 *       200:
 *         description: Successfully retrieved user details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                   nullable: true
 *                 email:
 *                   type: string
 *                   format: email
 *                   nullable: true # Assuming email might not always be public
 *                 username:
 *                   type: string
 *                   nullable: true
 *                 image:
 *                   type: string
 *                   format: url
 *                   nullable: true
 *       404:
 *         description: Not Found - User with the specified ID was not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User not found
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */
// Using NextRequest and 'any' for context type as a diagnostic step
export async function GET(
  request: NextRequest, // Use NextRequest type
  context: any // Use 'any' to bypass type check temporarily
) {
  const { params } = context; // Destructure params inside the function
  
  // Await params to comply with Next.js 15 requirements
  const resolvedParams = await params;
  
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, resolvedParams.id),
      columns: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
