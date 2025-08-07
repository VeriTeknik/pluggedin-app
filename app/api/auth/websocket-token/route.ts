import { sign } from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { createApiError } from '@/lib/api-errors';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        createApiError('Unauthorized', 401),
        { status: 401 }
      );
    }
    
    // Generate JWT token for WebSocket authentication
    const token = sign(
      {
        sub: session.user.id,
        email: session.user.email,
        name: session.user.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiry
      },
      process.env.NEXTAUTH_SECRET!,
      {
        algorithm: 'HS256'
      }
    );
    
    return NextResponse.json({ token });
    
  } catch (error) {
    console.error('Error generating WebSocket token:', error);
    return NextResponse.json(
      createApiError('Failed to generate token'),
      { status: 500 }
    );
  }
}