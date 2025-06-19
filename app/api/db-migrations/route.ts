import { NextRequest, NextResponse } from 'next/server';

import { addMissingForeignKeyConstraint } from '@/app/actions/db-migrations';

// This route is meant to be called manually by an administrator or during deployment
// to apply database migrations that weren't properly applied through Drizzle
export async function GET(req: NextRequest) {
  // Secure authentication check using environment variable
  const authHeader = req.headers.get('authorization');
  const adminSecret = process.env.ADMIN_MIGRATION_SECRET;
  
  if (!adminSecret) {
    console.error('ADMIN_MIGRATION_SECRET not configured');
    return NextResponse.json(
      { error: 'Service unavailable' },
      { status: 503 }
    );
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== adminSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const result = await addMissingForeignKeyConstraint();
  
  return NextResponse.json(result);
} 