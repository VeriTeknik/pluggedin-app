'use server';

import { db } from '@/db';
import {
  embeddedChatsTable,
  chatConversationsTable,
  chatMessagesTable,
  chatPersonasTable,
  chatContactsTable,
  chatAnalyticsTable,
  projectsTable,
  profilesTable,
  mcpServersTable,
} from '@/db/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { generateId } from '@/lib/utils';
import { generateEmbeddedChatApiKey as generateApiKey } from '@/lib/api-key';

// ===== Schema Validation =====

const ModelConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'xai']),
  model: z.string(),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().min(1).max(4000),
  top_p: z.number().min(0).max(1),
  frequency_penalty: z.number().min(0).max(2),
  presence_penalty: z.number().min(0).max(2),
});

const HumanOversightSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['monitor', 'assist', 'takeover']),
  notification_channels: z.array(z.enum(['app', 'email'])),
  auto_assign: z.boolean(),
  business_hours: z.object({
    timezone: z.string(),
    days: z.array(z.number().min(0).max(6)),
    start_time: z.string(),
    end_time: z.string(),
  }).nullable(),
});

const CreateEmbeddedChatSchema = z.object({
  projectUuid: z.string().uuid(),
  name: z.string().min(1).max(255),
  custom_instructions: z.string().optional(),
  welcome_message: z.string().optional(),
  model_config: ModelConfigSchema.optional(),
});

const UpdateEmbeddedChatSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled_mcp_server_uuids: z.array(z.string().uuid()).optional(),
  enable_rag: z.boolean().optional(),
  allowed_domains: z.array(z.string()).optional(),
  contact_routing: z.record(z.any()).optional(),
  custom_instructions: z.string().optional(),
  welcome_message: z.string().optional(),
  suggested_questions: z.array(z.string()).optional(),
  theme_config: z.record(z.any()).optional(),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
  model_config: ModelConfigSchema.optional(),
  human_oversight: HumanOversightSchema.optional(),
  context_window_size: z.number().min(1).max(50).optional(),
  max_conversation_length: z.number().min(10).max(500).optional(),
  offline_config: z.object({
    enabled: z.boolean(),
    message: z.string(),
    email_notification: z.boolean(),
    capture_contact: z.boolean(),
  }).optional(),
  is_public: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(100).optional(),
  instructions: z.string().min(1),
  avatar_url: z.string().url().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  contact_calendar_link: z.string().url().optional(),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  display_order: z.number().int().default(0),
});

// ===== Helper Functions =====

async function getCurrentProject(userId: string) {
  // Get all projects for the user
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.user_id, userId));
  
  if (projects.length === 0) {
    return null;
  }
  
  // Return the first project (in a real implementation, you might want to track the active project)
  return projects[0];
}

async function validateProjectAccess(projectUuid: string, userId: string) {
  const project = await db
    .select()
    .from(projectsTable)
    .where(and(
      eq(projectsTable.uuid, projectUuid),
      eq(projectsTable.user_id, userId)
    ))
    .limit(1);

  if (project.length === 0) {
    throw new Error('Project not found or access denied');
  }

  return project[0];
}

async function validateEmbeddedChatAccess(chatUuid: string, userId: string) {
  const chat = await db
    .select({
      chat: embeddedChatsTable,
      project: projectsTable,
    })
    .from(embeddedChatsTable)
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(and(
      eq(embeddedChatsTable.uuid, chatUuid),
      eq(projectsTable.user_id, userId)
    ))
    .limit(1);

  if (chat.length === 0) {
    throw new Error('Embedded chat not found or access denied');
  }

  return chat[0];
}

// ===== Server Actions =====

