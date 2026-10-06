import { db } from '@/lib/db';
import type { NotificationType, NotificationCategory, NotificationPriority } from '@prisma/client';

// Import SSE functions for real-time delivery
// Note: These imports will work at runtime when the SSE module is loaded
let sendNotificationToUser: ((userId: string, notification: any) => boolean) | null = null;
let sendNotificationToOrganization: ((organizationId: string, notification: any) => Promise<number>) | null = null;
let broadcastSystemNotification: ((notification: any) => number) | null = null;

// Lazy load SSE functions to avoid circular imports
async function loadSSEFunctions() {
  if (!sendNotificationToUser) {
    try {
      const sseModule = await import('@/lib/notification-stream');
      sendNotificationToUser = sseModule.sendNotificationToUser;
      sendNotificationToOrganization = sseModule.sendNotificationToOrganization;
      broadcastSystemNotification = sseModule.broadcastSystemNotification;
    } catch (error) {
      console.warn('SSE functions not available:', error);
    }
  }
}

export interface CreateNotificationOptions {
  organizationId: string;
  userId?: string; // Optional for organization-wide notifications
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  actionUrl?: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface NotificationFilters {
  organizationId: string;
  userId?: string;
  isRead?: boolean;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  limit?: number;
  offset?: number;
}

export class NotificationService {
  /**
   * Create a new notification
   */
  static async create(options: CreateNotificationOptions) {
    const notification = await db.notification.create({
      data: {
        organizationId: options.organizationId,
        userId: options.userId,
        type: options.type,
        category: options.category,
        title: options.title,
        message: options.message,
        actionUrl: options.actionUrl,
        priority: options.priority || 'MEDIUM',
        metadata: options.metadata,
        expiresAt: options.expiresAt,
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

    // Create user status records
    if (!options.userId) {
      // Organization-wide notification - create status for all users
      const orgUsers = await db.user.findMany({
        where: {
          organizationId: options.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });

      await db.notificationUserStatus.createMany({
        data: orgUsers.map(user => ({
          notificationId: notification.id,
          userId: user.id,
        })),
      });
    } else {
      // User-specific notification
      await db.notificationUserStatus.create({
        data: {
          notificationId: notification.id,
          userId: options.userId,
        },
      });
    }

    // Send real-time notification
    await this.sendRealTimeNotification(notification);

    return notification;
  }

  /**
   * Send real-time notification via SSE
   */
  private static async sendRealTimeNotification(notification: any) {
    try {
      await loadSSEFunctions();

      if (notification.userId) {
        // User-specific notification - need to get the user's clerkId
        const user = await db.user.findUnique({
          where: { id: notification.userId },
          select: { clerkId: true },
        });

        if (user && sendNotificationToUser) {
          const sent = sendNotificationToUser(user.clerkId, notification);
          if (sent) {
            console.log(`Real-time notification sent to user ${user.clerkId}`);
          }
        }
      } else {
        // Organization-wide notification
        if (sendNotificationToOrganization) {
          const sentCount = await sendNotificationToOrganization(notification.organizationId, notification);
          console.log(`Real-time notification sent to ${sentCount} users in organization ${notification.organizationId}`);
        }
      }
    } catch (error) {
      console.error('Error sending real-time notification:', error);
      // Don't throw error - notification was still saved to database
    }
  }

  /**
   * Get notifications with filters
   */
  static async getNotifications(filters: NotificationFilters) {
    if (!filters.userId) {
      throw new Error('userId is required for getNotifications');
    }

    const where: any = {
      organizationId: filters.organizationId,
      OR: [
        { userId: null }, // Organization-wide notifications
        { userId: filters.userId }, // User-specific notifications
      ],
      deletedAt: null,
    };

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    const notifications = await db.notification.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      take: filters.limit || 50,
      skip: filters.offset || 0,
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
            userId: filters.userId,
          },
        },
      },
    });

