import { NextRequest, NextResponse } from 'next/server';
import { cleanupStaleConversations } from '@/app/actions/cleanup-conversations';

export async function GET(req: NextRequest) {
  try {
    // Optionally check for a secret to secure the endpoint
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Run cleanup
    const result = await cleanupStaleConversations();
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Cleaned up ${result.cleanedCount} stale conversations`,
      cleanedCount: result.cleanedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in cleanup cron job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}