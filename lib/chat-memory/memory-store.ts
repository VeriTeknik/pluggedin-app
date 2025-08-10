import { db } from '@/db';
import { conversationMemoriesTable, userMemoriesTable } from '@/db/schema';
import { eq, and, desc, sql, inArray, or, gte } from 'drizzle-orm';
import { StructuredMemoryExtractor, ExtractedMemory, MemoryExtractionResult } from './structured-extractor';
import { detectArtifacts } from './artifact-detector';
import { memoryGate } from './memory-gate';
import * as crypto from 'crypto';

export interface MemoryStoreConfig {
  maxConversationMemories?: number;
  maxUserMemories?: number;
  minImportanceThreshold?: number;
  deduplicationThreshold?: number;
  ttlDays?: number;
  openAiApiKey?: string;
}

export interface StoredMemory {
  id: number;
  content: string;
  factType: string;
  importance: number;
  confidence: number;
  salience: number;
  hash: string;
  metadata: any;
  createdAt: Date;
  lastAccessedAt: Date;
}

export class MemoryStore {
  private extractor: StructuredMemoryExtractor;
  private config: Required<MemoryStoreConfig>;
  
  constructor(config: MemoryStoreConfig = {}) {
    this.config = {
      maxConversationMemories: config.maxConversationMemories || 100,
      maxUserMemories: config.maxUserMemories || 500,
      minImportanceThreshold: config.minImportanceThreshold || 3,
      deduplicationThreshold: config.deduplicationThreshold || 0.85,
      ttlDays: config.ttlDays || 90,
      openAiApiKey: config.openAiApiKey || process.env.OPENAI_API_KEY!
    };
    
    this.extractor = new StructuredMemoryExtractor(this.config.openAiApiKey);
  }
  
  /**
   * Process and store memories from a conversation
   */
  async processConversation(
    conversationId: string,
    userId: string,
    messages: Array<{ role: string; content: string }>,
    language?: string
  ): Promise<{
    conversationMemories: number;
    userMemories: number;
    extracted: MemoryExtractionResult;
  }> {
    try {
      // Step 1: Quick artifact detection on the latest message
      const latestMessage = messages[messages.length - 1];
      const artifactResult = detectArtifacts(latestMessage.content);
      
      // Step 2: Check if conversation is worth processing with the gate
      const gateDecision = await memoryGate(
        {
          conversationSummary: '',
          userMessage: messages.find(m => m.role === 'user')?.content || '',
          assistantMessage: messages.find(m => m.role === 'assistant')?.content || ''
        },
        {
          mode: 'llm',
          anthropicApiKey: this.config.openAiApiKey
        }
      );
      
      const shouldProcess = gateDecision.remember;
      
      if (!shouldProcess) {
        return {
          conversationMemories: 0,
          userMemories: 0,
          extracted: { memories: [] }
        };
      }
      
      // Step 3: Get existing memories to check for duplicates
      const existingMemories = await this.getRecentMemories(userId, conversationId, 50);
      
      // Step 4: Extract structured memories
      const extracted = await this.extractor.extractMemories(messages, {
        userId,
        conversationId,
        language,
        existingMemories: existingMemories.map(m => ({
          content: m.content,
          hash: m.hash
        }))
      });
      
      if (extracted.memories.length === 0) {
        return {
          conversationMemories: 0,
          userMemories: 0,
          extracted
        };
      }
      
      // Step 5: Calculate salience scores and filter
      const memoriesWithSalience = extracted.memories
        .map(memory => ({
          ...memory,
          salience: this.extractor.calculateSalience(memory)
        }))
        .filter(m => m.importance >= this.config.minImportanceThreshold);
      
      // Step 6: Store conversation memories
      const conversationMemories = await this.storeConversationMemories(
        conversationId,
        userId,
        memoriesWithSalience,
        extracted
      );
      
      // Step 7: Promote important memories to user level
      const userMemories = await this.promoteToUserMemories(
        userId,
        memoriesWithSalience.filter(m => m.importance >= 7)
      );
      
      return {
        conversationMemories: conversationMemories.length,
        userMemories: userMemories.length,
        extracted
      };
      
    } catch (error) {
      console.error('Failed to process conversation memories:', error);
      return {
        conversationMemories: 0,
        userMemories: 0,
        extracted: { memories: [] }
      };
    }
  }
  