    // Filter and transform notifications based on user status
    const filteredNotifications = notifications
      .filter(notification => {
        const userStatus = notification.userStatuses[0];
        // Hide if user has deleted this notification
        if (userStatus?.isDeleted) return false;

        // Filter by read state if specified
        if (filters.isRead !== undefined) {
          const notificationIsRead = userStatus?.isRead || false;
          return notificationIsRead === filters.isRead;
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

    // Get unread count
    const allUserNotifications = await db.notification.findMany({
      where: {
        organizationId: filters.organizationId,
        OR: [
          { userId: null },
          { userId: filters.userId },
        ],
        deletedAt: null,
      },
      include: {
        userStatuses: {
          where: {
            userId: filters.userId,
          },
        },
      },
    });

    const unreadCount = allUserNotifications.filter(notification => {
      const userStatus = notification.userStatuses[0];
      return !userStatus?.isDeleted && !userStatus?.isRead;
    }).length;

    return {
      notifications: filteredNotifications,
      unreadCount,
    };
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId: string) {
    // Check if user status exists
    const existingStatus = await db.notificationUserStatus.findUnique({
      where: {
        notificationId_userId: {
          notificationId,
          userId,
        },
      },
    });

    if (existingStatus) {
      // Update existing status
      return await db.notificationUserStatus.update({
        where: { id: existingStatus.id },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    } else {
      // Create new status record
      return await db.notificationUserStatus.create({
        data: {
          notificationId,
          userId,
          isRead: true,
          readAt: new Date(),
        },
      });
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(organizationId: string, userId: string) {
    // Get all notifications visible to this user
    const userNotifications = await db.notification.findMany({
      where: {
        organizationId,
        OR: [
          { userId: null },
          { userId: userId },
        ],
        deletedAt: null,
      },
      include: {
        userStatuses: {
          where: {
            userId: userId,
          },
        },
      },
    });

    // Create or update user status for each notification
    const updates = [];
    for (const notification of userNotifications) {
      const existingStatus = notification.userStatuses[0];

      if (existingStatus) {
        // Update existing status if not already read and not deleted
        if (!existingStatus.isRead && !existingStatus.isDeleted) {
          updates.push(
            db.notificationUserStatus.update({
              where: { id: existingStatus.id },
              data: {
                isRead: true,
                readAt: new Date(),
              },
            })
          );
        }
      } else {
        // Create new status record
        updates.push(
          db.notificationUserStatus.create({
            data: {
              notificationId: notification.id,
              userId: userId,
              isRead: true,
              readAt: new Date(),
            },
          })
        );
      }
    }

    return await db.$transaction(updates);
  }

  /**
   * Delete notification for a specific user
   */
  static async deleteForUser(notificationId: string, userId: string) {
    // Check if user status exists
    const existingStatus = await db.notificationUserStatus.findUnique({
      where: {
        notificationId_userId: {
          notificationId,
          userId,
        },
      },
    });

    if (existingStatus) {
      // Update existing status
      return await db.notificationUserStatus.update({
        where: { id: existingStatus.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    } else {
      // Create new status record marked as deleted
      return await db.notificationUserStatus.create({
        data: {
          notificationId,
          userId,
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    }
  }

  /**
   * Hard delete notification (admin only)
   */
  static async hardDelete(notificationId: string) {
    return await db.notification.update({
      where: { id: notificationId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Clean up expired notifications
   */
  static async cleanupExpired() {
    const result = await db.notification.updateMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Create opportunity match notification
   */
  static async createOpportunityMatch(
    organizationId: string,
    userId: string,
    opportunityTitle: string,
    matchScore: number,
    opportunityId: string
  ) {
    return await this.create({
      organizationId,
      userId,
      type: 'OPPORTUNITY',
      category: 'NEW_OPPORTUNITY',
      title: 'New Opportunity Match',
      message: `Found a ${matchScore}% match for "${opportunityTitle}"`,
      actionUrl: `/opportunities/${opportunityId}`,
      priority: matchScore >= 90 ? 'HIGH' : matchScore >= 70 ? 'MEDIUM' : 'LOW',
      metadata: {
        opportunityId,
        matchScore,
        opportunityTitle,
      },
    });
  }

  /**
   * Create system notification for all users in organization
   */
  static async createSystemNotification(
    organizationId: string,
    title: string,
    message: string,
    priority: NotificationPriority = 'MEDIUM'
  ) {
    return await this.create({
      organizationId,
      type: 'SYSTEM',
      category: 'SYSTEM_UPDATE',
      title,
      message,
      priority,
    });
  }

  /**
   * Create billing notification
   */
  static async createBillingNotification(
    organizationId: string,
    title: string,
    message: string,
    actionUrl?: string
  ) {
    return await this.create({
      organizationId,
      type: 'BILLING',
      category: 'BILLING',
      title,
      message,
      actionUrl,
      priority: 'HIGH',
    });
  }

  /**
   * Get unread count for user
   */
  static async getUnreadCount(organizationId: string, userId: string) {
    const notifications = await db.notification.findMany({
      where: {
        organizationId,
        OR: [
          { userId: null },
          { userId: userId },
        ],
        deletedAt: null,
      },
      include: {
        userStatuses: {
          where: {
            userId: userId,
          },
        },
      },
    });

    return notifications.filter(notification => {
      const userStatus = notification.userStatuses[0];
      return !userStatus?.isDeleted && !userStatus?.isRead;
    }).length;
  }
}

export default NotificationService;
