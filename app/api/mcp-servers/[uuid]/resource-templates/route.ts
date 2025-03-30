import {eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server'; // Ensure both are imported

import { db } from '@/db';
import { mcpServersTable, resourceTemplatesTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth'; // Use getAuthSession
// Assuming a client exists or will be created to interact with the pluggedin-mcp proxy
// import { getPluggedinMcpClient } from '@/lib/pluggedin-mcp-client'; // Placeholder

// Remove explicit interface RouteContext

// Helper function to parse variables from URI Template (RFC 6570 basic syntax)
function parseTemplateVariables(uriTemplate: string): string[] {
  // Regex to find simple variables like {var} or {varname}
  const regex = /\{([^}]+)\}/g;
  const matches = uriTemplate.matchAll(regex);
  const variables = new Set<string>();
  for (const match of matches) {
    // Basic extraction, doesn't handle RFC 6570 operators (+, #, ., /, ;, ?, &)
    variables.add(match[1]);
  }
  return Array.from(variables);
}

// Apply correct signature for potentially promised params
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> } // Type inner params as Promise
) {
  const { uuid: serverUuid } = await params; // Await and destructure uuid
  const session = await getAuthSession(); // Call getAuthSession
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  // serverUuid is now defined above

  try {
    // 1. Authorize: Verify the user owns the server via project/profile
    const server = await db.query.mcpServersTable.findFirst({
      // Explicitly select columns to help with type inference
      columns: { uuid: true }, // Only need uuid to confirm existence
      where: eq(mcpServersTable.uuid, serverUuid),
      with: {
        profile: {
          columns: { uuid: true }, // Only need uuid
          with: {
            project: {
              columns: { user_id: true }, // Select user_id explicitly
            },
          },
        },
      },
    });

    // Check authorization using the explicitly selected user_id
    if (!server || server.profile?.project?.user_id !== userId) {
      return NextResponse.json({ error: 'Server not found or unauthorized' }, { status: 404 });
    }

    // 2. Fetch from pluggedin-mcp proxy
    // TODO: Implement the client/logic to call the pluggedin-mcp proxy's
    //       `resources/templates/list` method. This might involve:
    //       - Getting the user's Pluggedin API key for the relevant project.
    //       - Setting up an MCP client connection to the proxy (stdio or http).
    //       - Making the request.
    // Placeholder for fetched templates:
    const fetchedTemplates: Array<{
      uriTemplate: string;
      name?: string | null;
      description?: string | null;
      mimeType?: string | null;
    }> = [
      // Example data - replace with actual fetch
      // { uriTemplate: "weather://{city}/current", name: "[Weather Server] Current Weather", description: "Gets current weather", mimeType: "application/json" },
      // { uriTemplate: "github://repos/{owner}/{repo}/issues", name: "[GitHub] List Issues", description: "Lists repository issues" },
    ];
    console.warn("Resource template fetching from pluggedin-mcp proxy is not yet implemented. Returning empty array.");


    // 3. Clear existing templates for this server in DB
    await db.delete(resourceTemplatesTable).where(eq(resourceTemplatesTable.mcp_server_uuid, serverUuid));

    // 4. Parse, Store results in DB
    const storedTemplates = [];
    if (fetchedTemplates.length > 0) {
      for (const template of fetchedTemplates) {
        const variables = parseTemplateVariables(template.uriTemplate);
        const [inserted] = await db.insert(resourceTemplatesTable).values({
          mcp_server_uuid: serverUuid,
          uri_template: template.uriTemplate,
          name: template.name,
          description: template.description,
          mime_type: template.mimeType,
          template_variables: variables,
        }).returning();
        storedTemplates.push(inserted);
      }
      console.log(`Stored ${storedTemplates.length} resource templates for server ${serverUuid}`);
    } else {
       console.log(`No resource templates found/fetched for server ${serverUuid}`);
    }


    // 5. Return the newly stored templates (or potentially query again to be sure)
    const finalTemplates = await db.query.resourceTemplatesTable.findMany({
        where: eq(resourceTemplatesTable.mcp_server_uuid, serverUuid),
        orderBy: (templates, { asc }) => [asc(templates.name), asc(templates.uri_template)],
    });

    return NextResponse.json(finalTemplates);

  } catch (error: any) {
    console.error(`Error processing resource templates for server ${serverUuid}:`, error);
    return NextResponse.json({ error: 'Failed to process resource templates', details: error.message }, { status: 500 });
  }
}
