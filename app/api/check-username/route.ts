import { NextRequest, NextResponse } from 'next/server';

import { checkUsernameAvailability } from '@/app/actions/social';

/**
 * @swagger
 * /api/check-username:
 *   get:
 *     summary: Check username availability
 *     description: Checks if a given username is available for registration or use.
 *     tags:
 *       - Users
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: The username to check for availability.
 *     responses:
 *       200:
 *         description: Username availability status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   description: True if the username is available, false otherwise.
 *                 message:
 *                   type: string
 *                   description: A message indicating the reason if not available (e.g., 'Username already taken', 'Invalid username format').
 *                   nullable: true
 *       400:
 *         description: Bad Request - Username query parameter is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Username is required
 *       500:
 *         description: Internal Server Error - Failed to check username availability.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: An error occurred while checking username availability
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json(
      { available: false, message: 'Username is required' },
      { status: 400 }
    );
  }

  try {
    const availability = await checkUsernameAvailability(username);
    return NextResponse.json(availability);
  } catch (error) {
    console.error('Error checking username availability:', error);
    return NextResponse.json(
      { 
        available: false, 
        message: 'An error occurred while checking username availability' 
      },
      { status: 500 }
    );
  }
}
