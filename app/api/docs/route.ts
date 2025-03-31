import { NextResponse } from 'next/server';

import { getApiDocs } from '../swagger'; // Adjust path if swagger.ts is moved

/**
 * @swagger
 * /api/docs:
 *   get:
 *     summary: Get OpenAPI Specification
 *     description: Retrieves the OpenAPI 3.0 specification for the Plugged.in App API in JSON format.
 *     tags:
 *       - Documentation
 *     responses:
 *       200:
 *         description: Successfully retrieved the OpenAPI specification.
 *         content:
 *           application/json:
 *             schema:
 *               type: object # Represents the OpenAPI spec object
 *               description: The full OpenAPI specification document.
 *       500:
 *         description: Internal Server Error - Failed to generate the specification.
 */
export async function GET() {
  try {
    const spec = await getApiDocs();
    return NextResponse.json(spec);
  } catch (error) {
    console.error("Error generating API docs:", error);
    return NextResponse.json(
      { error: "Internal server error generating API documentation" },
      { status: 500 }
    );
  }
}