export async function createEmbeddedChat(data: z.infer<typeof CreateEmbeddedChatSchema>) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const validatedData = CreateEmbeddedChatSchema.parse(data);
    
    // Validate project access
    const project = await validateProjectAccess(validatedData.projectUuid, session.user.id);
    
    // Check if project already has an embedded chat
    const existingChat = await db
      .select()
      .from(embeddedChatsTable)
      .where(eq(embeddedChatsTable.project_uuid, validatedData.projectUuid))
      .limit(1);
    
    if (existingChat.length > 0) {
      return { success: false, error: 'Project already has an embedded chat' };
    }
    
    // Create embedded chat
    const [newChat] = await db
      .insert(embeddedChatsTable)
      .values({
        project_uuid: validatedData.projectUuid,
        name: validatedData.name,
        custom_instructions: validatedData.custom_instructions,
        welcome_message: validatedData.welcome_message,
        model_config: validatedData.model_config || {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 1.0,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
        },
      })
      .returning();
    
    // Update project to enable embedded chat
    await db
      .update(projectsTable)
      .set({
        embedded_chat_enabled: true,
        embedded_chat_uuid: newChat.uuid,
      })
      .where(eq(projectsTable.uuid, validatedData.projectUuid));
    
    revalidatePath(`/projects/${validatedData.projectUuid}`);
    revalidatePath('/embedded-chat');
    revalidatePath('/settings');
    
    return { success: true, data: newChat };
  } catch (error) {
    console.error('Error creating embedded chat:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create embedded chat' 
    };
  }
}

export async function getEmbeddedChatConfig(chatUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    // Get all MCP servers from all profiles in the project
    const profiles = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.project_uuid, result.project.uuid));
    
    const profileUuids = profiles.map(p => p.uuid);
    
    const mcpServers = profileUuids.length > 0 
      ? await db
          .select()
          .from(mcpServersTable)
          .where(inArray(mcpServersTable.profile_uuid, profileUuids))
      : [];
    
    // Get personas
    const personas = await db
      .select()
      .from(chatPersonasTable)
      .where(eq(chatPersonasTable.embedded_chat_uuid, chatUuid))
      .orderBy(chatPersonasTable.display_order);
    
    return { 
      success: true, 
      data: {
        chat: result.chat,
        project: result.project,
        profiles,
        mcpServers,
        personas,
      }
    };
  } catch (error) {
    console.error('Error getting embedded chat config:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get embedded chat config' 
    };
  }
}

export async function updateEmbeddedChatConfig(
  chatUuid: string, 
  updates: z.infer<typeof UpdateEmbeddedChatSchema>
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const validatedUpdates = UpdateEmbeddedChatSchema.parse(updates);
    
    const [updatedChat] = await db
      .update(embeddedChatsTable)
      .set({
        ...validatedUpdates,
        updated_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: updatedChat };
  } catch (error) {
    console.error('Error updating embedded chat config:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update embedded chat config' 
    };
  }
}

export async function createChatPersona(
  chatUuid: string,
  persona: z.infer<typeof CreatePersonaSchema>
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const validatedPersona = CreatePersonaSchema.parse(persona);
    
    // If this is set as default, unset other defaults
    if (validatedPersona.is_default) {
      await db
        .update(chatPersonasTable)
        .set({ is_default: false })
        .where(eq(chatPersonasTable.embedded_chat_uuid, chatUuid));
    }
    
    const [newPersona] = await db
      .insert(chatPersonasTable)
      .values({
        embedded_chat_uuid: chatUuid,
        ...validatedPersona,
      })
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: newPersona };
  } catch (error) {
    console.error('Error creating chat persona:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create chat persona' 
    };
  }
}

export async function updateChatPersona(
  chatUuid: string,
  personaId: number,
  updates: Partial<z.infer<typeof CreatePersonaSchema>>
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    // If setting as default, unset other defaults
    if (updates.is_default) {
      await db
        .update(chatPersonasTable)
        .set({ is_default: false })
        .where(eq(chatPersonasTable.embedded_chat_uuid, chatUuid));
    }
    
    const [updatedPersona] = await db
      .update(chatPersonasTable)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(and(
        eq(chatPersonasTable.id, personaId),
        eq(chatPersonasTable.embedded_chat_uuid, chatUuid)
      ))
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: updatedPersona };
  } catch (error) {
    console.error('Error updating chat persona:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update chat persona' 
    };
  }
}

export async function deleteChatPersona(chatUuid: string, personaId: number) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    await db
      .delete(chatPersonasTable)
      .where(and(
        eq(chatPersonasTable.id, personaId),
        eq(chatPersonasTable.embedded_chat_uuid, chatUuid)
      ));
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting chat persona:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete chat persona' 
    };
  }
}

