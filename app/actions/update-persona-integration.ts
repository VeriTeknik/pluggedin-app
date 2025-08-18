'use server';

import { db } from '@/db';
import { chatPersonasTable, embeddedChatsTable, projectsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface UpdatePersonaIntegrationParams {
  personaId: number;
  integrationType: 'calendar' | 'communication';
  integrationConfig: any;
}

async function verifyPersonaOwnership(personaId: number, userId: string): Promise<boolean> {
  // Verify that the persona belongs to a chat owned by the user
  const result = await db
    .select({
      id: chatPersonasTable.id
    })
    .from(chatPersonasTable)
    .innerJoin(embeddedChatsTable, eq(chatPersonasTable.embedded_chat_uuid, embeddedChatsTable.uuid))
    .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
    .where(
      and(
        eq(chatPersonasTable.id, personaId),
        eq(projectsTable.user_id, userId)
      )
    )
    .limit(1);

  return result.length > 0;
}

export async function updatePersonaIntegration({
  personaId,
  integrationType,
  integrationConfig
}: UpdatePersonaIntegrationParams) {
  try {
    // Get current user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized: No active session'
      };
    }

    // Verify the user owns this persona
    const isOwner = await verifyPersonaOwnership(personaId, session.user.id);
    if (!isOwner) {
      console.error(`[UpdatePersonaIntegration] Unauthorized access attempt by user ${session.user.id} for persona ${personaId}`);
      return {
        success: false,
        error: 'Unauthorized: You do not have permission to update this persona'
      };
    }

    // Get the current persona
    const persona = await db
      .select()
      .from(chatPersonasTable)
      .where(eq(chatPersonasTable.id, personaId))
      .limit(1);

    if (!persona || persona.length === 0) {
      return {
        success: false,
        error: 'Persona not found'
      };
    }

    const currentIntegrations = persona[0].integrations || {};
    
    // Update the specific integration config
    const updatedIntegrations = {
      ...currentIntegrations,
      [integrationType]: integrationConfig
    };

    // Save back to database
    await db
      .update(chatPersonasTable)
      .set({
        integrations: updatedIntegrations
      })
      .where(eq(chatPersonasTable.id, personaId));

    console.log(`[UpdatePersonaIntegration] Successfully updated ${integrationType} integration for persona ${personaId}`);

    return {
      success: true,
      data: updatedIntegrations
    };
  } catch (error) {
    console.error('[UpdatePersonaIntegration] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update integration'
    };
  }
}

export async function updateCalendarTokens(
  personaId: number,
  accessToken: string,
  refreshToken?: string
) {
  try {
    // Validate inputs
    if (!personaId || typeof personaId !== 'number') {
      return {
        success: false,
        error: 'Invalid persona ID'
      };
    }

    if (!accessToken || typeof accessToken !== 'string' || accessToken.length > 2048) {
      return {
        success: false,
        error: 'Invalid access token'
      };
    }

    if (refreshToken && (typeof refreshToken !== 'string' || refreshToken.length > 512)) {
      return {
        success: false,
        error: 'Invalid refresh token'
      };
    }

    // Get current user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized: No active session'
      };
    }

    // Verify the user owns this persona
    const isOwner = await verifyPersonaOwnership(personaId, session.user.id);
    if (!isOwner) {
      console.error(`[UpdateCalendarTokens] Unauthorized access attempt by user ${session.user.id} for persona ${personaId}`);
      return {
        success: false,
        error: 'Unauthorized: You do not have permission to update this persona'
      };
    }

    // Get the current persona
    const persona = await db
      .select()
      .from(chatPersonasTable)
      .where(eq(chatPersonasTable.id, personaId))
      .limit(1);

    if (!persona || persona.length === 0) {
      return {
        success: false,
        error: 'Persona not found'
      };
    }

    const currentIntegrations = persona[0].integrations || {};
    const calendarIntegration = currentIntegrations.calendar || {};
    
    // Update the tokens
    const updatedCalendarIntegration = {
      ...calendarIntegration,
      config: {
        ...calendarIntegration.config,
        accessToken,
        ...(refreshToken && { refreshToken })
      }
    };

    const updatedIntegrations = {
      ...currentIntegrations,
      calendar: updatedCalendarIntegration
    };

    // Save back to database
    await db
      .update(chatPersonasTable)
      .set({
        integrations: updatedIntegrations
      })
      .where(eq(chatPersonasTable.id, personaId));

    console.log(`[UpdateCalendarTokens] Successfully updated calendar tokens for persona ${personaId}`);

    return {
      success: true,
      data: updatedCalendarIntegration
    };
  } catch (error) {
    console.error('[UpdateCalendarTokens] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update calendar tokens'
    };
  }
}