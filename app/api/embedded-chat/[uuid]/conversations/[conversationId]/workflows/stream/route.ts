import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { conversationWorkflowsTable } from '@/db/schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string; conversationId: string }> }
) {
  const { uuid, conversationId } = await params;
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Function to send data to the client
      const sendUpdate = async (data: any) => {
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('[WorkflowSSE] Error sending update:', error);
        }
      };
      
      // Send initial data
      try {
        const workflows = await db.query.conversationWorkflowsTable.findMany({
          where: eq(conversationWorkflowsTable.conversation_id, conversationId),
          with: {
            tasks: true,
            template: true
          },
          orderBy: (workflows, { desc }) => [desc(workflows.created_at)]
        });
        
        await sendUpdate({ type: 'initial', workflows });
      } catch (error) {
        console.error('[WorkflowSSE] Error fetching initial workflows:', error);
        await sendUpdate({ type: 'error', message: 'Failed to fetch workflows' });
      }
      
      // Set up polling for changes (can be replaced with database triggers in production)
      let lastUpdate = new Date();
      const pollInterval = setInterval(async () => {
        try {
          // Check for updated workflows
          const workflows = await db.query.conversationWorkflowsTable.findMany({
            where: eq(conversationWorkflowsTable.conversation_id, conversationId),
            with: {
              tasks: true,
              template: true
            },
            orderBy: (workflows, { desc }) => [desc(workflows.updated_at)]
          });
          
          // Check if there are any updates since the last check
          const hasUpdates = workflows.some(w => 
            new Date(w.updated_at) > lastUpdate ||
            (w.tasks && w.tasks.some(t => new Date(t.updated_at) > lastUpdate))
          );
          
          if (hasUpdates) {
            lastUpdate = new Date();
            await sendUpdate({ type: 'update', workflows });
          }
        } catch (error) {
          console.error('[WorkflowSSE] Error polling for updates:', error);
        }
      }, 500); // Poll every 500ms for near real-time updates
      
      // Clean up on connection close
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        controller.close();
      });
    }
  });
  
  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}