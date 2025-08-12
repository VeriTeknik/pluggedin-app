import * as crypto from 'crypto';
import { db } from '@/db';
import { conversationMemoriesTable, userMemoriesTable } from '@/db/schema';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import { StructuredMemoryExtractor, ExtractedMemory, MemoryExtractionResult } from './structured-extractor';
import { detectArtifacts } from './artifact-detector';
import { memoryGate } from './memory-gate';
import { normalizeUserId, formatUserIdForDisplay } from './id-utils';
import {
  logMemoryDebug,
  logMemoryInfo,
  logStorageError,
  withMemoryErrorLogging
} from './error-logger';

export interface MemoryStoreConfig {
  maxConversationMemories?: number;
  maxUserMemories?: number;
  minImportanceThreshold?: number;
  deduplicationThreshold?: number;
  ttlDays?: number;
  openAiApiKey?: string;
}

export interface StoredMemory {
  id: string;
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

  private isUuid(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
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
    // Normalize user ID for database operations
    const normalizedUserId = normalizeUserId(userId);
    const displayUserId = formatUserIdForDisplay(userId);
    
    return await withMemoryErrorLogging('storage', 'MemoryStore.processConversation', async () => {
      // Step 1: Quick artifact detection on the latest message
      const latestMessage = messages[messages.length - 1];
      const artifactResult = detectArtifacts(latestMessage.content);
      
      // Step 1a: Quick identity capture (e.g., "my name is ...") to ensure name is remembered
      try {
        const nameMatch = /\bmy\s+name\s+is\s+([^.!?\n]{1,60})/i.exec(latestMessage.content);
        if (nameMatch && nameMatch[1]) {
          const extractedName = nameMatch[1].trim();
          const content = `User name is ${extractedName}`;
          // Store at user level for all users (authenticated and visitors)
          const existing = await db.query.userMemoriesTable.findFirst({
            where: and(
              eq(userMemoriesTable.owner_id, normalizedUserId as any),
              eq(userMemoriesTable.novelty_hash, this.generateHash(content))
            )
          });
          if (!existing) {
            await db.insert(userMemoriesTable).values({
              owner_id: normalizedUserId as any,
              kind: 'profile',
              value_jsonb: {
                content,
                factType: 'profile',
                importance: 9,
                confidence: 0.95,
                temporality: 'persistent',
                subject: 'identity',
                entities: [{ type: 'person', name: extractedName }],
                relatedTopics: ['name']
              },
              salience: 9,
              novelty_hash: this.generateHash(content),
              source: 'user',
              language_code: language || 'en'
            });
          }
        }
      } catch (e) {
        // Ignore errors for quick name capture
      }
      
      // Step 2: Check if conversation is worth processing with the gate
      const gateDecision = await withMemoryErrorLogging('gate', 'MemoryStore.processConversation', async () => {
        return await memoryGate(
          {
            conversationSummary: '',
            userMessage: messages.find(m => m.role === 'user')?.content || '',
            assistantMessage: messages.find(m => m.role === 'assistant')?.content || ''
          },
          {
            mode: 'embedding'
          }
        );
      }, { conversationId, userId });
      
      const shouldProcess = gateDecision.remember;
      
      if (!shouldProcess) {
        await logMemoryDebug('MemoryStore.processConversation', 'Conversation gated - not worth processing', {
          gateDecision,
          conversationId,
          userId: displayUserId
        }, conversationId, userId);
        
        return {
          conversationMemories: 0,
          userMemories: 0,
          extracted: { memories: [] }
        };
      }
      
      // Step 3: Get existing memories to check for duplicates
      const existingMemories = await this.getRecentMemories(normalizedUserId, conversationId, 50);
      
      // Step 4: Extract structured memories
      const extracted = await withMemoryErrorLogging('extraction', 'MemoryStore.processConversation', async () => {
        return await this.extractor.extractMemories(messages, {
          userId,
          conversationId,
          language,
          existingMemories: existingMemories.map(m => ({
            content: m.content,
            hash: m.hash
          }))
        });
      }, { conversationId, userId });
      
      if (extracted.memories.length === 0) {
        await logMemoryDebug('MemoryStore.processConversation', 'No memories extracted', {
          conversationId,
          userId,
          messageCount: messages.length
        }, conversationId, userId);
        
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
      const conversationMemories = await withMemoryErrorLogging('storage', 'MemoryStore.processConversation', async () => {
        return await this.storeConversationMemories(
          conversationId,
          normalizedUserId,
          memoriesWithSalience,
          extracted
        );
      }, { conversationId, userId });
      
      // Step 7: Promote important memories to user level
      const userMemories = await withMemoryErrorLogging('storage', 'MemoryStore.processConversation', async () => {
        return await this.promoteToUserMemories(
          normalizedUserId,
          memoriesWithSalience.filter(m => m.importance >= 7)
        );
      }, { conversationId, userId });
      
      await logMemoryInfo('MemoryStore.processConversation', 'Successfully processed conversation memories', {
        conversationId,
        userId: displayUserId,
        extractedCount: extracted.memories.length,
        conversationMemories: conversationMemories.length,
        userMemories: userMemories.length
      }, conversationId, userId);
      
      return {
        conversationMemories: conversationMemories.length,
        userMemories: userMemories.length,
        extracted
      };
    }, { conversationId, userId });
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
          conversation_id: conversationId,
          owner_id: userId,
          kind: 'fact',
          value_jsonb: {
            content: memory.content,
            factType: memory.factType,
            importance: memory.importance,
            confidence: memory.confidence,
            temporality: memory.temporality,
            subject: memory.subject,
            entities: memory.entities,
            relatedTopics: memory.relatedTopics,
            sourceContext: memory.sourceContext,
            expiresAt: memory.expiresAt,
            conversationSummary: extraction.conversationSummary,
            userIntent: extraction.userIntent,
            emotionalTone: extraction.emotionalTone
          },
          salience: memory.salience,
          novelty_hash: this.generateHash(memory.content),
          source: 'user',
          language_code: 'en'
        }).returning();
        
