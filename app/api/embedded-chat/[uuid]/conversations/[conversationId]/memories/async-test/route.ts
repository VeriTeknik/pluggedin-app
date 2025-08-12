import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { embeddedChatsTable, chatMessagesTable, conversationMemoriesTable, userMemoriesTable } from '@/db/schema';
import { MemoryStore } from '@/lib/chat-memory/memory-store';
import { StructuredMemoryExtractor } from '@/lib/chat-memory/structured-extractor';
import { memoryGate } from '@/lib/chat-memory/memory-gate';

export async function POST(
  request: NextRequest,
  { params }: { params: { uuid: string; conversationId: string } }
) {
  try {
    const { uuid, conversationId } = params;
    
    // Get user ID using the same method as extraction-test
    let userId: string | null = null;
    try {
      const { getUserInfoFromAuth } = await import('@/lib/auth');
      const userInfo = await getUserInfoFromAuth();
      if (userInfo?.id) {
        userId = userInfo.id.toString();
      }
    } catch (error) {
      console.log('[ASYNC-TEST] Could not get user info:', error);
    }

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User authentication required for memory processing test'
      }, { status: 401 });
    }

    // 1. Verify the embedded chat exists and belongs to the user's project
    const chatData = await db.query.embeddedChatsTable.findFirst({
      where: eq(embeddedChatsTable.uuid, uuid),
      with: {
        project: {
          columns: { active_profile_uuid: true }
        }
      }
    });

    if (!chatData || !chatData.project?.active_profile_uuid) {
      return NextResponse.json({ 
        success: false, 
        error: 'Embedded chat not found' 
      }, { status: 404 });
    }

    // 2. Get recent messages for testing
    const messages = await db
      .select({
        id: chatMessagesTable.id,
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
        created_at: chatMessagesTable.created_at
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversation_uuid, conversationId))
      .orderBy(desc(chatMessagesTable.created_at))
      .limit(10); // Get last 10 messages

    if (messages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No messages found in conversation' 
      }, { status: 404 });
    }

    // 3. Check existing memories
    const existingConversationMemories = await db
      .select()
      .from(conversationMemoriesTable)
      .where(eq(conversationMemoriesTable.conversation_id, conversationId));

    const existingUserMemories = await db
      .select()
      .from(userMemoriesTable)
      .where(eq(userMemoriesTable.owner_id, userId));

    // 4. Test memory gate decision
    const gateContext = {
      conversationSummary: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
      userMessage: messages.find(m => m.role === 'user')?.content || ''
    };
    const shouldProcess = await memoryGate(gateContext);
    
    // 5. Test memory extraction
    const memoryExtractor = new StructuredMemoryExtractor();
    const extractionContext = {
      userId,
      conversationId,
      language: 'en'
    };
    const extractionResult = await memoryExtractor.extractMemories(
      messages.map(msg => ({ role: msg.role, content: msg.content })),
      extractionContext
    );

    // 6. Test memory storage with detailed logging
    const memoryStore = new MemoryStore();
    const storageResult = {
      conversationMemories: 0,
      userMemories: 0,
      errors: [] as string[],
      details: {
        conversationMemoryStorage: null as any,
        userMemoryStorage: null as any
      }
    };

    try {
      // Test conversation memory storage
      if (extractionResult.memories.length > 0) {
        // Use public processConversation method instead of private storage methods
        const conversationMemoryStorage = await memoryStore.processConversation(
          conversationId,
          userId,
          messages.map(msg => ({ role: msg.role, content: msg.content })),
          'en'
        );
        storageResult.conversationMemories = extractionResult.memories.length;
        storageResult.details.conversationMemoryStorage = conversationMemoryStorage;
      }
    } catch (error) {
      storageResult.errors.push(`Conversation memory storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // Test user memory storage
      if (extractionResult.memories.length > 0) {
        // Use public processConversation method instead of private storage methods
        const userMemoryStorage = await memoryStore.processConversation(
          conversationId,
          userId,
          messages.map(msg => ({ role: msg.role, content: msg.content })),
          'en'
        );
        storageResult.userMemories = extractionResult.memories.length;
        storageResult.details.userMemoryStorage = userMemoryStorage;
      }
    } catch (error) {
      storageResult.errors.push(`User memory storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 7. Simulate async processing (like in the actual implementation)
    const asyncProcessingResult = {
      success: false,
      error: null as string | null,
      memoriesStored: 0,
      processingTime: 0
    };

    const startTime = Date.now();
    
    try {
      // Simulate the async processing from executeEmbeddedChatQuery
      await new Promise<void>((resolve, reject) => {
        memoryStore.processConversation(
          conversationId,
          userId,
          messages.map(msg => ({ role: msg.role, content: msg.content })),
          'en' // Default language
        ).then(result => {
          asyncProcessingResult.success = true;
          asyncProcessingResult.memoriesStored = result.conversationMemories + result.userMemories;
          asyncProcessingResult.processingTime = Date.now() - startTime;
          resolve();
        }).catch(error => {
          asyncProcessingResult.error = error instanceof Error ? error.message : 'Unknown error';
          asyncProcessingResult.processingTime = Date.now() - startTime;
          reject(error);
        });
      });
    } catch (error) {
      // This catch block represents a silent failure in the actual implementation
      console.error('[ASYNC-TEST] Async memory processing failed:', error);
    }

    // 8. Verify memories were actually stored
    const finalConversationMemories = await db
      .select()
      .from(conversationMemoriesTable)
      .where(eq(conversationMemoriesTable.conversation_id, conversationId));

    const finalUserMemories = await db
      .select()
      .from(userMemoriesTable)
      .where(eq(userMemoriesTable.owner_id, userId));

    // 9. Analyze results and identify issues
    const issues = [];
    const recommendations = [];

    // Check if async processing silently failed
    if (!asyncProcessingResult.success && asyncProcessingResult.error) {
      issues.push({
        type: 'ASYNC_PROCESSING_FAILURE',
        message: 'Asynchronous memory processing failed',
        details: asyncProcessingResult.error
      });
      recommendations.push('Implement proper error handling for async memory processing');
    }

    // Check if memories were supposed to be stored but weren't
    if (extractionResult.memories.length > 0 &&
        finalConversationMemories.length <= existingConversationMemories.length &&
        finalUserMemories.length <= existingUserMemories.length) {
      issues.push({
        type: 'MEMORY_NOT_STORED',
        message: 'Memories were extracted but not stored',
        details: `Expected to store ${extractionResult.memories.length} memories, but no new memories were found`
      });
      recommendations.push('Check memory storage implementation and database constraints');
    }

    // Check if memory gate is preventing processing
    if (!shouldProcess && messages.length > 2) {
      issues.push({
        type: 'MEMORY_GATE_TOO_RESTRICTIVE',
        message: 'Memory gate is preventing memory extraction',
        details: 'Memory gate decided not to extract memories from this conversation'
      });
      recommendations.push('Adjust memory gate sensitivity or review gate logic');
    }

    // Check if extraction is working but storage is failing
    if (extractionResult.memories.length > 0 && storageResult.errors.length > 0) {
      issues.push({
        type: 'STORAGE_FAILURE',
        message: 'Memory extraction succeeded but storage failed',
        details: storageResult.errors.join('; ')
      });
      recommendations.push('Fix memory storage errors and implement retry logic');
    }

    // 10. Return comprehensive test results
    return NextResponse.json({
      success: true,
      testResults: {
        memoryGate: {
          shouldProcess,
          messagesTested: messages.length
        },
        extraction: {
          memories: extractionResult.memories.length,
          conversationSummary: extractionResult.conversationSummary,
          userIntent: extractionResult.userIntent
        },
        storage: storageResult,
        asyncProcessing: asyncProcessingResult,
        beforeAfter: {
          conversationMemories: {
            before: existingConversationMemories.length,
            after: finalConversationMemories.length,
            difference: finalConversationMemories.length - existingConversationMemories.length
          },
          userMemories: {
            before: existingUserMemories.length,
            after: finalUserMemories.length,
            difference: finalUserMemories.length - existingUserMemories.length
          }
        }
      },
      issues,
      recommendations,
      summary: {
        hasIssues: issues.length > 0,
        issueCount: issues.length,
        recommendationCount: recommendations.length,
        overallStatus: issues.length === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION'
      }
    });

  } catch (error) {
    console.error('[ASYNC-TEST] Error in async memory processing test:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}