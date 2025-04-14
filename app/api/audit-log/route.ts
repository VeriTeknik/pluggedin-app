import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod'; // Recommended for explicit validation

import { AuditLogOptions,logAuditEvent } from '@/app/actions/audit-logger'; // Import type

// Define a schema for allowed client-side log data (Direct Call Path)
const ClientLogSchema = z.object({
  type: z.enum(['API_CALL', 'AUTH', 'PROFILE', 'MCP_SERVER', 'MCP_REQUEST', 'MCP_SERVER_LOG', 'ADMIN', 'SYSTEM']), // Allow specific types
  action: z.string().min(1).max(255), // Require an action string
  logMessage: z.string().max(1024).optional(), // Allow optional message
  metadata: z.record(z.any()).optional(), // Allow metadata, but consider stricter validation
  // Explicitly OMIT fields like requestBody, responseStatus, etc. that clients shouldn't control
});

/**
 * @swagger
 * /api/audit-log:
 *   post:
 *     summary: Record an audit log event
 *     description: |
 *       Records an audit log event. This endpoint can be called directly by authorized clients or internally by middleware.
 *
 *       **Usage Scenarios:**
 *       1.  **Middleware Logging:** If specific headers (`x-request-start-time`, `x-request-path`, etc.) are present (added by middleware), it logs an `API_CALL` event using header data and calculates response time. **Crucially, it ignores `requestBody` from the client payload in this mode for security.**
 *       2.  **Direct Client Logging:** If middleware headers are absent, it expects a JSON body conforming to the `ClientLogSchema` (allowing specific `type`, `action`, `logMessage`, `metadata`). It validates the input and logs the event, associating it with the authenticated user's profile.
 *
 *       Requires user session authentication.
 *     tags:
 *       - Audit Log
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf: # Describes the two possible request body structures
 *               - type: object
 *                 description: Payload structure when called directly by a client (middleware headers absent).
 *                 required: [type, action]
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [API_CALL, AUTH, PROFILE, MCP_SERVER, MCP_REQUEST, MCP_SERVER_LOG, ADMIN, SYSTEM]
 *                     description: The type of the audit event.
 *                   action:
 *                     type: string
 *                     description: A description of the action performed (e.g., 'USER_LOGIN', 'CREATE_SERVER'). Max 255 chars.
 *                   logMessage:
 *                     type: string
 *                     description: An optional detailed message for the log entry. Max 1024 chars.
 *                     nullable: true
 *                   metadata:
 *                     type: object
 *                     description: Optional structured metadata (key-value pairs). Use with caution from client-side calls.
 *                     additionalProperties: true
 *                     nullable: true
 *               - type: object
 *                 description: Payload structure when called via middleware (middleware headers present). `requestBody` here is ignored.
 *                 properties:
 *                   action:
 *                     type: string
 *                     description: Optional action description (defaults to 'API_REQUEST').
 *                   responseStatus:
 *                     type: integer
 *                     description: Optional HTTP response status code provided by the caller.
 *                   # requestBody: (Explicitly omitted - not used from client payload in middleware mode)
 *     responses:
 *       200:
 *         description: Audit event successfully logged.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad Request - Invalid log data provided in direct client call mode.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Invalid log data provided
 *       401:
 *         description: Unauthorized - User session is invalid or missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       500:
 *         description: Internal Server Error - Failed to log the audit event.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Failed to log audit event
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    const profileUuid = session?.user?.id;
    
    // Get request data
    // IMPORTANT: Do not trust arbitrary data from the client for logging sensitive details.
    const rawData = await request.json();
    
    // Get standard headers
    const headersList = await headers();
    
    // First, check if we have headers passed from middleware
    const requestStartTime = headersList.get('x-request-start-time');
    
    if (requestStartTime) {
      // This is coming from middleware
      const endTime = Date.now();
      const startTime = parseInt(requestStartTime);
      const responseTimeMs = endTime - startTime;
      
      // Log using data from headers (Middleware Path)
      // SECURITY NOTE: Avoid logging requestBody provided by the client payload (`rawData.requestBody`).
      // If request body logging is needed, it should be captured and passed securely by the middleware itself.
      // For now, we log null for requestBody from this path.
      await logAuditEvent({
        profileUuid,
        type: 'API_CALL', // Assume middleware calls are API_CALL type
        action: rawData.action || 'API_REQUEST', // Allow client to specify action (consider validating?)
        requestPath: headersList.get('x-request-path') || undefined,
        requestMethod: headersList.get('x-request-method') || undefined,
        requestBody: null, // DO NOT log requestBody provided by client payload
        responseStatus: rawData.responseStatus, // Allow client to provide status if needed
        responseTimeMs,
        user_agent: headersList.get('x-user-agent') || undefined,
        ip_address: headersList.get('x-ip-address') || '127.0.0.1'
      });
    } else {
      // This is a direct call to the audit log API
      const userAgent = headersList.get('user-agent') || '';
      const forwardedFor = headersList.get('x-forwarded-for');
      const realIp = headersList.get('x-real-ip');
      const ip = forwardedFor || realIp || '127.0.0.1';
      
      // Log with validated data from request (Direct Call Path)
      // Validate the incoming data against the schema
      const validationResult = ClientLogSchema.safeParse(rawData);

      if (!validationResult.success) {
        console.error('Invalid client log data:', validationResult.error);
        return NextResponse.json(
          { success: false, error: 'Invalid log data provided' },
          { status: 400 }
        );
      }
      
      const validatedData = validationResult.data;

      // Construct the log options carefully, only using validated fields
      const logOptions: AuditLogOptions = {
        profileUuid,
        type: validatedData.type,
        action: validatedData.action,
        logMessage: validatedData.logMessage,
        // SECURITY NOTE: Sanitize or strictly validate metadata if allowed from client
        metadata: validatedData.metadata,
        user_agent: userAgent,
        // Handle potential comma-separated IPs from x-forwarded-for
        ip_address: ip.includes(',') ? ip.split(',')[0].trim() : ip,
        // Explicitly set other fields to null/undefined as they are not provided/trusted from client
        requestPath: undefined,
        requestMethod: undefined,
        requestBody: null, 
        responseStatus: undefined,
        responseTimeMs: undefined,
        serverUuid: undefined,
        serverName: undefined,
        logLevel: undefined,
      };

      await logAuditEvent(logOptions);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging audit event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log audit event' },
      { status: 500 }
    );
  }
}
