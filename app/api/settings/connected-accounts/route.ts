'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (!userId || userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }
    
    // Get connected accounts from your database
    // This is a placeholder - replace with your actual implementation
    const accounts = await getConnectedAccountsForUser(userId);
    
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error('Error fetching connected accounts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch connected accounts' },
      { status: 500 }
    );
  }
}

// This is a placeholder function - replace with your actual implementation
async function getConnectedAccountsForUser(userId: string): Promise<string[]> {
  // In a real implementation, you would query your database
  // to get the connected accounts for the user
  
  // For now, we'll return an empty array
  return [];
}
