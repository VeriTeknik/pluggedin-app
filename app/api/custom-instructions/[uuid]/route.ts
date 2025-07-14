import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server'; // External first

import { authenticateApiKey } from '@/app/api/auth'; // Adjust path if needed
import { db } from '@/db';
import { customInstructionsTable, mcpServersTable } from '@/db/schema';

// Define stricter local type matching apparent SDK requirements
type PromptMessageContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string } | { type: 'audio'; data: string; mimeType: string } | { type: 'resource'; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };
type PromptMessage = {
  role: "user" | "assistant"; // Removed 'system'
  content: PromptMessageContent; // Removed array option
};


export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/custom-instructions/{uuid}:
 *   get:
 *     summary: Get specific custom instruction messages (formatted as MCP Prompt)
 *     description: |
 *       Retrieves the messages array for a specific custom instruction, identified by the associated MCP server's UUID.
 *       Requires API key authentication and ensures the server belongs to the authenticated user's active profile.
 *       The response is formatted to mimic the MCP `GetPromptResult` structure (specifically the `messages` array) for compatibility with the pluggedin-mcp proxy, which uses this endpoint to fulfill `prompts/get` requests for custom instructions.
 *       Note: Custom instructions are stored as an array of strings but returned formatted as `[{ role: 'user', content: { type: 'text', text: '...' } }]`.
 *     tags:
 *       - Custom Instructions
 *       - Prompts
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the MCP server whose custom instruction messages are to be fetched.
 *     responses:
 *       200:
 *         description: Successfully retrieved the custom instruction messages, formatted as an MCP prompt message array.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user] # Currently always returns 'user'
 *                       content:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [text] # Currently always 'text'
 *                           text:
 *                             type: string
 *                             description: The content of the instruction message.
 *       400:
 *         description: Bad Request - Server UUID parameter is missing in the path.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Missing server UUID in path
 *       401:
 *         description: Unauthorized - Invalid or missing API key or active profile not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Authorization header with Bearer token is required | Invalid API key | Active profile not found
 *       404:
 *         description: Not Found - Custom instructions not found for the specified server UUID or server does not belong to the active profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Custom instructions not found for server UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *       500:
 *         description: Internal Server Error fetching custom instruction details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error fetching custom instruction details
 *                 details:
 *                   type: string
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> } // Use Promise type and destructure
) {
  try {
    // 1. Authenticate API Key and get active profile UUID
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Get server UUID from awaited destructured params
    const { uuid: serverUuid } = await params; // Await params and destructure uuid
    if (!serverUuid) {
      return NextResponse.json({ error: 'Missing server UUID in path' }, { status: 400 });
    }

    // 3. Query the database for the custom instruction messages
    // Ensure the instruction belongs to a server owned by the authenticated profile
    const instructionResult = await db
      .select({
        messages: customInstructionsTable.messages,
      })
      .from(customInstructionsTable)
      .innerJoin(mcpServersTable, eq(customInstructionsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(customInstructionsTable.mcp_server_uuid, serverUuid), // Match the specific server UUID
        eq(mcpServersTable.profile_uuid, profileUuid) // Ensure it belongs to the user's profile
      ))
      .limit(1);

    if (instructionResult.length === 0) {
      return NextResponse.json({ error: `Custom instructions not found for server UUID: ${serverUuid}` }, { status: 404 });
    }

    // 4. Transform and return the messages array
    const dbMessages = instructionResult[0].messages;
    let transformedMessages: PromptMessage[] = [];

    // Check if dbMessages is an array and contains strings
    if (Array.isArray(dbMessages)) {
      transformedMessages = dbMessages
        .filter(msg => typeof msg === 'string') // Ensure we only process strings
        .map((msgString): PromptMessage => ({
          role: 'user', // Use 'user' role as 'system' is not expected by GetPromptResultSchema
          content: { type: 'text', text: msgString }, // Content should be a single object, not an array
        }));
    } else {
      // Handle cases where messages might not be an array or is null/undefined
      console.warn(`[API /api/custom-instructions/${serverUuid}] Unexpected format for messages in DB:`, dbMessages);
    }

    // Add logging before returning

    // The proxy expects an object like { messages: [...] }
    return NextResponse.json({
      messages: transformedMessages,
    });

  } catch (error) {
    // Log using the extracted serverUuid if available
    // Note: params might not be available in catch block if await failed
    console.error(`[API /api/custom-instructions/[uuid] Error]`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching custom instruction details', details: errorMessage }, { status: 500 });
  }
}