  /**
   * Store memories at the conversation level
   */
  private async storeConversationMemories(
    conversationId: string,
    userId: string,
    memories: Array<ExtractedMemory & { salience: number }>,
    extraction: MemoryExtractionResult
  ): Promise<any[]> {
    const stored = [];
    
    for (const memory of memories) {
      try {
        const record = await db.insert(conversationMemoriesTable).values({
          conversationId,
          userId,
          content: memory.content,
          factType: memory.factType,
          importance: memory.importance,
          confidence: memory.confidence,
          salience: memory.salience,
          temporality: memory.temporality,
          hash: memory.hash || this.generateHash(memory.content),
          metadata: {
            subject: memory.subject,
            entities: memory.entities,
            relatedTopics: memory.relatedTopics,
            sourceContext: memory.sourceContext,
            expiresAt: memory.expiresAt,
            conversationSummary: extraction.conversationSummary,
            userIntent: extraction.userIntent,
            emotionalTone: extraction.emotionalTone
          }
        }).returning();
        
        stored.push(record[0]);
      } catch (error: any) {
        // Handle duplicate key errors gracefully
        if (error.code === '23505') {
          console.log(`Duplicate memory skipped: ${memory.hash}`);
        } else {
          console.error('Failed to store conversation memory:', error);
        }
      }
    }
    
    // Enforce max memories per conversation
    await this.pruneConversationMemories(conversationId);
    
    return stored;
  }
  
  /**
   * Promote important memories to user level
   */
  private async promoteToUserMemories(
    userId: string,
    memories: Array<ExtractedMemory & { salience: number }>
  ): Promise<any[]> {
    const promoted = [];
    
    for (const memory of memories) {
      try {
        // Check if similar memory already exists at user level
        const existing = await db.query.userMemoriesTable.findFirst({
          where: and(
            eq(userMemoriesTable.userId, userId),
            eq(userMemoriesTable.hash, memory.hash || this.generateHash(memory.content))
          )
        });
        
        if (existing) {
          // Update access count and timestamp
          await db.update(userMemoriesTable)
            .set({
              accessCount: sql`${userMemoriesTable.accessCount} + 1`,
              lastAccessedAt: new Date(),
              importance: Math.max(existing.importance, memory.importance),
              confidence: Math.max(existing.confidence, memory.confidence)
            })
            .where(eq(userMemoriesTable.id, existing.id));
          
          promoted.push(existing);
        } else {
          // Create new user memory
          const record = await db.insert(userMemoriesTable).values({
            userId,
            content: memory.content,
            factType: memory.factType,
            importance: memory.importance,
            confidence: memory.confidence,
            salience: memory.salience,
            temporality: memory.temporality,
            hash: memory.hash || this.generateHash(memory.content),
            metadata: {
              subject: memory.subject,
              entities: memory.entities,
              relatedTopics: memory.relatedTopics,
              sourceContext: memory.sourceContext,
              expiresAt: memory.expiresAt
            },
            accessCount: 1
          }).returning();
          
          promoted.push(record[0]);
        }
      } catch (error) {
        console.error('Failed to promote memory to user level:', error);
      }
    }
    
    // Enforce max memories per user
    await this.pruneUserMemories(userId);
    
    return promoted;
  }
  