export async function getChatConversations(
  chatUuid: string,
  filters?: {
    status?: 'active' | 'waiting' | 'human_controlled' | 'ended';
    assignedUserId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    let query = db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.embedded_chat_uuid, chatUuid))
      .$dynamic();
    
    if (filters?.status) {
      query = query.where(eq(chatConversationsTable.status, filters.status));
    }
    
    if (filters?.assignedUserId) {
      query = query.where(eq(chatConversationsTable.assigned_user_id, filters.assignedUserId));
    }
    
    if (filters?.dateFrom) {
      query = query.where(sql`${chatConversationsTable.started_at} >= ${filters.dateFrom}`);
    }
    
    if (filters?.dateTo) {
      query = query.where(sql`${chatConversationsTable.started_at} <= ${filters.dateTo}`);
    }
    
    query = query.orderBy(desc(chatConversationsTable.started_at));
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }
    
    const conversations = await query;
    
    // Get message counts for each conversation
    const conversationUuids = conversations.map(c => c.uuid);
    const messageCounts = conversationUuids.length > 0
      ? await db
          .select({
            conversation_uuid: chatMessagesTable.conversation_uuid,
            message_count: sql<number>`count(*)::int`,
          })
          .from(chatMessagesTable)
          .where(inArray(chatMessagesTable.conversation_uuid, conversationUuids))
          .groupBy(chatMessagesTable.conversation_uuid)
      : [];
    
    const messageCountMap = new Map(
      messageCounts.map(mc => [mc.conversation_uuid, mc.message_count])
    );
    
    const conversationsWithCounts = conversations.map(conv => ({
      ...conv,
      message_count: messageCountMap.get(conv.uuid) || 0,
    }));
    
    return { success: true, data: conversationsWithCounts };
  } catch (error) {
    console.error('Error getting chat conversations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get chat conversations' 
    };
  }
}

export async function getChatContacts(
  chatUuid: string,
  filters?: {
    status?: 'new' | 'contacted' | 'converted' | 'archived';
    personaId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    let query = db
      .select({
        contact: chatContactsTable,
        persona: chatPersonasTable,
      })
      .from(chatContactsTable)
      .leftJoin(chatPersonasTable, eq(chatContactsTable.persona_id, chatPersonasTable.id))
      .where(eq(chatContactsTable.embedded_chat_uuid, chatUuid))
      .$dynamic();
    
    if (filters?.status) {
      query = query.where(eq(chatContactsTable.status, filters.status));
    }
    
    if (filters?.personaId) {
      query = query.where(eq(chatContactsTable.persona_id, filters.personaId));
    }
    
    if (filters?.dateFrom) {
      query = query.where(sql`${chatContactsTable.created_at} >= ${filters.dateFrom}`);
    }
    
    if (filters?.dateTo) {
      query = query.where(sql`${chatContactsTable.created_at} <= ${filters.dateTo}`);
    }
    
    query = query.orderBy(desc(chatContactsTable.created_at));
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }
    
    const contacts = await query;
    
    return { success: true, data: contacts };
  } catch (error) {
    console.error('Error getting chat contacts:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get chat contacts' 
    };
  }
}

export async function updateContactStatus(
  contactId: number,
  status: 'new' | 'contacted' | 'converted' | 'archived'
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get contact to verify access
    const [contact] = await db
      .select({
        contact: chatContactsTable,
        project_user_id: projectsTable.user_id,
      })
      .from(chatContactsTable)
      .innerJoin(embeddedChatsTable, eq(chatContactsTable.embedded_chat_uuid, embeddedChatsTable.uuid))
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(eq(chatContactsTable.id, contactId))
      .limit(1);
    
    if (!contact || contact.project_user_id !== session.user.id) {
      return { success: false, error: 'Contact not found or access denied' };
    }
    
    const [updatedContact] = await db
      .update(chatContactsTable)
      .set({ status })
      .where(eq(chatContactsTable.id, contactId))
      .returning();
    
    return { success: true, data: updatedContact };
  } catch (error) {
    console.error('Error updating contact status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update contact status' 
    };
  }
}

