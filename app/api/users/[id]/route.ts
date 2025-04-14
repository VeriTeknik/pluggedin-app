import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, params.id),
      columns: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 