import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';
import { auth as envAuth } from '@/lib/config/env';

const UpdateNotificationSchema = z.object({
  isRead: z.boolean().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Try to get userId from auth() (cookie-based)
    let userId = (await auth()).userId;
    
    // If no userId from cookies, try to get it from Bearer token
    if (!userId) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const { verifyToken } = await import('@clerk/nextjs/server');
          const verifiedToken = await verifyToken(token, {
            secretKey: envAuth.clerkSecretKey,
          });
          userId = verifiedToken.sub;
        } catch (error) {
          console.error('GET: Token verification failed:', error);
        }
      }
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization (will sync user if not exists)
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const notification = await db.notification.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        OR: [
          { userId: null }, // Organization-wide notifications
          { userId: user.id }, // User-specific notifications
        ],
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        userStatuses: {
          where: {
            userId: user.id,
          },
        },
      },
    });

    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Check if user has deleted this notification
    const userStatus = notification.userStatuses[0];
    if (userStatus?.isDeleted) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Return notification with user-specific read status
    const response = {
      ...notification,
      isRead: userStatus?.isRead || false,
      readAt: userStatus?.readAt || null,
      userStatuses: undefined, // Remove from response
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Try to get userId from auth() (cookie-based)
    let userId = (await auth()).userId;
    
    // If no userId from cookies, try to get it from Bearer token
    if (!userId) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const { verifyToken } = await import('@clerk/nextjs/server');
          const verifiedToken = await verifyToken(token, {
            secretKey: envAuth.clerkSecretKey,
          });
          userId = verifiedToken.sub;
        } catch (error) {
          console.error('PATCH: Token verification failed:', error);
        }
      }
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization (will sync user if not exists)
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = UpdateNotificationSchema.parse(body);

    // Check if notification exists and user has access
    const existingNotification = await db.notification.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        OR: [
          { userId: null },
          { userId: user.id },
        ],
        deletedAt: null,
      },
      include: {
        userStatuses: {
          where: {
            userId: user.id,
          },
        },
      },
    });

    if (!existingNotification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Check if user has deleted this notification
    const userStatus = existingNotification.userStatuses[0];
    if (userStatus?.isDeleted) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Update or create user status
    let updatedUserStatus;
    if (userStatus) {
      // Update existing status
      const updateData: any = {};
      if (validatedData.isRead !== undefined) {
        updateData.isRead = validatedData.isRead;
        if (validatedData.isRead === true && !userStatus.isRead) {
          updateData.readAt = new Date();
        }
      }
      
      updatedUserStatus = await db.notificationUserStatus.update({
        where: { id: userStatus.id },
        data: updateData,
      });
    } else {
      // Create new status record
      updatedUserStatus = await db.notificationUserStatus.create({
        data: {
          notificationId: params.id,
          userId: user.id,
          isRead: validatedData.isRead || false,
          readAt: validatedData.isRead ? new Date() : null,
        },
      });
    }

    // Get updated notification with user status
    const notification = await db.notification.findFirst({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        userStatuses: {
          where: {
            userId: user.id,
          },
        },
      },
    });

    // Return notification with user-specific status
    const response = {
      ...notification,
      isRead: updatedUserStatus.isRead,
      readAt: updatedUserStatus.readAt,
      userStatuses: undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    console.log('DELETE notification request for ID:', params.id);
    console.log('DELETE: Headers:', Object.fromEntries(request.headers.entries()));
    
    // Try to get userId from auth() (cookie-based)
    let userId = (await auth()).userId;
    console.log('DELETE: userId from auth():', userId);
    
    // If no userId from cookies, try to get it from Bearer token
    if (!userId) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          // Use Clerk's verifyToken utility
          const { verifyToken } = await import('@clerk/nextjs/server');
          const verifiedToken = await verifyToken(token, {
            secretKey: envAuth.clerkSecretKey,
          });
          userId = verifiedToken.sub;
          console.log('DELETE: userId from token:', userId);
        } catch (error) {
          console.error('DELETE: Token verification failed:', error);
        }
      }
    }
    
    if (!userId) {
      console.log('DELETE: No userId, returning 401');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization (will sync user if not exists)
    console.log('DELETE: Getting user from getCurrentUser()...');
    const user = await getCurrentUser();
    console.log('DELETE: user result:', user ? 'found' : 'not found');

    if (!user) {
      console.log('DELETE: User not found, returning 404');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if notification exists and user has access
    const existingNotification = await db.notification.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        OR: [
          { userId: null },
          { userId: user.id },
        ],
        deletedAt: null,
      },
      include: {
        userStatuses: {
          where: {
            userId: user.id,
          },
        },
      },
    });

    if (!existingNotification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Check if user has already deleted this notification
    const userStatus = existingNotification.userStatuses[0];
    if (userStatus?.isDeleted) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // For organization-wide notifications, mark as deleted for this user only
    // For user-specific notifications, user can delete them
    if (userStatus) {
      // Update existing status to mark as deleted
      await db.notificationUserStatus.update({
        where: { id: userStatus.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    } else {
      // Create new status record marked as deleted
      await db.notificationUserStatus.create({
        data: {
          notificationId: params.id,
          userId: user.id,
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    }

    // Only hard delete notification if it's user-specific AND user is the target
    // OR if user is admin/owner and it's org-wide
    if ((existingNotification.userId === user.id) || 
        (!existingNotification.userId && ['ADMIN', 'OWNER'].includes(user.role))) {
      // For admins deleting org-wide notifications, hard delete the notification
      // This will cascade delete all user statuses
      await db.notification.update({
        where: { id: params.id },
        data: {
          deletedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}