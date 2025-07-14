'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { playgroundSettingsTable } from '@/db/schema';

export type PlaygroundSettings = {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  temperature: number;
  maxTokens: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  ragEnabled?: boolean;
};

export async function getPlaygroundSettings(profileUuid: string) {
  try {
    const settings = await db.query.playgroundSettingsTable.findFirst({
      where: eq(playgroundSettingsTable.profile_uuid, profileUuid),
    });

    if (!settings) {
      // Return default settings if none exist
      return {
        success: true,
        settings: {
          provider: 'anthropic',
          model: 'claude-3-7-sonnet-20250219',
          temperature: 0,
          maxTokens: 1000,
          logLevel: 'info',
          ragEnabled: false,
        } as PlaygroundSettings,
      };
    }

    return {
      success: true,
      settings: {
        provider: settings.provider as 'anthropic' | 'openai' | 'google',
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.max_tokens,
        logLevel: settings.log_level as 'error' | 'warn' | 'info' | 'debug',
        ragEnabled: settings.rag_enabled || false,
      } as PlaygroundSettings,
    };
  } catch (error) {
    console.error('Failed to get playground settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get settings',
    };
  }
}

export async function updatePlaygroundSettings(
  profileUuid: string,
  settings: PlaygroundSettings
) {
  try {
    // Validate settings
    if (!['anthropic', 'openai', 'google'].includes(settings.provider)) {
      throw new Error('Invalid provider');
    }
    if (!['error', 'warn', 'info', 'debug'].includes(settings.logLevel)) {
      throw new Error('Invalid log level');
    }
    if (settings.temperature < 0 || settings.temperature > 1) {
      throw new Error('Temperature must be between 0 and 1');
    }
    if (settings.maxTokens < 100 || settings.maxTokens > 4000) {
      throw new Error('Max tokens must be between 100 and 4000');
    }

    // Check if settings exist
    const existingSettings = await db.query.playgroundSettingsTable.findFirst({
      where: eq(playgroundSettingsTable.profile_uuid, profileUuid),
    });

    if (existingSettings) {
      // Update existing settings
      await db
        .update(playgroundSettingsTable)
        .set({
          provider: settings.provider,
          model: settings.model,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          log_level: settings.logLevel,
          rag_enabled: settings.ragEnabled || false,
          updated_at: new Date(),
        })
        .where(eq(playgroundSettingsTable.profile_uuid, profileUuid));
    } else {
      // Create new settings
      await db.insert(playgroundSettingsTable).values({
        profile_uuid: profileUuid,
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        log_level: settings.logLevel,
        rag_enabled: settings.ragEnabled || false,
      });
    }

    return {
      success: true,
      settings,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings',
    };
  }
} 