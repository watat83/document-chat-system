import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';
import { NotificationCategory, NotificationType } from '@prisma/client';
import { asyncHandler, commonErrors, createSuccessResponse, createErrorResponse } from '@/lib/api-errors';
import { auth as envAuth } from '@/lib/config/env';

// Validation schemas
const CreateNotificationSchema = z.object({
  type: z.nativeEnum(NotificationType)
    .describe("Notification type determining the visual style and categorization. OPPORTUNITY for contract opportunities, SYSTEM for platform updates, UPDATE for feature announcements, WARNING for important alerts, SUCCESS for confirmations, BILLING for payment/subscription events, TEAM for collaboration notifications."),
  category: z.nativeEnum(NotificationCategory)
    .describe("Notification category for filtering and organization. NEW_OPPORTUNITY for new contract opportunities, MATCH_SCORE for opportunity matching results, SYSTEM_UPDATE for platform changes, BILLING for payment events, PROFILE for account changes, TEAM for team management, DEADLINE for time-sensitive alerts, GENERAL for miscellaneous notifications."),
  title: z.string().min(1).max(255)
    .describe("Notification title displayed prominently in the UI. 1-255 characters. Should be concise and descriptive. Used for quick notification identification."),
  message: z.string().min(1).max(1000)
    .describe("Detailed notification message content. 1-1000 characters. Can include HTML formatting. Used for complete notification information and context."),
  actionUrl: z.string().url().optional()
    .describe("Optional URL for notification click action. Must be a valid URL. Used to direct users to relevant pages or external resources related to the notification."),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM')
    .describe("Notification priority level affecting display order and styling. LOW for informational, MEDIUM for standard notifications, HIGH for important alerts, URGENT for critical notifications requiring immediate attention."),
  userId: z.string().optional()
    .describe("Optional user ID for user-specific notifications. When provided, notification is only visible to this user. When null, notification is organization-wide and visible to all team members."),
  metadata: z.record(z.any()).optional()
    .describe("Optional metadata object for additional notification context. Can contain any key-value pairs. Used for storing notification-specific data like opportunity IDs, contract values, or other relevant information."),
  expiresAt: z.string().datetime().optional()
    .describe("Optional expiration date in ISO datetime format. Notifications expire and are automatically hidden after this time. Used for time-sensitive alerts and temporary notifications.")
})
  .describe("Schema for creating new notifications in the system. Supports both user-specific and organization-wide notifications with rich metadata and expiration controls.");

/**
 * Notification management system schemas for real-time user communication.
 *
 * Features:
 * - Multi-type notification support (opportunities, system, billing, team)
 * - Priority-based display ordering
 * - User-specific and organization-wide notifications
 * - Rich metadata support for context
 * - Expiration controls for time-sensitive alerts
 * - Read/unread status tracking per user
 *
 * Used for:
 * - Real-time opportunity notifications
 * - System announcements and updates
 * - Billing and subscription alerts
 * - Team collaboration notifications
 * - Deadline reminders and alerts
 */

// Schema for future use - notification updates
// const UpdateNotificationSchema = z.object({
//   isRead: z.boolean().optional()
//     .describe("Read status for the notification. Used to mark notifications as read/unread for user-specific tracking."),
//   priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()
//     .describe("Updated priority level for the notification. Used to change notification importance and display order."),
//   expiresAt: z.string().datetime().optional()
//     .describe("Updated expiration date in ISO datetime format. Used to extend or shorten notification visibility period.")
// })
//   .describe("Schema for updating existing notifications. Supports changing read status, priority, and expiration.");