  /**
   * Get relevant memories for context injection
   */
  async getRelevantMemories(
    userId: string,
    conversationId: string,
    currentMessage: string,
    maxMemories: number = 15
  ): Promise<StoredMemory[]> {
    try {
      // Get recent conversation memories
      const conversationMemories = await db.query.conversationMemoriesTable.findMany({
        where: eq(conversationMemoriesTable.conversationId, conversationId),
        orderBy: [desc(conversationMemoriesTable.salience)],
        limit: Math.floor(maxMemories * 0.6) // 60% from conversation
      });
      
      // Get important user memories
      const userMemories = await db.query.userMemoriesTable.findMany({
        where: eq(userMemoriesTable.userId, userId),
        orderBy: [desc(userMemoriesTable.salience)],
        limit: Math.floor(maxMemories * 0.4) // 40% from user level
      });
      
      // Combine and filter based on relevance to current message
      const allMemories = [
        ...conversationMemories.map(m => ({
          ...m,
          source: 'conversation' as const
        })),
        ...userMemories.map(m => ({
          ...m,
          source: 'user' as const
        }))
      ];
      
      // Use the extractor to rank by relevance
      const memoryObjects = allMemories.map(m => ({
        factType: m.factType as any,
        content: m.content,
        subject: m.metadata?.subject,
        importance: m.importance,
        confidence: m.confidence,
        temporality: m.temporality as any,
        entities: m.metadata?.entities,
        relatedTopics: m.metadata?.relatedTopics,
        expiresAt: m.metadata?.expiresAt,
        sourceContext: m.metadata?.sourceContext
      }));
      
      const relevant = this.extractor.filterRelevantMemories(
        memoryObjects,
        currentMessage,
        maxMemories
      );
      
      // Map back to stored memories
      const relevantHashes = new Set(relevant.map(r => this.generateHash(r.content)));
      
      const result = allMemories
        .filter(m => relevantHashes.has(m.hash))
        .map(m => ({
          id: m.id,
          content: m.content,
          factType: m.factType,
          importance: m.importance,
          confidence: m.confidence,
          salience: m.salience,
          hash: m.hash,
          metadata: m.metadata,
          createdAt: m.createdAt,
          lastAccessedAt: m.lastAccessedAt || m.createdAt
        }));
      
      // Update access timestamps
      const conversationIds = result
        .filter(m => (m as any).source === 'conversation')
        .map(m => m.id);
      
      const userIds = result
        .filter(m => (m as any).source === 'user')
        .map(m => m.id);
      
      if (conversationIds.length > 0) {
        await db.update(conversationMemoriesTable)
          .set({ lastAccessedAt: new Date() })
          .where(inArray(conversationMemoriesTable.id, conversationIds));
      }
      
      if (userIds.length > 0) {
        await db.update(userMemoriesTable)
          .set({ 
            lastAccessedAt: new Date(),
            accessCount: sql`${userMemoriesTable.accessCount} + 1`
          })
          .where(inArray(userMemoriesTable.id, userIds));
      }
      
      return result;
      
    } catch (error) {
      console.error('Failed to get relevant memories:', error);
      return [];
    }
  }
  
  /**
   * Get recent memories for deduplication
   */
  private async getRecentMemories(
    userId: string,
    conversationId: string,
    limit: number = 50
  ): Promise<Array<{ content: string; hash: string }>> {
    try {
      const [conversationMems, userMems] = await Promise.all([
        db.query.conversationMemoriesTable.findMany({
          where: eq(conversationMemoriesTable.conversationId, conversationId),
          orderBy: [desc(conversationMemoriesTable.createdAt)],
          limit: limit / 2,
          columns: { content: true, hash: true }
        }),
        db.query.userMemoriesTable.findMany({
          where: eq(userMemoriesTable.userId, userId),
          orderBy: [desc(userMemoriesTable.createdAt)],
          limit: limit / 2,
          columns: { content: true, hash: true }
        })
      ]);
      
      return [...conversationMems, ...userMems];
    } catch (error) {
      console.error('Failed to get recent memories:', error);
      return [];
    }
  }
  
  /**
   * Prune old conversation memories
   */
  private async pruneConversationMemories(conversationId: string): Promise<void> {
    try {
      // Get current count
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationMemoriesTable)
        .where(eq(conversationMemoriesTable.conversationId, conversationId));
      
      const currentCount = Number(count[0]?.count || 0);
      
      if (currentCount > this.config.maxConversationMemories) {
        // Delete oldest, least important memories
        const toDelete = currentCount - this.config.maxConversationMemories;
        
        const oldMemories = await db.query.conversationMemoriesTable.findMany({
          where: eq(conversationMemoriesTable.conversationId, conversationId),
          orderBy: [
            sql`${conversationMemoriesTable.importance} ASC`,
            sql`${conversationMemoriesTable.lastAccessedAt} ASC NULLS FIRST`,
            sql`${conversationMemoriesTable.createdAt} ASC`
          ],
          limit: toDelete,
          columns: { id: true }
        });
        
        if (oldMemories.length > 0) {
          await db.delete(conversationMemoriesTable)
            .where(inArray(conversationMemoriesTable.id, oldMemories.map(m => m.id)));
        }
      }
      
      // Also delete expired memories
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.ttlDays);
      