        stored.push(record[0]);
      } catch (error: any) {
        // Handle duplicate key errors gracefully
        if (error.code === '23505') {
          await logMemoryDebug('MemoryStore.storeConversationMemories', `Duplicate memory skipped: ${this.generateHash(memory.content)}`, {
            conversationId,
            userId,
            memoryHash: this.generateHash(memory.content),
            memoryContent: memory.content
          }, conversationId, userId);
        } else {
          await logStorageError('MemoryStore.storeConversationMemories', `Failed to store conversation memory: ${error.message}`, {
            conversationId,
            userId,
            memoryHash: this.generateHash(memory.content),
            memoryContent: memory.content,
            errorCode: error.code,
            errorStack: error.stack
          }, conversationId, userId);
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
            eq(userMemoriesTable.owner_id, userId),
            eq(userMemoriesTable.novelty_hash, this.generateHash(memory.content))
          )
        });
        
        if (existing) {
          // Update access timestamp
          await db.update(userMemoriesTable)
            .set({
              last_used_at: new Date()
            })
            .where(eq(userMemoriesTable.id, existing.id));
          
          promoted.push(existing);
        } else {
          // Create new user memory
          const record = await db.insert(userMemoriesTable).values({
            owner_id: userId,
            kind: 'fact',
            value_jsonb: {
              content: memory.content,
              factType: memory.factType,
              importance: memory.importance,
              confidence: memory.confidence,
              temporality: memory.temporality,
              subject: memory.subject,
              entities: memory.entities,
              relatedTopics: memory.relatedTopics,
              sourceContext: memory.sourceContext,
              expiresAt: memory.expiresAt
            },
            salience: memory.salience,
            novelty_hash: this.generateHash(memory.content),
            source: 'user',
            language_code: 'en'
          }).returning();
          
          promoted.push(record[0]);
        }
      } catch (error) {
        await logStorageError('MemoryStore.promoteToUserMemories', `Failed to promote memory to user level: ${error instanceof Error ? error.message : 'Unknown error'}`, {
          conversation_id: '',
          userId,
          memoryHash: this.generateHash(memory.content),
          memoryContent: memory.content,
          errorStack: error instanceof Error ? error.stack : undefined
        }, '', userId);
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
    // Normalize user ID for database operations
    const normalizedUserId = normalizeUserId(userId);
    
    return await withMemoryErrorLogging('injection', 'MemoryStore.getRelevantMemories', async (): Promise<StoredMemory[]> => {
      // Get recent conversation memories
      const conversationMemories = await db.query.conversationMemoriesTable.findMany({
        where: eq(conversationMemoriesTable.conversation_id, conversationId),
        orderBy: [desc(conversationMemoriesTable.salience)],
        limit: Math.floor(maxMemories * 0.6) // 60% from conversation
      });
      
      // Get important user memories
      const userMemories = await db.query.userMemoriesTable.findMany({
        where: eq(userMemoriesTable.owner_id, normalizedUserId as any),
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
        factType: (m.value_jsonb as any)?.factType as any,
        content: (m.value_jsonb as any)?.content,
        subject: (m.value_jsonb as any)?.subject,
        importance: (m.value_jsonb as any)?.importance,
        confidence: (m.value_jsonb as any)?.confidence,
        temporality: (m.value_jsonb as any)?.temporality as any,
        entities: (m.value_jsonb as any)?.entities,
        relatedTopics: (m.value_jsonb as any)?.relatedTopics,
        expiresAt: (m.value_jsonb as any)?.expiresAt,
        sourceContext: (m.value_jsonb as any)?.sourceContext
      }));
      
      const relevant = this.extractor.filterRelevantMemories(
        memoryObjects,
        currentMessage,
        maxMemories
      );
      
      // Map back to stored memories
      const relevantHashes = new Set(relevant.map(r => this.generateHash(r.content)));
      
      const result = allMemories
        .filter(m => m.novelty_hash && relevantHashes.has(m.novelty_hash))
        .map(m => ({
          id: m.id,
          content: (m.value_jsonb as any)?.content,
          factType: (m.value_jsonb as any)?.factType,
          importance: (m.value_jsonb as any)?.importance,
          confidence: (m.value_jsonb as any)?.confidence,
          salience: m.salience,
          hash: m.novelty_hash || '',
          metadata: m.value_jsonb,
          createdAt: m.created_at,
          lastAccessedAt: m.last_used_at || m.created_at
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
          .set({ last_used_at: new Date() })
          .where(inArray(conversationMemoriesTable.id, conversationIds));
      }
      
      if (userIds.length > 0) {
        await db.update(userMemoriesTable)
          .set({
            last_used_at: new Date()
          })
          .where(inArray(userMemoriesTable.id, userIds));
      }
      
      await logMemoryDebug('MemoryStore.getRelevantMemories', 'Successfully retrieved relevant memories', {
        conversationId,
        userId,
        currentMessageLength: currentMessage.length,
        totalMemories: allMemories.length,
        relevantMemories: result.length
      }, conversationId, userId);
      
      return result;
    }, { conversationId, userId });
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
          where: eq(conversationMemoriesTable.conversation_id, conversationId),
          orderBy: [desc(conversationMemoriesTable.created_at)],
          limit: limit / 2
        }),
        db.query.userMemoriesTable.findMany({
          where: eq(userMemoriesTable.owner_id, userId),
          orderBy: [desc(userMemoriesTable.created_at)],
          limit: limit / 2
        })
      ]);
      
      const result = [
        ...conversationMems.map(m => ({
          content: (m.value_jsonb as any)?.content || '',
          hash: m.novelty_hash || ''
        })),
        ...userMems.map(m => ({
          content: (m.value_jsonb as any)?.content || '',
          hash: m.novelty_hash || ''
        }))
      ].filter(m => m.content && m.hash);
      
      return result;
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
        .where(eq(conversationMemoriesTable.conversation_id, conversationId));
      
      const currentCount = Number(count[0]?.count || 0);
      
      if (currentCount > this.config.maxConversationMemories) {
        // Delete oldest, least important memories
        const toDelete = currentCount - this.config.maxConversationMemories;
        
        const oldMemories = await db.query.conversationMemoriesTable.findMany({
          where: eq(conversationMemoriesTable.conversation_id, conversationId),
          orderBy: [
            sql`${conversationMemoriesTable.salience} ASC`,
            sql`${conversationMemoriesTable.last_used_at} ASC NULLS FIRST`,
            sql`${conversationMemoriesTable.created_at} ASC`
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
          eq(conversationMemoriesTable.conversation_id, conversationId),
          or(
            sql`${conversationMemoriesTable.value_jsonb}->>'expiresAt' < ${new Date().toISOString()}`,
            and(
              sql`${conversationMemoriesTable.value_jsonb}->>'temporality' = 'temporary'`,
              sql`${conversationMemoriesTable.created_at} < ${cutoffDate}`
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
        .where(eq(userMemoriesTable.owner_id, userId));
      
      const currentCount = Number(count[0]?.count || 0);
      
      if (currentCount > this.config.maxUserMemories) {
        // Delete oldest, least accessed, least important memories
        const toDelete = currentCount - this.config.maxUserMemories;
        
        const oldMemories = await db.query.userMemoriesTable.findMany({
          where: eq(userMemoriesTable.owner_id, userId),
          orderBy: [
            sql`${userMemoriesTable.salience} ASC`,
            sql`${userMemoriesTable.last_used_at} ASC NULLS FIRST`,
            sql`${userMemoriesTable.created_at} ASC`
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
          eq(userMemoriesTable.owner_id, userId),
          sql`${userMemoriesTable.value_jsonb}->>'expiresAt' < ${new Date().toISOString()}`
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
          .where(eq(conversationMemoriesTable.owner_id, userId)),
        db.delete(userMemoriesTable)
          .where(eq(userMemoriesTable.owner_id, userId))
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
          .where(eq(conversationMemoriesTable.owner_id, userId)),
        
        db.select({ count: sql<number>`count(*)` })
          .from(userMemoriesTable)
          .where(eq(userMemoriesTable.owner_id, userId)),
        
        db.query.userMemoriesTable.findMany({
          where: eq(userMemoriesTable.owner_id, userId),
          orderBy: [desc(userMemoriesTable.last_used_at)],
          limit: 1
        })
      ]);
      
      // Get fact type distribution
      const factTypes = await db
        .select({
          type: sql<string>`value_jsonb->>'factType'`,
          count: sql<number>`count(*)`
        })
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.owner_id, userId))
        .groupBy(sql`value_jsonb->>'factType'`)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      
      // Get average importance
      const avgImportance = await db
        .select({
          avg: sql<number>`avg((value_jsonb->>'importance')::numeric)`
        })
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.owner_id, userId));
      
      // Get oldest memory
      const oldest = await db.query.userMemoriesTable.findFirst({
        where: eq(userMemoriesTable.owner_id, userId),
        orderBy: [userMemoriesTable.created_at],
        columns: { created_at: true }
      });
      
      return {
        totalConversationMemories: Number(convCount[0]?.count || 0),
        totalUserMemories: Number(userCount[0]?.count || 0),
        topFactTypes: factTypes.map(ft => ({
          type: ft.type,
          count: Number(ft.count)
        })),
        averageImportance: Number(avgImportance[0]?.avg || 0),
        oldestMemory: oldest?.created_at || null,
        mostAccessedMemory: (userMemories[0]?.value_jsonb as any)?.content || null
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