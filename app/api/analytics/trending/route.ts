import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  return NextResponse.json({ 
    error: 'Analytics service has been deprecated. Please use the new analytics service when it becomes available.',
    data: [] 
  }, { status: 503 });
}