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
async function getConnectedAccountsForUser(_userId: string): Promise<string[]> { // Prefix unused userId with _
  // In a real implementation, you would query your database
  // to get the connected accounts for the user
  
  // For now, we'll return an empty array
  return [];
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const url = new URL(request.url);
    const _userId = url.searchParams.get('userId');
    const provider = url.searchParams.get('provider');
    
    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Provider is required' },
        { status: 400 }
      );
    }
    
    // Remove the connected account
    // This is a placeholder - replace with your actual implementation
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing connected account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove connected account' },
      { status: 500 }
    );
  }
}
