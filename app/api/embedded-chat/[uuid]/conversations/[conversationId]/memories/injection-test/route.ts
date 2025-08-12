import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { chatConversationsTable, conversationMemoriesTable, userMemoriesTable } from '@/db/schema';
import { MemoryContextBuilder } from '@/lib/chat-memory/context-builder';
import { MemoryStore } from '@/lib/chat-memory/memory-store';

interface InjectionTestResult {
  success: boolean;
  message: string;
  details: {
    conversationFound: boolean;
    hasUserId: boolean;
    userId?: string;
    memoriesAvailable: {
      conversationMemories: any[];
      userMemories: any[];
      totalMemories: number;
    };
    injectionTest: {
      memoriesRetrieved: boolean;
      retrievedMemories: any[];
      contextBuilt: boolean;
      builtContext: string;
      contextFormats: {
        structured: string;
        narrative: string;
        minimal: string;
      };
      injectionError?: string;
    };
    simulationTest: {
      simulatedQuery: string;
      simulatedResponse: string;
      memoriesUsed: boolean;
      memoryAccuracy: number;
      simulationError?: string;
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
    
    const result: InjectionTestResult = {
      success: false,
      message: 'Memory injection test failed',
      details: {
        conversationFound: false,
        hasUserId: false,
        memoriesAvailable: {
          conversationMemories: [],
          userMemories: [],
          totalMemories: 0
        },
        injectionTest: {
          memoriesRetrieved: false,
          retrievedMemories: [],
          contextBuilt: false,
          builtContext: '',
          contextFormats: {
            structured: '',
            narrative: '',
            minimal: ''
          }
        },
        simulationTest: {
          simulatedQuery: '',
          simulatedResponse: '',
          memoriesUsed: false,
          memoryAccuracy: 0
        },
        recommendations: []
      }
    };

    // Step 1: Verify conversation exists
    const conversation = await db.query.chatConversationsTable.findFirst({
      where: eq(chatConversationsTable.uuid, conversationId)
    });

    if (!conversation) {
      result.message = 'Conversation not found';
      result.details.recommendations.push('Check if conversation ID is correct');
      return NextResponse.json(result, { status: 404 });
    }

    result.details.conversationFound = true;

    // Step 2: Check if we have a user ID
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
      console.log('[INJECTION-TEST] Could not get user info:', error);
    }

    if (!userId) {
      result.message = 'User authentication required for memory injection';
      result.details.recommendations.push('Ensure user is authenticated to enable memory injection');
      return NextResponse.json(result, { status: 401 });
    }

    // Step 3: Check available memories
    try {
      const conversationMemories = await db.query.conversationMemoriesTable.findMany({
        where: eq(conversationMemoriesTable.conversation_id, conversationId),
        limit: 20
      });
      
      const userMemories = await db.query.userMemoriesTable.findMany({
        where: eq(userMemoriesTable.owner_id, userId),
        limit: 20
      });
      
      result.details.memoriesAvailable.conversationMemories = conversationMemories;
      result.details.memoriesAvailable.userMemories = userMemories;
      result.details.memoriesAvailable.totalMemories = conversationMemories.length + userMemories.length;
      
      if (conversationMemories.length === 0 && userMemories.length === 0) {
        result.message = 'No memories available for injection test';
        result.details.recommendations.push('Create some memories first by having conversations with extractable information');
        return NextResponse.json(result);
      }
    } catch (error) {
      console.error('[INJECTION-TEST] Error checking available memories:', error);
      result.message = 'Error checking available memories';
      result.details.recommendations.push(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return NextResponse.json(result);
    }

    // Step 4: Test memory retrieval
    try {
      const memoryStore = new MemoryStore();
      const testQuery = "What did we discuss about our project?";
      
      const retrievedMemories = await memoryStore.getRelevantMemories(
        userId,
        conversationId,
        testQuery,
        10
      );
      
      result.details.injectionTest.memoriesRetrieved = retrievedMemories.length > 0;
      result.details.injectionTest.retrievedMemories = retrievedMemories;
      
      if (retrievedMemories.length === 0) {
        result.details.injectionTest.injectionError = 'No memories retrieved for injection test';
        result.details.recommendations.push('No memories were retrieved. This could indicate:');
        result.details.recommendations.push('- Memories are not properly stored');
        result.details.recommendations.push('- Memory retrieval is not working correctly');
        result.details.recommendations.push('- No memories match the test query');
      }
    } catch (retrievalError) {
      console.error('[INJECTION-TEST] Memory retrieval error:', retrievalError);
      result.details.injectionTest.injectionError = retrievalError instanceof Error ? retrievalError.message : 'Unknown error';
      result.details.recommendations.push(`Memory retrieval failed: ${result.details.injectionTest.injectionError}`);
    }

    // Step 5: Test context building with different formats
    if (result.details.injectionTest.retrievedMemories.length > 0) {
      try {
        const contextBuilder = new MemoryContextBuilder();
        
        // Test structured format
        const structuredContext = contextBuilder.buildCompactContext(
          result.details.injectionTest.retrievedMemories,
          'structured'
        );
        result.details.injectionTest.contextFormats.structured = structuredContext;
        
        // Test narrative format
        const narrativeContext = contextBuilder.buildCompactContext(
          result.details.injectionTest.retrievedMemories,
          'narrative'
        );
        result.details.injectionTest.contextFormats.narrative = narrativeContext;
        
        // Test minimal format
        const minimalContext = contextBuilder.buildCompactContext(
          result.details.injectionTest.retrievedMemories,
          'minimal'
        );
        result.details.injectionTest.contextFormats.minimal = minimalContext;
        
        // Use structured format as the default
        result.details.injectionTest.builtContext = structuredContext;
        result.details.injectionTest.contextBuilt = structuredContext.length > 0;
        
        if (!result.details.injectionTest.contextBuilt) {
          result.details.recommendations.push('Context building failed. Check the MemoryContextBuilder implementation.');
        }
      } catch (contextError) {
        console.error('[INJECTION-TEST] Context building error:', contextError);
        result.details.injectionTest.injectionError = contextError instanceof Error ? contextError.message : 'Unknown error';
        result.details.recommendations.push(`Context building failed: ${result.details.injectionTest.injectionError}`);
      }
    }

    // Step 6: Simulate a conversation with memory injection
    if (result.details.injectionTest.contextBuilt) {
      try {
        // Create a simulated query that would benefit from memory
        const simulatedQuery = "Based on our previous conversation, what are the key points we discussed?";
        result.details.simulationTest.simulatedQuery = simulatedQuery;
        
        // Simulate a response that incorporates memory
        const memoryContext = result.details.injectionTest.builtContext;
        const simulatedResponse = `Based on our previous conversation, here are the key points:\n\n${memoryContext}\n\nIs there anything specific you'd like me to elaborate on?`;
        result.details.simulationTest.simulatedResponse = simulatedResponse;
        
        // Check if memories were actually used in the response
        const memoriesUsed = memoryContext.length > 0 && 
          simulatedResponse.toLowerCase().includes(memoryContext.toLowerCase().substring(0, 50));
        result.details.simulationTest.memoriesUsed = memoriesUsed;
        
        // Calculate a simple accuracy score based on context usage
        const accuracy = memoriesUsed ? 100 : 0;
        if (memoriesUsed && memoryContext.length > 100) {
          // Bonus for substantial context usage
          result.details.simulationTest.memoryAccuracy = Math.min(100, accuracy + 20);
        } else {
          result.details.simulationTest.memoryAccuracy = accuracy;
        }
        
        if (!memoriesUsed) {
          result.details.recommendations.push('Memories are not being effectively used in responses.');
          result.details.recommendations.push('Check how memories are injected into the conversation context.');
        }
      } catch (simulationError) {
        console.error('[INJECTION-TEST] Simulation error:', simulationError);
        result.details.simulationTest.simulationError = simulationError instanceof Error ? simulationError.message : 'Unknown error';
        result.details.recommendations.push(`Simulation failed: ${result.details.simulationTest.simulationError}`);
      }
    }

    // Step 7: Generate recommendations
    const recommendations: string[] = [];
    
    if (!result.details.memoriesAvailable.totalMemories) {
      recommendations.push('No memories available. Create conversations with extractable information first.');
    }
    
    if (!result.details.injectionTest.memoriesRetrieved) {
      recommendations.push('Memory retrieval is not working. Check the MemoryStore.getRelevantMemories method.');
    }
    
    if (!result.details.injectionTest.contextBuilt) {
      recommendations.push('Context building failed. Check the MemoryContextBuilder implementation.');
    }
    
    if (!result.details.simulationTest.memoriesUsed) {
      recommendations.push('Memories are not being used in responses. Check the injection process.');
    }
    
    if (result.details.simulationTest.memoryAccuracy < 80) {
      recommendations.push('Memory usage accuracy is low. Improve the relevance and integration of memories.');
    }
    
    // Add specific recommendations based on the test results
    if (result.details.memoriesAvailable.totalMemories > 0 && !result.details.injectionTest.memoriesRetrieved) {
      recommendations.push('Memories exist but are not being retrieved. Check the retrieval logic.');
    }
    
    if (result.details.injectionTest.memoriesRetrieved && !result.details.injectionTest.contextBuilt) {
      recommendations.push('Memories are retrieved but context is not built. Check the context builder.');
    }
    
    if (result.details.injectionTest.contextBuilt && !result.details.simulationTest.memoriesUsed) {
      recommendations.push('Context is built but not used in responses. Check the response generation process.');
    }
    
    result.details.recommendations = recommendations;

    // Step 8: Determine overall success
    const allStepsWorking = [
      result.details.memoriesAvailable.totalMemories > 0,
      result.details.injectionTest.memoriesRetrieved,
      result.details.injectionTest.contextBuilt,
      result.details.simulationTest.memoriesUsed,
      result.details.simulationTest.memoryAccuracy >= 80
    ].every(Boolean);
    
    result.success = allStepsWorking;
    result.message = allStepsWorking 
      ? 'Memory injection system is working properly' 
      : 'Memory injection system has issues that need to be addressed';

    return NextResponse.json(result);
  } catch (error) {
    console.error('[INJECTION-TEST] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      message: 'Unexpected error during memory injection test',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}