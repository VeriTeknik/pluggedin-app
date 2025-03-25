import { NextRequest, NextResponse } from 'next/server';

import { addMissingForeignKeyConstraint } from '@/app/actions/db-migrations';

// This route is meant to be called manually by an administrator or during deployment
// to apply database migrations that weren't properly applied through Drizzle
export async function GET(req: NextRequest) {
  // Basic auth check - in a real app, this would be more secure
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized. This endpoint requires authentication.' },
      { status: 401 }
    );
  }

  const result = await addMissingForeignKeyConstraint();
  
  return NextResponse.json(result);
} 