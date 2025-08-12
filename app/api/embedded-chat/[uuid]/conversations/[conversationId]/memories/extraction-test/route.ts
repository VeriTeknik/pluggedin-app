import { desc,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { chatMessagesTable, conversationMemoriesTable, userMemoriesTable } from '@/db/schema';
import { detectArtifacts } from '@/lib/chat-memory/artifact-detector';
import { memoryGate } from '@/lib/chat-memory/memory-gate';
import { MemoryStore } from '@/lib/chat-memory/memory-store';
import { StructuredMemoryExtractor } from '@/lib/chat-memory/structured-extractor';

interface ExtractionTestResult {
  success: boolean;
  message: string;
  details: {
    conversationFound: boolean;
    messageCount: number;
    hasUserId: boolean;
    userId?: string;
    extractionTest: {
      artifactsDetected: boolean;
      artifacts: any;
      gateDecision: any;
      memoriesExtracted: boolean;
      extractedMemories: any[];
      extractionError?: string;
    };
    storageTest: {
      conversationMemoriesStored: boolean;
      userMemoriesStored: boolean;
      storedConversationMemories: any[];
      storedUserMemories: any[];
      storageError?: string;
    };
    injectionTest: {
      memoriesRetrieved: boolean;
      retrievedMemories: any[];
      contextBuilt: boolean;
      builtContext: string;
      retrievalError?: string;
    };
    recommendations: string[];
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { uuid: string; conversationId: string } }
) {
  try {
    const { uuid: _uuid, conversationId } = params;
    
    const result: ExtractionTestResult = {
      success: false,
      message: 'Memory extraction test failed',
      details: {
        conversationFound: false,
        messageCount: 0,
        hasUserId: false,
        extractionTest: {
          artifactsDetected: false,
          artifacts: null,
          gateDecision: null,
          memoriesExtracted: false,
          extractedMemories: []
        },
        storageTest: {
          conversationMemoriesStored: false,
          userMemoriesStored: false,
          storedConversationMemories: [],
          storedUserMemories: []
        },
        injectionTest: {
          memoriesRetrieved: false,
          retrievedMemories: [],
          contextBuilt: false,
          builtContext: ''
        },
        recommendations: []
      }
    };

    // Step 1: Verify conversation exists and get messages
    const messages = await db.query.chatMessagesTable.findMany({
      where: eq(chatMessagesTable.conversation_uuid, conversationId),
      orderBy: [desc(chatMessagesTable.created_at)],
      limit: 10
    });

    if (messages.length === 0) {
      result.message = 'No messages found for this conversation';
      result.details.recommendations.push('Check if conversation ID is correct and if messages exist');
      return NextResponse.json(result, { status: 404 });
    }

    result.details.conversationFound = true;
    result.details.messageCount = messages.length;

    // Step 2: Check if we have a user ID (required for memory extraction)
    let userId: string | null = null;
    try {
      const { getUserInfoFromAuth } = await import('@/lib/auth');
      const userInfo = await getUserInfoFromAuth();
      if (userInfo?.id) {
        userId = userInfo.id.toString();
        result.details.hasUserId = true;
        result.details.userId = userId;
      }
    } catch (error) {
      console.log('[EXTRACTION-TEST] Could not get user info:', error);
    }

    if (!userId) {
      result.message = 'User authentication required for memory extraction';
      result.details.recommendations.push('Ensure user is authenticated to enable memory extraction');
      return NextResponse.json(result, { status: 401 });
    }

    // Step 3: Test artifact detection
    const lastMessage = messages[messages.length - 1];
    const artifactResult = detectArtifacts(lastMessage.content);
    result.details.extractionTest.artifactsDetected = artifactResult.hasArtifacts;
    result.details.extractionTest.artifacts = artifactResult;

    // Step 4: Test memory gate decision
    try {
      const gateDecision = await memoryGate(
        {
          conversationSummary: '',
          userMessage: messages.find(m => m.role === 'user')?.content || '',
          assistantMessage: messages.find(m => m.role === 'assistant')?.content || ''
        },
        {
          mode: 'llm',
          anthropicApiKey: process.env.OPENAI_API_KEY // Using OpenAI API key as fallback
        }
      );
      result.details.extractionTest.gateDecision = gateDecision;
    } catch (gateError) {
      console.error('[EXTRACTION-TEST] Memory gate error:', gateError);
      result.details.extractionTest.gateDecision = {
        remember: false,
        reason: `Gate error: ${gateError instanceof Error ? gateError.message : 'Unknown error'}`,
        confidence: 0
      };
    }

    // Step 5: Test memory extraction
    try {
      const memoryStore = new MemoryStore();
      const extractor = new StructuredMemoryExtractor(process.env.OPENAI_API_KEY);
      
      // Get existing memories for deduplication
      const existingMemories = await memoryStore.getRelevantMemories(userId, conversationId, '', 50);
      
      // Format messages for extraction
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })).reverse(); // Reverse to chronological order
      
      // Extract memories
      const extracted = await extractor.extractMemories(formattedMessages, {
        userId,
        conversationId,
        existingMemories: existingMemories.map(m => ({
          content: m.content,
          hash: m.hash
        }))
      });
      
      result.details.extractionTest.memoriesExtracted = extracted.memories.length > 0;
      result.details.extractionTest.extractedMemories = extracted.memories;
      
      if (extracted.memories.length === 0) {
        result.details.extractionTest.extractionError = 'No memories were extracted from the conversation';
      }
    } catch (extractionError) {
      console.error('[EXTRACTION-TEST] Memory extraction error:', extractionError);
      result.details.extractionTest.extractionError = extractionError instanceof Error ? extractionError.message : 'Unknown error';
    }

    // Step 6: Test memory storage
    try {
      // Check if conversation memories exist
      const conversationMemories = await db.query.conversationMemoriesTable.findMany({
        where: eq(conversationMemoriesTable.conversation_id, conversationId),
        limit: 10
      });
      
      result.details.storageTest.conversationMemoriesStored = conversationMemories.length > 0;
      result.details.storageTest.storedConversationMemories = conversationMemories;
      
      // Check if user memories exist
      const userMemories = await db.query.userMemoriesTable.findMany({
        where: eq(userMemoriesTable.owner_id, userId),
        limit: 10
      });
      
      result.details.storageTest.userMemoriesStored = userMemories.length > 0;
      result.details.storageTest.storedUserMemories = userMemories;
      
      if (conversationMemories.length === 0 && userMemories.length === 0) {
        result.details.storageTest.storageError = 'No memories found in storage';
      }
    } catch (storageError) {
      console.error('[EXTRACTION-TEST] Memory storage error:', storageError);
      result.details.storageTest.storageError = storageError instanceof Error ? storageError.message : 'Unknown error';
    }

    // Step 7: Test memory injection
    try {
      const memoryStore = new MemoryStore();
      const testQuery = "Tell me about what we discussed";
      
      const retrievedMemories = await memoryStore.getRelevantMemories(
        userId,
        conversationId,
        testQuery,
        10
      );
      
      result.details.injectionTest.memoriesRetrieved = retrievedMemories.length > 0;
      result.details.injectionTest.retrievedMemories = retrievedMemories;
      
      if (retrievedMemories.length > 0) {
        // Test context building
        const { MemoryContextBuilder } = await import('@/lib/chat-memory/context-builder');
        const contextBuilder = new MemoryContextBuilder({
          maxTokens: 300,
          format: 'structured',
          includeMetadata: false,
          groupByType: true
        });
        
        const context = contextBuilder.buildCompactContext(retrievedMemories);
        result.details.injectionTest.contextBuilt = context.length > 0;
        result.details.injectionTest.builtContext = context;
      } else {
        result.details.injectionTest.retrievalError = 'No memories retrieved for injection test';
      }
    } catch (injectionError) {
      console.error('[EXTRACTION-TEST] Memory injection error:', injectionError);
      result.details.injectionTest.retrievalError = injectionError instanceof Error ? injectionError.message : 'Unknown error';
    }

    // Step 8: Generate recommendations
    const recommendations: string[] = [];
    
    if (!result.details.extractionTest.artifactsDetected) {
      recommendations.push('No artifacts detected in messages. Consider adding messages with emails, URLs, IDs, or other structured data.');
    }
    
    if (!result.details.extractionTest.gateDecision.remember) {
      recommendations.push(`Memory gate decided not to extract memories: ${result.details.extractionTest.gateDecision.reason}`);
    }
    
    if (!result.details.extractionTest.memoriesExtracted) {
      if (result.details.extractionTest.extractionError) {
        recommendations.push(`Memory extraction failed: ${result.details.extractionTest.extractionError}`);
      } else {
        recommendations.push('No memories were extracted. This could be due to:');
        recommendations.push('- Messages not containing important information');
        recommendations.push('- API key issues for the extraction model');
        recommendations.push('- Duplicate detection filtering out memories');
      }
    }
    
    if (!result.details.storageTest.conversationMemoriesStored && !result.details.storageTest.userMemoriesStored) {
      if (result.details.storageTest.storageError) {
        recommendations.push(`Memory storage issue: ${result.details.storageTest.storageError}`);
      } else {
        recommendations.push('No memories found in storage. Check if extraction is working and if memories are being saved.');
      }
    }
    
    if (!result.details.injectionTest.memoriesRetrieved) {
      if (result.details.injectionTest.retrievalError) {
        recommendations.push(`Memory retrieval issue: ${result.details.injectionTest.retrievalError}`);
      } else {
        recommendations.push('No memories retrieved for injection. Check if memories are being stored properly.');
      }
    }
    
    // Add specific recommendations based on the analysis
    if (result.details.extractionTest.memoriesExtracted && !result.details.storageTest.conversationMemoriesStored) {
      recommendations.push('Memories are being extracted but not stored. Check the storage process.');
    }
    
    if (result.details.storageTest.conversationMemoriesStored && !result.details.injectionTest.memoriesRetrieved) {
      recommendations.push('Memories are stored but not retrieved. Check the retrieval process.');
    }
    
    // Check for common issues
    if (!process.env.OPENAI_API_KEY) {
      recommendations.push('OPENAI_API_KEY environment variable is not set. This is required for memory extraction.');
    }
    
    result.details.recommendations = recommendations;

    // Step 9: Determine overall success
    const allStepsWorking = [
      result.details.extractionTest.artifactsDetected || result.details.extractionTest.gateDecision.remember,
      result.details.extractionTest.memoriesExtracted,
      result.details.storageTest.conversationMemoriesStored || result.details.storageTest.userMemoriesStored,
      result.details.injectionTest.memoriesRetrieved
    ].every(Boolean);
    
    result.success = allStepsWorking;
    result.message = allStepsWorking 
      ? 'Memory extraction system is working properly' 
      : 'Memory extraction system has issues that need to be addressed';

    return NextResponse.json(result);
  } catch (error) {
    console.error('[EXTRACTION-TEST] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      message: 'Unexpected error during memory extraction test',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}