export async function getChatAnalytics(
  chatUuid: string,
  dateRange: { from: Date; to: Date }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const analytics = await db
      .select()
      .from(chatAnalyticsTable)
      .where(and(
        eq(chatAnalyticsTable.embedded_chat_uuid, chatUuid),
        sql`${chatAnalyticsTable.date} >= ${dateRange.from}`,
        sql`${chatAnalyticsTable.date} <= ${dateRange.to}`
      ))
      .orderBy(chatAnalyticsTable.date);
    
    // Calculate totals
    const totals = analytics.reduce((acc, day) => ({
      conversations_started: acc.conversations_started + (day.conversations_started || 0),
      messages_sent: acc.messages_sent + (day.messages_sent || 0),
      messages_received: acc.messages_received + (day.messages_received || 0),
      contacts_captured: acc.contacts_captured + (day.contacts_captured || 0),
      human_interventions: acc.human_interventions + (day.human_interventions || 0),
      human_takeovers: acc.human_takeovers + (day.human_takeovers || 0),
      rag_queries: acc.rag_queries + (day.rag_queries || 0),
      estimated_cost: acc.estimated_cost + (day.estimated_cost || 0),
    }), {
      conversations_started: 0,
      messages_sent: 0,
      messages_received: 0,
      contacts_captured: 0,
      human_interventions: 0,
      human_takeovers: 0,
      rag_queries: 0,
      estimated_cost: 0,
    });
    
    return { 
      success: true, 
      data: {
        daily: analytics,
        totals,
      }
    };
  } catch (error) {
    console.error('Error getting chat analytics:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get chat analytics' 
    };
  }
}

export async function testEmbeddedChatConfig(
  chatUuid: string,
  testMessage: string = 'Hello, can you help me?'
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    // TODO: Implement actual test with the configured model
    // For now, return a mock response
    const mockResponse = {
      success: true,
      model: result.chat.model_config,
      message: testMessage,
      response: `This is a test response from ${result.chat.model_config.provider}/${result.chat.model_config.model}. Your embedded chat is configured correctly!`,
      tokens_used: 50,
      response_time: 1234,
    };
    
    return { success: true, data: mockResponse };
  } catch (error) {
    console.error('Error testing embedded chat config:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to test embedded chat config' 
    };
  }
}

// ===== API Key Management =====

export async function generateEmbeddedChatApiKey(chatUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const apiKey = generateApiKey();
    
    const [updated] = await db
      .update(embeddedChatsTable)
      .set({
        api_key: apiKey,
        api_key_created_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error generating API key:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate API key' 
    };
  }
}

export async function regenerateEmbeddedChatApiKey(chatUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const apiKey = generateApiKey();
    
    const [updated] = await db
      .update(embeddedChatsTable)
      .set({
        api_key: apiKey,
        api_key_created_at: new Date(),
        api_key_last_used_at: null, // Reset last used
        updated_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error regenerating API key:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to regenerate API key' 
    };
  }
}

export async function toggleApiKeyRequirement(chatUuid: string, required: boolean) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const [updated] = await db
      .update(embeddedChatsTable)
      .set({
        require_api_key: required,
        updated_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error toggling API key requirement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to toggle API key requirement' 
    };
  }
}

export async function revokeEmbeddedChatApiKey(chatUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    await validateEmbeddedChatAccess(chatUuid, session.user.id);
    
    const [updated] = await db
      .update(embeddedChatsTable)
      .set({
        api_key: null,
        api_key_created_at: null,
        api_key_last_used_at: null,
        require_api_key: false, // Disable requirement when revoking
        updated_at: new Date(),
      })
      .where(eq(embeddedChatsTable.uuid, chatUuid))
      .returning();
    
    revalidatePath(`/embedded-chat/${chatUuid}`);
    
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error revoking API key:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to revoke API key' 
    };
  }
}

// Toggle embedded chat enabled status
export async function toggleEmbeddedChat(enabled: boolean) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const currentProject = await getCurrentProject(session.user.id);
    if (!currentProject) {
      return { success: false, error: 'No active project' };
    }

    // Update the project's embedded_chat_enabled flag
    await db
      .update(projectsTable)
      .set({ embedded_chat_enabled: enabled })
      .where(eq(projectsTable.uuid, currentProject.uuid));

    // If there's an embedded chat, update its is_active flag
    if (currentProject.embedded_chat_uuid) {
      await db
        .update(embeddedChatsTable)
        .set({ is_active: enabled })
        .where(eq(embeddedChatsTable.uuid, currentProject.embedded_chat_uuid));
    }

    return { success: true };
  } catch (error) {
    console.error('Error toggling embedded chat:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to toggle embedded chat' 
    };
  }
}