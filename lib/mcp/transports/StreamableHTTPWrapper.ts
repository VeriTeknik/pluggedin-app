import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { getSessionManager } from '../sessions/SessionManager';

/**
 * Wrapper for StreamableHTTPClientTransport that captures and manages session IDs
 * This addresses the CORS issue where servers return Mcp-Session-Id in response headers
 */
export class StreamableHTTPWrapper implements Transport {
  private transport: StreamableHTTPClientTransport;
  private serverUuid: string;
  private profileUuid: string;
  private sessionManager = getSessionManager();
  private capturedSessionId: string | null = null;

  // Event handlers from Transport interface
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;

  constructor(
    url: URL,
    options: any,
    serverUuid: string,
    profileUuid: string,
    initialSessionId: string | null = null
  ) {
    this.serverUuid = serverUuid;
    this.profileUuid = profileUuid;
    this.capturedSessionId = initialSessionId;

    // Create the underlying transport with our fetch wrapper
    this.transport = new StreamableHTTPClientTransport(url, {
      ...options,
      // Add response interceptor to capture session ID
      fetchImplementation: this.createFetchWrapper(options.fetchImplementation),
    });

    // Forward events from the wrapped transport
    this.transport.onclose = () => this.onclose?.();
    this.transport.onerror = (error: Error) => this.onerror?.(error);
    this.transport.onmessage = (message: any) => this.onmessage?.(message);
  }

  /**
   * Factory method to create wrapper with session initialization
   */
  static async create(
    url: URL,
    options: any,
    serverUuid: string,
    profileUuid: string
  ): Promise<StreamableHTTPWrapper> {
    let initialSessionId: string | null = null;

    // First check if session ID was provided in options
    if (options.sessionId) {
      console.log(`[StreamableHTTPWrapper] Using provided session ID: ${options.sessionId}`);
      initialSessionId = options.sessionId;
    } else {
      // Try to load existing session from database
      try {
        const sessionManager = getSessionManager();
        const existingSession = await sessionManager.getLatestSession(
          serverUuid,
          profileUuid
        );

        if (existingSession) {
          console.log(`[StreamableHTTPWrapper] Restored session ID from database: ${existingSession.id}`);
          initialSessionId = existingSession.id;
        }
      } catch (error) {
        console.error(`[StreamableHTTPWrapper] Failed to load existing session:`, error);
      }
    }

    return new StreamableHTTPWrapper(url, options, serverUuid, profileUuid, initialSessionId);
  }

  /**
   * Creates a fetch wrapper that captures the Mcp-Session-Id header from responses
   */
  private createFetchWrapper(originalFetch?: typeof fetch) {
    const fetchImpl = originalFetch || fetch;
    
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // If we have a captured session ID, add it to the request headers
      if (this.capturedSessionId) {
        const headers = new Headers(init?.headers);
        headers.set('Mcp-Session-Id', this.capturedSessionId);
        init = {
          ...init,
          headers,
        };
      }

      // Make the request
      const response = await fetchImpl(input, init);

      // Check if the response has the Mcp-Session-Id header
      const sessionId = response.headers.get('Mcp-Session-Id');
      if (sessionId && sessionId !== this.capturedSessionId) {
        console.log(`[StreamableHTTPWrapper] Captured session ID for server ${this.serverUuid}: ${sessionId}`);
        this.capturedSessionId = sessionId;

        // Store session in database for persistence
        try {
          // First check if this session already exists
          const existingSession = await this.sessionManager.getSession(sessionId);
          
          if (!existingSession) {
            // Create session with the specific ID from the server
            await this.sessionManager.createSession(this.serverUuid, this.profileUuid, sessionId);
            console.log(`[StreamableHTTPWrapper] Stored new session ID in database: ${sessionId}`);
          } else {
            // Update existing session's last activity
            await this.sessionManager.updateSession(sessionId, {
              last_activity: new Date(),
              session_data: {
                ...existingSession.session_data,
                last_used: new Date().toISOString(),
              },
            });
            console.log(`[StreamableHTTPWrapper] Updated existing session activity: ${sessionId}`);
          }
        } catch (error) {
          console.error(`[StreamableHTTPWrapper] Failed to store session ID:`, error);
        }
      }

      // Check for CORS errors related to session ID access
      // If the server returns 400 Bad Request with specific error about session ID,
      // it might indicate CORS configuration issues
      if (response.status === 400) {
        try {
          const clonedResponse = response.clone();
          const body = await clonedResponse.text();
          if (body.includes('session') || body.includes('Session-Id')) {
            console.warn(
              `[StreamableHTTPWrapper] Possible CORS issue detected. ` +
              `Server may need to expose 'Mcp-Session-Id' header via Access-Control-Expose-Headers. ` +
              `Response: ${body}`
            );
          }
        } catch {
          // Ignore errors when trying to read response body
        }
      }

      return response;
    };
  }

  // Implement Transport interface by delegating to wrapped transport
  async start(): Promise<void> {
    return this.transport.start();
  }

  async send(message: any): Promise<void> {
    return this.transport.send(message);
  }

  async close(): Promise<void> {
    return this.transport.close();
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.capturedSessionId;
  }
}