import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import { oauthStateManager } from '../oauth/OAuthStateManager';
import { getSessionManager } from '../sessions/SessionManager';
import { escapeHtml, getSecurityHeaders } from '@/lib/security-utils';

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
   * and intercepts OAuth authorization flows
   */
  private createFetchWrapper(originalFetch?: typeof fetch) {
    const fetchImpl = originalFetch || fetch;
    
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Convert input to URL for analysis
      const requestUrl = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url);
      
      // Check if this is an OAuth authorization request
      if (this.isOAuthAuthorizationRequest(requestUrl)) {
        
        // Intercept and handle OAuth flow
        const modifiedResponse = await this.handleOAuthAuthorizationRequest(requestUrl, init);
        if (modifiedResponse) {
          return modifiedResponse;
        }
      }
      
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
        this.capturedSessionId = sessionId;

        // Store session in database for persistence
        try {
          // First check if this session already exists
          const existingSession = await this.sessionManager.getSession(sessionId);
          
          if (!existingSession) {
            // Create session with the specific ID from the server
            await this.sessionManager.createSession(this.serverUuid, this.profileUuid, sessionId);
          } else {
            // Update existing session's last activity
            await this.sessionManager.updateSession(sessionId, {
              last_activity: new Date(),
              session_data: {
                ...existingSession.session_data,
                last_used: new Date().toISOString(),
              },
            });
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

  /**
   * Check if a URL is an OAuth authorization request
   */
  private isOAuthAuthorizationRequest(url: URL): boolean {
    // Common OAuth authorization endpoints
    const authPaths = [
      '/oauth/authorize',
      '/oauth2/authorize',
      '/oauth2/auth',
      '/authorize',
      '/auth/authorize',
      '/connect/authorize',
    ];
    
    // Check if the URL path matches any OAuth authorization paths
    return authPaths.some(path => url.pathname.endsWith(path));
  }

  /**
   * Handle OAuth authorization request by intercepting and modifying the redirect URI
   */
  private async handleOAuthAuthorizationRequest(
    url: URL,
    init?: RequestInit
  ): Promise<Response | null> {
    try {
      // Try to extract the callback URL from the request
      const callbackUrl = await this.extractOAuthCallbackUrl(url, init);
      if (!callbackUrl) {
        console.warn(`[StreamableHTTPWrapper] Could not extract OAuth callback URL from request`);
        return null;
      }

      // Determine the OAuth provider from the URL
      const provider = this.determineOAuthProvider(url);
      
      // Create an OAuth session
      const state = await oauthStateManager.createOAuthSession(
        this.serverUuid,
        this.profileUuid,
        callbackUrl,
        provider
      );


      // Modify the authorization URL to use our proxy endpoint
      const modifiedUrl = new URL(url.toString());
      
      // Replace the redirect_uri parameter
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://staging.plugged.in/';
      const proxyRedirectUri = `${baseUrl}/api/mcp/oauth/callback`;
      
      modifiedUrl.searchParams.set('redirect_uri', proxyRedirectUri);
      modifiedUrl.searchParams.set('state', state);


      // Return a response that triggers the OAuth flow in the browser
      const safeUrl = escapeHtml(modifiedUrl.toString());
      const safeProvider = escapeHtml(provider);
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Authorization Required</title>
            <meta http-equiv="refresh" content="0; url=${safeUrl}">
          </head>
          <body>
            <p>Redirecting to ${safeProvider} for authorization...</p>
            <script>
              window.location.href = ${JSON.stringify(modifiedUrl.toString())};
            </script>
          </body>
        </html>
      `;

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          ...getSecurityHeaders()
        },
      });
      
    } catch (error) {
      console.error(`[StreamableHTTPWrapper] Error handling OAuth authorization:`, error);
      return null;
    }
  }

  /**
   * Extract OAuth callback URL from the request
   */
  private async extractOAuthCallbackUrl(
    url: URL,
    init?: RequestInit
  ): Promise<string | null> {
    // First, check URL parameters
    const redirectUri = url.searchParams.get('redirect_uri') || 
                       url.searchParams.get('callback_url') ||
                       url.searchParams.get('return_url');
    
    if (redirectUri) {
      return redirectUri;
    }

    // Check if it's a POST request with form data
    if (init?.method === 'POST' && init.body) {
      try {
        const bodyText = await this.getBodyText(init.body);
        const params = new URLSearchParams(bodyText);
        return params.get('redirect_uri') || 
               params.get('callback_url') || 
               params.get('return_url') || 
               null;
      } catch {
        // Ignore parsing errors
      }
    }

    // Default callback URL for known patterns
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      // This might be a local OAuth server created by mcp-remote
      return `http://localhost:14881/oauth/callback`;
    }

    return null;
  }

  /**
   * Convert body to text for parsing
   */
  private async getBodyText(body: BodyInit): Promise<string> {
    if (typeof body === 'string') {
      return body;
    }
    if (body instanceof URLSearchParams) {
      return body.toString();
    }
    if (body instanceof FormData) {
      const params = new URLSearchParams();
      body.forEach((value, key) => {
        if (typeof value === 'string') {
          params.append(key, value);
        }
      });
      return params.toString();
    }
    return '';
  }

  /**
   * Determine OAuth provider from URL
   */
  private determineOAuthProvider(url: URL): string {
    const hostname = url.hostname.toLowerCase();
    
    // Use exact domain matching or endsWith to prevent subdomain attacks
    if (hostname === 'linear.app' || hostname.endsWith('.linear.app')) return 'Linear';
    if (hostname === 'github.com' || hostname === 'www.github.com' || hostname.endsWith('.github.com')) return 'GitHub';
    if (hostname === 'google.com' || hostname.endsWith('.google.com')) return 'Google';
    if (hostname === 'slack.com' || hostname.endsWith('.slack.com')) return 'Slack';
    if (hostname === 'notion.so' || hostname.endsWith('.notion.so')) return 'Notion';
    if (hostname === 'microsoft.com' || hostname.endsWith('.microsoft.com') || 
        hostname === 'microsoftonline.com' || hostname.endsWith('.microsoftonline.com')) return 'Microsoft';
    
    // Extract provider from hostname
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
    }
    
    return 'OAuth Provider';
  }
}