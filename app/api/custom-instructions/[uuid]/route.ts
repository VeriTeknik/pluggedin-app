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
 * GET /api/custom-instructions/[uuid]
 *
 * Retrieves the custom instruction messages for a specific MCP server,
 * identified by its UUID. Used by the proxy to fulfill `prompts/get`
 * requests for custom instructions.
 * Expects 'Authorization: Bearer <API_KEY>' header and UUID in the path.
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
    console.log(`[API /api/custom-instructions/${serverUuid}] Transformed messages being returned:`, JSON.stringify(transformedMessages));

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
