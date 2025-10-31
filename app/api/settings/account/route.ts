import { eq } from 'drizzle-orm';
import { unlink } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';

import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { notifyAdmins } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';
import { validateCSRF } from '@/lib/csrf-protection';

export async function DELETE(req: NextRequest) {
  // Validate CSRF token for this critical operation (account deletion)
  const csrfError = await validateCSRF(req);
  if (csrfError) return csrfError;

  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user exists before attempting deletion
    const userExists = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!userExists) {
      // If user doesn't exist, clear their session
      await db.delete(sessions).where(eq(sessions.userId, session.user.id));
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Store user info for GDPR logging before deletion
    const userInfo = {
      id: session.user.id,
      email: session.user.email || 'unknown',
      name: session.user.name || 'unknown',
      deletionTime: new Date().toISOString(),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    };

    // Start a transaction to ensure all deletions succeed or none do
    await db.transaction(async (tx) => {
      // Try to delete avatar file if it exists (do this first since it's outside DB)
      if (session.user.image?.startsWith('/avatars/')) {
        try {
          const avatarPath = join(process.cwd(), 'public', session.user.image);
          await unlink(avatarPath);
        } catch (error) {
          // Log but don't fail the deletion if avatar deletion fails
          console.error('Failed to delete avatar file:', error);
        }
      }

      // Delete the user - CASCADE constraints will handle all related data
      // This includes:
      // - accounts (OAuth providers)
      // - sessions
      // - projects -> profiles -> mcp_servers, tools, prompts, resources, etc.
      // - documents, notifications, followers, email tracking
      // - shared servers and collections (now with GDPR fix)
      // - registry servers claimed by user (now with GDPR fix)
      await tx
        .delete(users)
        .where(eq(users.id, session.user.id));
    });

    // Log GDPR compliance - account deletion
    console.log('[GDPR Compliance] User account deleted:', {
      userId: userInfo.id,
      email: userInfo.email,
      timestamp: userInfo.deletionTime,
      ip: userInfo.ipAddress,
      reason: 'User requested account deletion'
    });

    // Notify admins about account deletion (for GDPR audit trail)
    try {
      await notifyAdmins({
        subject: 'User Account Deleted (GDPR)',
        title: 'User Account Deletion',
        message: `A user has deleted their account in compliance with GDPR right to be forgotten.`,
        severity: 'INFO',
        metadata: {
          ...userInfo,
          gdprCompliance: true,
          dataDeleted: [
            'User account and profile',
            'All projects and profiles',
            'All MCP servers and configurations',
            'All documents and RAG data',
            'All shared servers and collections',
            'All notifications and email data',
            'All OAuth connections',
            'All active sessions'
          ]
        },
        userDetails: {
          id: userInfo.id,
          email: userInfo.email,
          name: userInfo.name
        }
      });
    } catch (error) {
      // Don't fail deletion if admin notification fails
      console.error('Failed to send admin notification:', error);
    }

    // Clear the session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete('next-auth.session-token');
    response.cookies.delete('__Secure-next-auth.session-token');
    return response;
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account. Please try again later.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getAuthSession();
    
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    
    // Return user account information
    return NextResponse.json({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image
    });
  } catch (error) {
    console.error('Error fetching account information:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
