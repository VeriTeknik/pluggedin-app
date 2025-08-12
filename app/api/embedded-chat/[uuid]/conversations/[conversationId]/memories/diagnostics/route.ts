import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { 
  chatConversationsTable, 
  chatMessagesTable, 
  conversationMemoriesTable, 
  userMemoriesTable 
} from '@/db/schema';

export async function GET(
  req: NextRequest,
  { params }: { params: { uuid: string; conversationId: string } }
) {
  try {
    const { uuid, conversationId } = params;
    
    // 1. Check if conversation exists
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (!conversation) {
      return NextResponse.json({
        success: false,
        error: 'Conversation not found',
        diagnostics: {
          conversationExists: false,
          messageCount: 0,
          conversationMemories: 0,
          userMemories: 0,
          memorySystemEnabled: false,
          issues: ['Conversation does not exist']
        }
      }, { status: 404 });
    }
    
    // 2. Get message count for this conversation
    const [messageCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversation_uuid, conversationId));
    
    // 3. Check conversation memories
    const conversationMemories = await db
      .select()
      .from(conversationMemoriesTable)
      .where(eq(conversationMemoriesTable.conversation_id, conversationId))
      .orderBy(desc(conversationMemoriesTable.created_at))
      .limit(10);
    
    // 4. Check user memories (if we have a user ID)
    let userMemories: any[] = [];
    let userId = null;
    
    // Try to get user ID from the conversation
    if (conversation.visitor_id) {
      const visitorInfo = {
        visitor_id: conversation.visitor_id,
        visitor_name: conversation.visitor_name,
        visitor_email: conversation.visitor_email,
        visitor_ip: conversation.visitor_ip,
        visitor_user_agent: conversation.visitor_user_agent
      };
      // Use visitor_id as the user identifier for memories
      userId = visitorInfo.visitor_id;
    }
    
    // If no user ID in visitor_info, check if there's any user memory associated with this conversation
    if (!userId && conversationMemories.length > 0) {
      userId = conversationMemories[0].owner_id;
    }
    
    if (userId) {
      userMemories = await db
        .select()
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.owner_id, userId))
        .orderBy(desc(userMemoriesTable.created_at))
        .limit(10);
    }
    
    // 5. Check for memory-related issues
    const issues: string[] = [];
    
    if (messageCount.count === 0) {
      issues.push('No messages found in conversation');
    }
    
    if (messageCount.count > 0 && conversationMemories.length === 0) {
      issues.push('Messages exist but no conversation memories found');
    }
    
    if (userId && userMemories.length === 0) {
      issues.push('User ID found but no user memories exist');
    }
    
    // 6. Check memory system configuration
    const memorySystemEnabled = process.env.OPENAI_API_KEY ? true : false;
    
    if (!memorySystemEnabled) {
      issues.push('OPENAI_API_KEY not configured - memory system disabled');
    }
    
    // 7. Get recent messages to analyze for potential memory content
    const recentMessages = await db
      .select({
        id: chatMessagesTable.id,
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
        createdAt: chatMessagesTable.created_at
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversation_uuid, conversationId))
      .orderBy(desc(chatMessagesTable.created_at))
      .limit(5);
    
    // 8. Analyze messages for potential memory-worthy content
    const potentialMemoryContent = recentMessages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
        hasPersonalInfo: /(name|email|phone|address|preference|like|dislike)/i.test(msg.content),
        hasTaskInfo: /(task|todo|remember|don't forget|need to|should)/i.test(msg.content),
        hasDecisionInfo: /(decide|decision|choose|selected|went with)/i.test(msg.content)
      }));
    
    return NextResponse.json({
      success: true,
      diagnostics: {
        conversationExists: true,
        conversationId,
        userId,
        messageCount: messageCount.count,
        conversationMemories: conversationMemories.length,
        userMemories: userMemories.length,
        memorySystemEnabled,
        issues,
        recentMessageAnalysis: potentialMemoryContent,
        sampleConversationMemories: conversationMemories.slice(0, 3).map(m => ({
          id: m.id,
          content: m.value_jsonb,
          factType: m.kind,
          importance: m.salience,
          createdAt: m.created_at
        })),
        sampleUserMemories: userMemories.slice(0, 3).map(m => ({
          id: m.id,
          content: m.value_jsonb,
          factType: m.kind,
          importance: m.salience,
          createdAt: m.created_at
        })),
        recommendations: generateRecommendations({
          messageCount: messageCount.count,
          conversationMemories: conversationMemories.length,
          userMemories: userMemories.length,
          issues,
          memorySystemEnabled,
          potentialMemoryContent
        })
      }
    });
    
  } catch (error) {
    console.error('Memory diagnostics error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      diagnostics: {
        conversationExists: false,
        messageCount: 0,
        conversationMemories: 0,
        userMemories: 0,
        memorySystemEnabled: false,
        issues: ['Diagnostic system error']
      }
    }, { status: 500 });
  }
}

function generateRecommendations(data: {
  messageCount: number;
  conversationMemories: number;
  userMemories: number;
  issues: string[];
  memorySystemEnabled: boolean;
  potentialMemoryContent: any[];
}): string[] {
  const recommendations: string[] = [];
  
  if (!data.memorySystemEnabled) {
    recommendations.push('Configure OPENAI_API_KEY to enable memory extraction');
  }
  
  if (data.messageCount > 0 && data.conversationMemories === 0) {
    recommendations.push('Memory extraction may not be working - check memory processing logs');
    
    // Check if messages contain memory-worthy content
    const hasMemoryContent = data.potentialMemoryContent.some(msg => 
      msg.hasPersonalInfo || msg.hasTaskInfo || msg.hasDecisionInfo
    );
    
    if (hasMemoryContent) {
      recommendations.push('Messages contain potential memory content but no memories were extracted');
    }
  }
  
  if (data.conversationMemories > 0 && data.userMemories === 0) {
    recommendations.push('Conversation memories exist but no user memories - memory promotion may not be working');
  }
  
  if (data.issues.includes('No messages found in conversation')) {
    recommendations.push('Send some messages in the conversation to test memory extraction');
  }
  
  if (data.issues.length === 0 && data.conversationMemories > 0) {
    recommendations.push('Memory system appears to be working correctly');
  }
  
  return recommendations;
}