export const GET = asyncHandler(async (request: NextRequest) => {
  console.log('Notifications GET: Starting request');
  console.log('Notifications GET: Headers:', Object.fromEntries(request.headers.entries()));

  // Try to get userId from auth() (cookie-based)
  let { userId } = await auth();
  console.log('Notifications GET: userId from auth():', userId);

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
        console.log('Notifications GET: userId from token:', userId);
      } catch (error) {
        console.error('Notifications GET: Token verification failed:', error);
      }
    }
  }

  if (!userId) {
    console.log('Notifications GET: No userId, returning 401');
    throw commonErrors.unauthorized();
  }

  // Get user's organization (will sync user if not exists)
  const user = await getCurrentUser();

  if (!user) {
    console.log('Notifications GET: User not found in database, returning empty list for new user');
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // For new users who haven't been synced yet, return empty notifications
    return createSuccessResponse({
      notifications: [],
      unreadCount: 0,
      pagination: {
        limit,
        offset,
        hasMore: false,
      },
    });
  }

    const { searchParams } = new URL(request.url);
    const isRead = searchParams.get('isRead');
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build filters for notifications that user can see
    const notificationWhere: any = {
      organizationId: user.organizationId,
      OR: [
        { userId: null }, // Organization-wide notifications
        { userId: user.id }, // User-specific notifications (database user ID)
      ],
      deletedAt: null,
    };

    if (category) {
      notificationWhere.category = category;
    }

    if (priority) {
      notificationWhere.priority = priority;
    }

    // Get notifications with user status
    const notifications = await db.notification.findMany({
      where: notificationWhere,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      skip: offset,
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
            userId: user.id, // Use database user ID
          },
        },
      },
    });

    // Filter notifications based on user status and read state
    const filteredNotifications = notifications
      .filter(notification => {
        const userStatus = notification.userStatuses[0];
        // Hide if user has deleted this notification
        if (userStatus?.isDeleted) return false;

        // Filter by read state if specified
        if (isRead !== null) {
          const notificationIsRead = userStatus?.isRead || false;
          return notificationIsRead === (isRead === 'true');
        }

        return true;
      })
      .map(notification => {
        const userStatus = notification.userStatuses[0];
        return {
          ...notification,
          isRead: userStatus?.isRead || false,
          readAt: userStatus?.readAt || null,
          userStatuses: undefined, // Remove from response
        };
      });

    // Get unread count using complex query
    const allNotifications = await db.notification.findMany({
      where: notificationWhere,
      include: {
        userStatuses: {
          where: {
            userId: user.id, // Use database user ID
          },
        },
      },
    });

    const unreadCount = allNotifications.filter(notification => {
      const userStatus = notification.userStatuses[0];
      return !userStatus?.isDeleted && !userStatus?.isRead;
    }).length;

  return createSuccessResponse({
    notifications: filteredNotifications,
    unreadCount,
    pagination: {
      limit,
      offset,
      hasMore: filteredNotifications.length === limit,
    },
  });
})

export async function POST(request: NextRequest) {
  try {
    // Try to get userId from auth() (cookie-based)
    let { userId } = await auth();

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
          console.error('POST: Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization (will sync user if not exists)
    const user = await getCurrentUser();

    if (!user) {
      console.log('Notifications POST: User not found in database');
      return NextResponse.json({ error: 'User not found. Please complete your profile setup first.' }, { status: 404 });
    }

    // Only admins and owners can create notifications
    if (!['ADMIN', 'OWNER'].includes(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = CreateNotificationSchema.parse(body);

    // Create notification (no longer tracking read/isRead at notification level)
    const notification = await db.notification.create({
      data: {
        type: validatedData.type,
        category: validatedData.category,
        title: validatedData.title,
        message: validatedData.message,
        actionUrl: validatedData.actionUrl,
        priority: validatedData.priority,
        userId: validatedData.userId,
        metadata: validatedData.metadata,
        organizationId: user.organizationId,
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
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
      },
    });

    // If it's an organization-wide notification, create user status records for all users
    if (!validatedData.userId) {
      const orgUsers = await db.user.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      await db.notificationUserStatus.createMany({
        data: orgUsers.map(orgUser => ({
          notificationId: notification.id,
          userId: orgUser.id,
        })),
      });
    } else {
      // For user-specific notifications, create status for target user
      await db.notificationUserStatus.create({
        data: {
          notificationId: notification.id,
          userId: validatedData.userId,
        },
      });
    }

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Try to get userId from auth() (cookie-based)
    let { userId } = await auth();

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

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'mark-all-read') {
      // Get user's organization (will sync user if not exists)
      const user = await getCurrentUser();

      if (!user) {
        console.log('Notifications PATCH: User not found in database');
        return NextResponse.json({ error: 'User not found. Please complete your profile setup first.' }, { status: 404 });
      }

      // Get all notifications visible to this user
      const userNotifications = await db.notification.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { userId: null },
            { userId: user.id }, // Use database user ID, not Clerk ID
          ],
          deletedAt: null,
        },
        include: {
          userStatuses: {
            where: {
              userId: user.id, // Use database user ID, not Clerk ID
            },
          },
        },
      });

      // Create or update user status for each notification
      for (const notification of userNotifications) {
        const existingStatus = notification.userStatuses[0];

        if (existingStatus) {
          // Update existing status
          if (!existingStatus.isRead && !existingStatus.isDeleted) {
            await db.notificationUserStatus.update({
              where: { id: existingStatus.id },
              data: {
                isRead: true,
                readAt: new Date(),
              },
            });
          }
        } else {
          // Create new status record
          await db.notificationUserStatus.create({
            data: {
              notificationId: notification.id,
              userId: user.id, // Use database user ID, not Clerk ID
              isRead: true,
              readAt: new Date(),
            },
          });
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Update notifications error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
