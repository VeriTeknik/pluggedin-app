'use server';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { codesTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

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
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to view code');
  }

  const results = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, uuid));
    
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
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to create code');
  }

  const results = await db
    .insert(codesTable)
    .values({
      fileName,
      code,
      user_id: session.user.id,
    })
    .returning();
  return results[0];
}

export async function updateCode(uuid: string, fileName: string, code: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to update code');
  }

  // Verify the code belongs to the current user
  const existingCode = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, uuid));
    
  if (existingCode.length === 0) {
    throw new Error('Code not found');
  }
  
  if (existingCode[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this code');
  }

  const results = await db
    .update(codesTable)
    .set({
      fileName,
      code,
    })
    .where(eq(codesTable.uuid, uuid))
    .returning();
  return results[0];
}

export async function deleteCode(uuid: string) {
  const session = await getAuthSession();
  
  if (!session || !session.user.id) {
    throw new Error('Unauthorized - you must be logged in to delete code');
  }

  // Verify the code belongs to the current user
  const existingCode = await db
    .select()
    .from(codesTable)
    .where(eq(codesTable.uuid, uuid));
    
  if (existingCode.length === 0) {
    throw new Error('Code not found');
  }
  
  if (existingCode[0].user_id !== session.user.id) {
    throw new Error('Unauthorized - you do not have access to this code');
  }

  const results = await db
    .delete(codesTable)
    .where(eq(codesTable.uuid, uuid))
    .returning();
  return results[0];
}
