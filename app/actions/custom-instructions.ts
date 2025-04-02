'use server';

import { and, eq } from 'drizzle-orm';

// import { revalidatePath } from 'next/cache'; // Removed unused import
import { db } from '@/db';
import { customInstructionsTable, mcpServersTable } from '@/db/schema';
// import { getAuthSession } from '@/lib/auth'; // Removed unused import

// Define the structure for the messages array based on schema
type McpMessageContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

type McpMessage = {
  role: "user" | "assistant" | "system";
  content: McpMessageContent | McpMessageContent[];
};


/**
 * Retrieves the custom instructions for a specific MCP server belonging to the user.
 * @param profileUuid The UUID of the user's active profile.
 * @param serverUuid The UUID of the MCP server.
 * @returns The custom instructions record or null if not found/accessible.
 */
export async function getCustomInstructionsForServer(profileUuid: string, serverUuid: string) {
  if (!profileUuid || !serverUuid) {
    console.error("[Action Error] getCustomInstructionsForServer: Missing profile or server UUID.");
    return null;
  }

  try {
    // Verify server ownership indirectly by checking if it exists for the profile
    const serverCheck = await db.query.mcpServersTable.findFirst({
        where: and(
            eq(mcpServersTable.uuid, serverUuid),
            eq(mcpServersTable.profile_uuid, profileUuid)
        ),
        columns: { uuid: true }
    });

    if (!serverCheck) {
        console.error(`[Action Error] getCustomInstructionsForServer: Server ${serverUuid} not found for profile ${profileUuid}.`);
        return null; // Or throw an error? Returning null might be safer for UI.
    }

    // Fetch the custom instructions for this server
    const instructions = await db.query.customInstructionsTable.findFirst({
      where: eq(customInstructionsTable.mcp_server_uuid, serverUuid),
    });

    return instructions; // Returns the record or undefined if none exists

  } catch (error) {
    console.error(`[Action Error] Failed to get custom instructions for server ${serverUuid}:`, error);
    return null; // Return null on error
  }
}

/**
 * Creates or updates the custom instructions for a specific MCP server.
 * @param profileUuid The UUID of the user's active profile.
 * @param serverUuid The UUID of the MCP server.
 * @param messages The array of McpMessage objects representing the instructions.
 * @param description Optional description for the instruction set.
 * @returns An object indicating success or failure.
 */
export async function upsertCustomInstructions(
  profileUuid: string,
  serverUuid: string,
  messages: McpMessage[],
  description?: string | null
): Promise<{ success: boolean; error?: string }> {
   if (!profileUuid || !serverUuid) {
    return { success: false, error: 'Profile UUID and Server UUID are required.' };
  }
   if (!Array.isArray(messages)) {
     return { success: false, error: 'Instructions must be provided as an array of messages.' };
   }

  try {
     // Verify server ownership indirectly
     const serverCheck = await db.query.mcpServersTable.findFirst({
        where: and(
            eq(mcpServersTable.uuid, serverUuid),
            eq(mcpServersTable.profile_uuid, profileUuid)
        ),
        columns: { uuid: true }
    });

     if (!serverCheck) {
        return { success: false, error: 'Server not found or not associated with the active profile.' };
    }

    // Prepare data for upsert
    const instructionData = {
      mcp_server_uuid: serverUuid,
      messages: messages,
      description: description ?? undefined, // Use undefined if null/undefined passed
      // name: 'custom_instructions', // Keep name fixed for now
      updated_at: new Date(), // Explicitly set updated_at
    };

    // Perform upsert
    await db.insert(customInstructionsTable)
      .values(instructionData)
      .onConflictDoUpdate({
        target: customInstructionsTable.mcp_server_uuid, // Unique constraint column
        set: {
          messages: instructionData.messages,
          description: instructionData.description,
          updated_at: instructionData.updated_at,
        }
      });

    // Optionally revalidate paths if needed
    // revalidatePath(`/mcp-servers/${serverUuid}`);

    return { success: true };

  } catch (error) {
    console.error(`[Action Error] Failed to upsert custom instructions for server ${serverUuid}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to save custom instructions: ${errorMessage}` };
  }
}
