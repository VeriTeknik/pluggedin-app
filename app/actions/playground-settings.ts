'use server';

import { eq } from 'drizzle-orm';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { z } from 'zod';

import { db } from '@/db';
import { playgroundSettingsTable } from '@/db/schema';
import { withProfileAuth } from '@/lib/auth-helpers';

export type PlaygroundSettings = {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  temperature: number;
  maxTokens: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  ragEnabled?: boolean;
};

type PlaygroundSettingsResult =
  | { success: true; settings: PlaygroundSettings; error?: undefined }
  | { success: false; error: string; settings?: undefined };

const playgroundSettingsSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google'], { message: 'Invalid provider' }),
  model: z.string().min(1).max(200),
  temperature: z.number().min(0, 'Temperature must be between 0 and 1').max(1, 'Temperature must be between 0 and 1'),
  maxTokens: z.number().int().min(100, 'Max tokens must be between 100 and 4000').max(4000, 'Max tokens must be between 100 and 4000'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug'], { message: 'Invalid log level' }),
  ragEnabled: z.boolean().optional(),
});

// Both actions are callable from the client with any profileUuid, so every
// read and write happens inside withProfileAuth: the session must own the
// profile. A redirect (anonymous caller) is let through untouched; any other
// failure keeps the { success: false, error } shape the playground hook reads.

export async function getPlaygroundSettings(profileUuid: string): Promise<PlaygroundSettingsResult> {
  try {
    return await withProfileAuth(profileUuid, async (_session, profile): Promise<PlaygroundSettingsResult> => {
      const settings = await db.query.playgroundSettingsTable.findFirst({
        where: eq(playgroundSettingsTable.profile_uuid, profile.uuid),
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
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
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
): Promise<PlaygroundSettingsResult> {
  try {
    return await withProfileAuth(profileUuid, async (_session, profile): Promise<PlaygroundSettingsResult> => {
      const parsed = playgroundSettingsSchema.safeParse(settings);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || 'Invalid settings');
      }
      const valid = parsed.data;

      // Check if settings exist
      const existingSettings = await db.query.playgroundSettingsTable.findFirst({
        where: eq(playgroundSettingsTable.profile_uuid, profile.uuid),
      });

      if (existingSettings) {
        // Update existing settings
        await db
          .update(playgroundSettingsTable)
          .set({
            provider: valid.provider,
            model: valid.model,
            temperature: valid.temperature,
            max_tokens: valid.maxTokens,
            log_level: valid.logLevel,
            rag_enabled: valid.ragEnabled || false,
            updated_at: new Date(),
          })
          .where(eq(playgroundSettingsTable.profile_uuid, profile.uuid));
      } else {
        // Create new settings
        await db.insert(playgroundSettingsTable).values({
          profile_uuid: profile.uuid,
          provider: valid.provider,
          model: valid.model,
          temperature: valid.temperature,
          max_tokens: valid.maxTokens,
          log_level: valid.logLevel,
          rag_enabled: valid.ragEnabled || false,
        });
      }

      return {
        success: true,
        settings: valid as PlaygroundSettings,
      };
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings',
    };
  }
}
