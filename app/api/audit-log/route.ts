import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { logAuditEvent } from '@/app/actions/audit-logger';

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    const profileUuid = session?.user?.id;
    
    // Get request data
    const data = await request.json();
    
    // Get standard headers - in Next.js 15, headers() is async
    const headersList = await headers();
    
    // First, check if we have headers passed from middleware
    const requestStartTime = headersList.get('x-request-start-time');
    
    if (requestStartTime) {
      // This is coming from middleware
      const endTime = Date.now();
      const startTime = parseInt(requestStartTime);
      const responseTimeMs = endTime - startTime;
      
      // Log using data from headers
      await logAuditEvent({
        profileUuid,
        type: 'API_CALL',
        action: data.action || 'API_REQUEST',
        requestPath: headersList.get('x-request-path'),
        requestMethod: headersList.get('x-request-method'),
        requestBody: data.requestBody,
        responseTimeMs,
        user_agent: headersList.get('x-user-agent') || '',
        ip_address: headersList.get('x-ip-address') || '127.0.0.1'
      });
    } else {
      // This is a direct call to the audit log API
      const userAgent = headersList.get('user-agent') || '';
      const forwardedFor = headersList.get('x-forwarded-for');
      const realIp = headersList.get('x-real-ip');
      const ip = forwardedFor || realIp || '127.0.0.1';
      
      // Log with data from request
      await logAuditEvent({
        ...data,
        profileUuid,
        user_agent: userAgent,
        ip_address: typeof ip === 'string' ? ip : ip.split(',')[0]
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging audit event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log audit event' },
      { status: 500 }
    );
  }
} 