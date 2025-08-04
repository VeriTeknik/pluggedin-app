/**
 * Secure WebSocket Server for Chat Monitoring
 * Implements multi-tenant isolation and EU compliance
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verify } from 'jsonwebtoken';
import { db } from '@/db';
import { users, projectsTable, embeddedChatsTable, chatConversationsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  projectUuid?: string;
  sessionId: string;
  permissions: Set<string>;
  subscribedConversations: Set<string>;
  lastActivity: Date;
}

interface WebSocketMessage {
  type: 'auth' | 'subscribe' | 'unsubscribe' | 'instruction' | 'takeover' | 'release' | 'ping' | 'consent';
  payload: any;
  messageId?: string;
}

interface ConsentData {
  hasConsent: boolean;
  consentedAt?: Date;
  ipAddress?: string;
  purposes: string[];
}

export class SecureChatWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<string, AuthenticatedWebSocket>;
  private conversationSubscribers: Map<string, Set<string>>;
  private rateLimiter: Map<string, number[]>;
  private readonly MAX_CONNECTIONS_PER_USER = 5;
  private readonly MAX_MESSAGES_PER_MINUTE = 60;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
  constructor(port: number = 8080) {
    this.wss = new WebSocketServer({ 
      port,
      // Enable per-message compression for efficiency
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
      }
    });
    
    this.connections = new Map();
    this.conversationSubscribers = new Map();
    this.rateLimiter = new Map();
    
    this.setupHandlers();
    this.startHeartbeat();
    this.startCleanup();
    
    console.log(`Secure WebSocket server started on port ${port}`);
  }
  
  private setupHandlers() {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      const sessionId = randomUUID();
      const authWs = ws as AuthenticatedWebSocket;
      authWs.sessionId = sessionId;
      authWs.subscribedConversations = new Set();
      authWs.permissions = new Set();
      authWs.lastActivity = new Date();
      
      // Extract IP for rate limiting and compliance
      const clientIp = this.getClientIp(req);
      
      // Initial auth timeout - client must authenticate within 10 seconds
      const authTimeout = setTimeout(() => {
        if (!authWs.userId) {
          ws.close(1008, 'Authentication timeout');
        }
      }, 10000);
      
      ws.on('message', async (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          
          // Rate limiting
          if (!this.checkRateLimit(clientIp)) {
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Rate limit exceeded',
              messageId: message.messageId
            }));
            return;
          }
          
          // Update activity
          authWs.lastActivity = new Date();
          
          // Handle message based on type
          await this.handleMessage(authWs, message, clientIp);
          
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });
      
      ws.on('close', () => {
        clearTimeout(authTimeout);
        this.handleDisconnect(authWs);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.handleDisconnect(authWs);
      });
      
      // Send initial connection success
      ws.send(JSON.stringify({
        type: 'connected',
        sessionId,
        requiresAuth: true,
        gdprNotice: 'This service processes chat data. Please provide consent before monitoring.'
      }));
    });
  }
  
  private async handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage, clientIp: string) {
    switch (message.type) {
      case 'auth':
        await this.handleAuth(ws, message.payload);
        break;
        
      case 'consent':
        await this.handleConsent(ws, message.payload, clientIp);
        break;
        
      case 'subscribe':
        if (!ws.userId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        await this.handleSubscribe(ws, message.payload);
        break;
        
      case 'unsubscribe':
        if (!ws.userId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        await this.handleUnsubscribe(ws, message.payload);
        break;
        
      case 'instruction':
        if (!ws.userId || !ws.permissions.has('send_instruction')) {
          ws.send(JSON.stringify({ type: 'error', error: 'Insufficient permissions' }));
          return;
        }
        await this.handleInstruction(ws, message.payload);
        break;
        
      case 'takeover':
        if (!ws.userId || !ws.permissions.has('takeover')) {
          ws.send(JSON.stringify({ type: 'error', error: 'Insufficient permissions' }));
          return;
        }
        await this.handleTakeover(ws, message.payload);
        break;
        
      case 'release':
        if (!ws.userId || !ws.permissions.has('release')) {
          ws.send(JSON.stringify({ type: 'error', error: 'Insufficient permissions' }));
          return;
        }
        await this.handleRelease(ws, message.payload);
        break;
        
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
        
      default:
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Unknown message type',
          messageId: message.messageId 
        }));
    }
  }
  
  private async handleAuth(ws: AuthenticatedWebSocket, payload: any) {
    try {
      const { token } = payload;
      
      if (!token) {
        ws.send(JSON.stringify({ type: 'error', error: 'No token provided' }));
        ws.close(1008, 'No token provided');
        return;
      }
      
      // Verify JWT token
      const decoded = verify(token, process.env.NEXTAUTH_SECRET!) as any;
      
      if (!decoded.sub) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid token' }));
        ws.close(1008, 'Invalid token');
        return;
      }
      
      // Check if user exists and is active
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, decoded.sub))
        .limit(1);
      
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', error: 'User not found' }));
        ws.close(1008, 'User not found');
        return;
      }
      
      // Check connection limit per user
      const userConnections = Array.from(this.connections.values())
        .filter(conn => conn.userId === decoded.sub);
      
      if (userConnections.length >= this.MAX_CONNECTIONS_PER_USER) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Maximum connections exceeded',
          limit: this.MAX_CONNECTIONS_PER_USER 
        }));
        ws.close(1008, 'Connection limit exceeded');
        return;
      }
      
      // Set user data
      ws.userId = decoded.sub;
      
      // Load user permissions based on their projects
      const permissions = await this.loadUserPermissions(ws.userId);
      ws.permissions = permissions;
      
      // Store connection
      this.connections.set(ws.sessionId, ws);
      
      // Send auth success
      ws.send(JSON.stringify({
        type: 'auth_success',
        userId: ws.userId,
        permissions: Array.from(permissions),
        sessionId: ws.sessionId
      }));
      
    } catch (error) {
      console.error('Auth error:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed' }));
      ws.close(1008, 'Authentication failed');
    }
  }
  
  private async handleConsent(ws: AuthenticatedWebSocket, payload: any, clientIp: string) {
    const { consent, purposes } = payload;
    
    if (!consent) {
      ws.send(JSON.stringify({ 
        type: 'consent_required',
        message: 'Consent is required to monitor chat conversations per GDPR regulations'
      }));
      return;
    }
    
    // Store consent data (in production, this should be in database)
    const consentData: ConsentData = {
      hasConsent: true,
      consentedAt: new Date(),
      ipAddress: clientIp,
      purposes: purposes || ['monitoring', 'support', 'quality']
    };
    
    // In production, store this in database
    // await db.insert(userConsentsTable).values({...})
    
    ws.send(JSON.stringify({
      type: 'consent_recorded',
      consentData
    }));
  }
  
  private async handleSubscribe(ws: AuthenticatedWebSocket, payload: any) {
    const { conversationId } = payload;
    
    if (!conversationId) {
      ws.send(JSON.stringify({ type: 'error', error: 'No conversation ID provided' }));
      return;
    }
    
    // Verify user has access to this conversation
    const hasAccess = await this.verifyConversationAccess(ws.userId, conversationId);
    
    if (!hasAccess) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Access denied to conversation',
        conversationId 
      }));
      return;
    }
    
    // Add to subscribers
    ws.subscribedConversations.add(conversationId);
    
    if (!this.conversationSubscribers.has(conversationId)) {
      this.conversationSubscribers.set(conversationId, new Set());
    }
    this.conversationSubscribers.get(conversationId)!.add(ws.sessionId);
    
    ws.send(JSON.stringify({
      type: 'subscribed',
      conversationId
    }));
    
    // Send initial conversation state
    await this.sendConversationState(ws, conversationId);
  }
  
  private async handleUnsubscribe(ws: AuthenticatedWebSocket, payload: any) {
    const { conversationId } = payload;
    
    ws.subscribedConversations.delete(conversationId);
    
    const subscribers = this.conversationSubscribers.get(conversationId);
    if (subscribers) {
      subscribers.delete(ws.sessionId);
      if (subscribers.size === 0) {
        this.conversationSubscribers.delete(conversationId);
      }
    }
    
    ws.send(JSON.stringify({
      type: 'unsubscribed',
      conversationId
    }));
  }
  
  private async handleInstruction(ws: AuthenticatedWebSocket, payload: any) {
    const { conversationId, instruction } = payload;
    
    // Verify access
    if (!ws.subscribedConversations.has(conversationId)) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Not subscribed to conversation' 
      }));
      return;
    }
    
    // Broadcast instruction to all subscribers
    this.broadcastToConversation(conversationId, {
      type: 'instruction',
      conversationId,
      instruction,
      sentBy: ws.userId,
      timestamp: new Date()
    }, ws.sessionId);
    
    // TODO: Store instruction in database and apply to chat engine
  }
  
  private async handleTakeover(ws: AuthenticatedWebSocket, payload: any) {
    const { conversationId } = payload;
    
    // Update conversation status in database
    await db
      .update(chatConversationsTable)
      .set({
        status: 'human_controlled',
        assigned_user_id: ws.userId,
        assigned_at: new Date(),
        takeover_at: new Date()
      })
      .where(eq(chatConversationsTable.uuid, conversationId));
    
    // Broadcast takeover event
    this.broadcastToConversation(conversationId, {
      type: 'takeover',
      conversationId,
      takenBy: ws.userId,
      timestamp: new Date()
    });
  }
  
  private async handleRelease(ws: AuthenticatedWebSocket, payload: any) {
    const { conversationId } = payload;
    
    // Update conversation status
    await db
      .update(chatConversationsTable)
      .set({
        status: 'active',
        assigned_user_id: null,
        assigned_at: null
      })
      .where(eq(chatConversationsTable.uuid, conversationId));
    
    // Broadcast release event
    this.broadcastToConversation(conversationId, {
      type: 'released',
      conversationId,
      releasedBy: ws.userId,
      timestamp: new Date()
    });
  }
  
  private handleDisconnect(ws: AuthenticatedWebSocket) {
    // Remove from all conversation subscribers
    ws.subscribedConversations.forEach(conversationId => {
      const subscribers = this.conversationSubscribers.get(conversationId);
      if (subscribers) {
        subscribers.delete(ws.sessionId);
        if (subscribers.size === 0) {
          this.conversationSubscribers.delete(conversationId);
        }
      }
    });
    
    // Remove connection
    this.connections.delete(ws.sessionId);
    
    console.log(`WebSocket disconnected: ${ws.sessionId}`);
  }
  
  private broadcastToConversation(conversationId: string, data: any, excludeSessionId?: string) {
    const subscribers = this.conversationSubscribers.get(conversationId);
    if (!subscribers) return;
    
    const message = JSON.stringify(data);
    
    subscribers.forEach(sessionId => {
      if (sessionId === excludeSessionId) return;
      
      const connection = this.connections.get(sessionId);
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(message);
      }
    });
  }
  
  public broadcastMessage(conversationId: string, message: any) {
    this.broadcastToConversation(conversationId, message);
  }
  
  private async loadUserPermissions(userId: string): Promise<Set<string>> {
    const permissions = new Set<string>();
    
    // Check if user owns any projects with embedded chat
    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, userId))
      .limit(10);
    
    if (projects.length > 0) {
      // Owner permissions
      permissions.add('monitor');
      permissions.add('send_instruction');
      permissions.add('takeover');
      permissions.add('release');
      permissions.add('view_analytics');
    }
    
    // Additional role-based permissions could be added here
    
    return permissions;
  }
  
  private async verifyConversationAccess(userId: string, conversationId: string): Promise<boolean> {
    // Check if user owns the embedded chat that this conversation belongs to
    const result = await db
      .select()
      .from(chatConversationsTable)
      .innerJoin(embeddedChatsTable, eq(chatConversationsTable.embedded_chat_uuid, embeddedChatsTable.uuid))
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(projectsTable.user_id, userId)
      ))
      .limit(1);
    
    return result.length > 0;
  }
  
  private async sendConversationState(ws: AuthenticatedWebSocket, conversationId: string) {
    // Get conversation details
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (conversation) {
      ws.send(JSON.stringify({
        type: 'conversation_state',
        conversation
      }));
    }
  }
  
  private getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }
  
  private checkRateLimit(clientIp: string): boolean {
    const now = Date.now();
    const timestamps = this.rateLimiter.get(clientIp) || [];
    
    // Remove timestamps older than 1 minute
    const recentTimestamps = timestamps.filter(t => now - t < 60000);
    
    if (recentTimestamps.length >= this.MAX_MESSAGES_PER_MINUTE) {
      return false;
    }
    
    recentTimestamps.push(now);
    this.rateLimiter.set(clientIp, recentTimestamps);
    
    return true;
  }
  
  private startHeartbeat() {
    // Send heartbeat to all connections every 30 seconds
    setInterval(() => {
      const message = JSON.stringify({ type: 'heartbeat', timestamp: Date.now() });
      
      this.connections.forEach((ws, sessionId) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        } else {
          // Clean up dead connections
          this.handleDisconnect(ws);
        }
      });
    }, 30000);
  }
  
  private startCleanup() {
    // Clean up idle connections every minute
    setInterval(() => {
      const now = Date.now();
      
      this.connections.forEach((ws, sessionId) => {
        const idleTime = now - ws.lastActivity.getTime();
        
        if (idleTime > this.IDLE_TIMEOUT_MS) {
          ws.send(JSON.stringify({ 
            type: 'idle_timeout',
            message: 'Connection closed due to inactivity'
          }));
          ws.close(1000, 'Idle timeout');
          this.handleDisconnect(ws);
        }
      });
      
      // Clean up rate limiter
      this.rateLimiter.forEach((timestamps, ip) => {
        const recentTimestamps = timestamps.filter(t => now - t < 60000);
        if (recentTimestamps.length === 0) {
          this.rateLimiter.delete(ip);
        } else {
          this.rateLimiter.set(ip, recentTimestamps);
        }
      });
    }, 60000);
  }
  
  public shutdown() {
    // Gracefully close all connections
    this.connections.forEach(ws => {
      ws.send(JSON.stringify({ 
        type: 'server_shutdown',
        message: 'Server is shutting down'
      }));
      ws.close(1001, 'Server shutdown');
    });
    
    this.wss.close();
    console.log('WebSocket server shut down');
  }
}

// Export singleton instance
let wsServer: SecureChatWebSocketServer | null = null;

export function getWebSocketServer(): SecureChatWebSocketServer {
  if (!wsServer) {
    const port = parseInt(process.env.WEBSOCKET_PORT || '8080');
    wsServer = new SecureChatWebSocketServer(port);
  }
  return wsServer;
}