      await db.delete(conversationMemoriesTable)
        .where(and(
          eq(conversationMemoriesTable.conversationId, conversationId),
          or(
            sql`${conversationMemoriesTable.metadata}->>'expiresAt' < ${new Date().toISOString()}`,
            and(
              eq(conversationMemoriesTable.temporality, 'temporary'),
              sql`${conversationMemoriesTable.createdAt} < ${cutoffDate}`
            )
          )
        ));
        
    } catch (error) {
      console.error('Failed to prune conversation memories:', error);
    }
  }
  
  /**
   * Prune old user memories
   */
  private async pruneUserMemories(userId: string): Promise<void> {
    try {
      // Get current count
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.userId, userId));
      
      const currentCount = Number(count[0]?.count || 0);
      
      if (currentCount > this.config.maxUserMemories) {
        // Delete oldest, least accessed, least important memories
        const toDelete = currentCount - this.config.maxUserMemories;
        
        const oldMemories = await db.query.userMemoriesTable.findMany({
          where: eq(userMemoriesTable.userId, userId),
          orderBy: [
            sql`${userMemoriesTable.accessCount} ASC`,
            sql`${userMemoriesTable.importance} ASC`,
            sql`${userMemoriesTable.lastAccessedAt} ASC NULLS FIRST`,
            sql`${userMemoriesTable.createdAt} ASC`
          ],
          limit: toDelete,
          columns: { id: true }
        });
        
        if (oldMemories.length > 0) {
          await db.delete(userMemoriesTable)
            .where(inArray(userMemoriesTable.id, oldMemories.map(m => m.id)));
        }
      }
      
      // Delete expired memories
      await db.delete(userMemoriesTable)
        .where(and(
          eq(userMemoriesTable.userId, userId),
          sql`${userMemoriesTable.metadata}->>'expiresAt' < ${new Date().toISOString()}`
        ));
        
    } catch (error) {
      console.error('Failed to prune user memories:', error);
    }
  }
  
  /**
   * Generate hash for content
   */
  private generateHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);
  }
  
  /**
   * Clear all memories for a user (for privacy/GDPR)
   */
  async clearUserMemories(userId: string): Promise<void> {
    try {
      await Promise.all([
        db.delete(conversationMemoriesTable)
          .where(eq(conversationMemoriesTable.userId, userId)),
        db.delete(userMemoriesTable)
          .where(eq(userMemoriesTable.userId, userId))
      ]);
    } catch (error) {
      console.error('Failed to clear user memories:', error);
      throw error;
    }
  }
  
  /**
   * Get memory statistics for a user
   */
  async getMemoryStats(userId: string): Promise<{
    totalConversationMemories: number;
    totalUserMemories: number;
    topFactTypes: Array<{ type: string; count: number }>;
    averageImportance: number;
    oldestMemory: Date | null;
    mostAccessedMemory: string | null;
  }> {
    try {
      const [convCount, userCount, userMemories] = await Promise.all([
        db.select({ count: sql<number>`count(*)` })
          .from(conversationMemoriesTable)
          .where(eq(conversationMemoriesTable.userId, userId)),
        
        db.select({ count: sql<number>`count(*)` })
          .from(userMemoriesTable)
          .where(eq(userMemoriesTable.userId, userId)),
        
        db.query.userMemoriesTable.findMany({
          where: eq(userMemoriesTable.userId, userId),
          orderBy: [desc(userMemoriesTable.accessCount)],
          limit: 1
        })
      ]);
      
      // Get fact type distribution
      const factTypes = await db
        .select({
          type: userMemoriesTable.factType,
          count: sql<number>`count(*)`
        })
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.userId, userId))
        .groupBy(userMemoriesTable.factType)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      
      // Get average importance
      const avgImportance = await db
        .select({
          avg: sql<number>`avg(${userMemoriesTable.importance})`
        })
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.userId, userId));
      
      // Get oldest memory
      const oldest = await db.query.userMemoriesTable.findFirst({
        where: eq(userMemoriesTable.userId, userId),
        orderBy: [conversationMemoriesTable.createdAt],
        columns: { createdAt: true }
      });
      
      return {
        totalConversationMemories: Number(convCount[0]?.count || 0),
        totalUserMemories: Number(userCount[0]?.count || 0),
        topFactTypes: factTypes.map(ft => ({
          type: ft.type,
          count: Number(ft.count)
        })),
        averageImportance: Number(avgImportance[0]?.avg || 0),
        oldestMemory: oldest?.createdAt || null,
        mostAccessedMemory: userMemories[0]?.content || null
      };
      
    } catch (error) {
      console.error('Failed to get memory stats:', error);
      return {
        totalConversationMemories: 0,
        totalUserMemories: 0,
        topFactTypes: [],
        averageImportance: 0,
        oldestMemory: null,
        mostAccessedMemory: null
      };
    }
  }
}