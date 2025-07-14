'use server';

import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { codesTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

const uuidSchema = z.string().uuid();
const fileNameSchema = z.string().min(1).max(255);
const codeSchema = z.string();

export async function getCodes() {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to view codes');
  }

  return await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.user_id, session.user.id))
    .orderBy(desc(codesTable.created_at));
}

export async function getCode(uuid: string) {
  // Validate input
  const validatedUuid = uuidSchema.parse(uuid);
  
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to view code');
  }

  const results = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, validatedUuid));
    
  if (results.length === 0) {
    throw new Error('Code not found');
  }
  
  // Verify the code belongs to the current user
  if (results[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this code');
  }
  
  return results[0];
}

export async function createCode(fileName: string, code: string) {
  // Validate input
  const validatedFileName = fileNameSchema.parse(fileName);
  const validatedCode = codeSchema.parse(code);
  
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to create code');
  }

  const results = await db
    .insert(codesTable)
    .values({
      fileName: validatedFileName,
      code: validatedCode,
      user_id: session.user.id,
    })
    .returning();
  return results[0];
}

export async function updateCode(uuid: string, fileName: string, code: string) {
  // Validate input
  const validatedUuid = uuidSchema.parse(uuid);
  const validatedFileName = fileNameSchema.parse(fileName);
  const validatedCode = codeSchema.parse(code);
  
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to update code');
  }

  // Verify the code belongs to the current user
  const existingCode = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, validatedUuid));
    
  if (existingCode.length === 0) {
    throw new Error('Code not found');
  }
  
  if (existingCode[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this code');
  }

  const results = await db
    .update(codesTable)
    .set({
      fileName: validatedFileName,
      code: validatedCode,
    })
    .where(eq(codesTable.uuid, validatedUuid))
    .returning();
  return results[0];
}

export async function deleteCode(uuid: string) {
  // Validate input
  const validatedUuid = uuidSchema.parse(uuid);
  
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to delete code');
  }

  // Verify the code belongs to the current user
  const existingCode = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, validatedUuid));
    
  if (existingCode.length === 0) {
    throw new Error('Code not found');
  }
  
  if (existingCode[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this code');
  }

  const results = await db
    .delete(codesTable)
    .where(eq(codesTable.uuid, validatedUuid))
    .returning();
  return results[0];
}
