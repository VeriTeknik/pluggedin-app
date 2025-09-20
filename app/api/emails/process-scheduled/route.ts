import { NextRequest, NextResponse } from 'next/server';

import { processScheduledEmails } from '@/lib/welcome-emails';

// This endpoint should be called by a cron job (e.g., every hour)
// You can use services like GitHub Actions, Vercel Cron, or external cron services

export async function POST(req: NextRequest) {
  try {
    // Optional: Add authentication to prevent unauthorized calls
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Process scheduled emails
    await processScheduledEmails();
    
    return NextResponse.json({
      success: true,
      message: 'Scheduled emails processed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing scheduled emails:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process scheduled emails',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing
export async function GET(req: NextRequest) {
  // In production, you might want to restrict this to development only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'GET method not allowed in production' },
      { status: 405 }
    );
  }
  
  return POST(req);
}