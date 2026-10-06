import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { NotificationCategory, NotificationType } from '@prisma/client';

const UpdatePreferencesSchema = z.object({
  preferences: z.array(z.object({
    category: z.nativeEnum(NotificationCategory),
    inApp: z.boolean().default(true),
    email: z.boolean().default(true),
    sms: z.boolean().default(false),
    push: z.boolean().default(true),
    frequency: z.enum(['REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'DISABLED']).default('REAL_TIME'),
    digestTime: z.string().optional(),
  }))
});

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's notification preferences
    const preferences = await db.notificationPreference.findMany({
      where: {
        userId: userId,
        organizationId: user.organizationId,
      },
      orderBy: {
        category: 'asc',
      },
    });

    // If no preferences exist, create default ones
    if (preferences.length === 0) {
      const categories = ['NEW_OPPORTUNITY', 'MATCH_SCORE', 'SYSTEM_UPDATE', 'BILLING', 'PROFILE', 'TEAM', 'DEADLINE', 'GENERAL'];

      const defaultPreferences = await db.$transaction(
        categories.map(category =>
          db.notificationPreference.create({
            data: {
              userId: userId,
              organizationId: user.organizationId,
              category: category as any,
              inApp: true,
              email: true,
              sms: false,
              push: true,
              frequency: 'REAL_TIME',
            },
          })
        )
      );

      return NextResponse.json(defaultPreferences);
    }

    return NextResponse.json(preferences);
  } catch (error) {
    console.error('Get notification preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      select: { organizationId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = UpdatePreferencesSchema.parse(body);

    // Update or create preferences
    const updatedPreferences = await db.$transaction(
      validatedData.preferences.map(pref =>
        db.notificationPreference.upsert({
          where: {
            userId_category: {
              userId: userId,
              category: pref.category,
            },
          },
          update: {
            inApp: pref.inApp,
            email: pref.email,
            sms: pref.sms,
            push: pref.push,
            frequency: pref.frequency,
            digestTime: pref.digestTime,
          },
          create: {
            userId: userId,
            organizationId: user.organizationId,
            category: pref.category,
            inApp: pref.inApp,
            email: pref.email,
            sms: pref.sms,
            push: pref.push,
            frequency: pref.frequency,
            digestTime: pref.digestTime,
          },
        })
      )
    );

    return NextResponse.json(updatedPreferences);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Update notification preferences error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
