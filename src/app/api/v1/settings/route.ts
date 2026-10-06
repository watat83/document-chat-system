/**
 * API Settings Management
 *
 * Handles CRUD operations for organization API settings (API keys, config)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt, encryptSettings, decryptSettings, maskApiKey } from '@/lib/encryption';
import { z } from 'zod';

// Setting categories
const SETTING_CATEGORIES = {
  API_KEYS: 'API_KEYS',
  FILE_STORAGE: 'FILE_STORAGE',
  VECTOR_SEARCH: 'VECTOR_SEARCH',
  CACHE: 'CACHE',
  BILLING: 'BILLING',
} as const;

// Sensitive fields that need encryption
const SENSITIVE_FIELDS = {
  [SETTING_CATEGORIES.API_KEYS]: [
    'openrouterApiKey',
    'openaiApiKey',
    'imagerouterApiKey',
  ],
  [SETTING_CATEGORIES.FILE_STORAGE]: [
    'supabaseUrl',
    'supabaseAnonKey',
    'supabaseServiceRoleKey',
  ],
  [SETTING_CATEGORIES.VECTOR_SEARCH]: [
    'pineconeApiKey',
  ],
  [SETTING_CATEGORIES.CACHE]: [
    'redisUrl',
    'redisToken',
  ],
  [SETTING_CATEGORIES.BILLING]: [
    'stripePublishableKey',
    'stripeSecretKey',
    'stripeWebhookSecret',
  ],
};

// Validation schemas
const apiKeysSchema = z.object({
  openrouterApiKey: z.string().optional(),
  openrouterAppName: z.string().optional(),
  openrouterSiteUrl: z.string().url().optional(),
  openaiApiKey: z.string().optional(),
  imagerouterApiKey: z.string().optional(),
});

const fileStorageSchema = z.object({
  supabaseUrl: z.string().url().optional(),
  supabaseAnonKey: z.string().optional(),
  supabaseServiceRoleKey: z.string().optional(),
});

const vectorSearchSchema = z.object({
  pineconeApiKey: z.string().optional(),
  pineconeEnvironment: z.string().optional(),
  pineconeIndexName: z.string().optional(),
});

const cacheSchema = z.object({
  redisUrl: z.string().optional(),
  redisToken: z.string().optional(),
});

const billingSchema = z.object({
  stripePublishableKey: z.string().optional(),
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
});

/**
 * GET /api/v1/settings
 * Get organization settings
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
      select: { organizationId: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const masked = searchParams.get('masked') !== 'false'; // Default to masked

    if (!['OWNER', 'ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Organization administrator required' }, { status: 403 });
    // Get settings by category
    const whereClause = category
      ? { organizationId: user.organizationId, category }
      : { organizationId: user.organizationId };

    const settings = await prisma.organizationSettings.findMany({
      where: whereClause,
      orderBy: { category: 'asc' },
    });

    // Decrypt and optionally mask sensitive fields
    const processedSettings = settings.map(setting => {
      const sensitiveFields = SENSITIVE_FIELDS[setting.category as keyof typeof SENSITIVE_FIELDS] || [];
      let settingsData = setting.settings as Record<string, any>;

      // Decrypt sensitive fields
      settingsData = decryptSettings(settingsData, sensitiveFields);

      // Mask if requested
      if (masked) {
        for (const field of sensitiveFields) {
          if (settingsData[field]) {
            settingsData[field] = maskApiKey(settingsData[field]);
          }
        }
      }

      return {
        id: setting.id,
        category: setting.category,
        settings: settingsData,
        updatedAt: setting.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      settings: category ? processedSettings[0] : processedSettings,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/settings
 * Create or update organization settings
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
      select: { id: true, organizationId: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!['OWNER', 'ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Organization administrator required' }, { status: 403 });
    const body = await request.json();
    const { category, settings } = body;

    if (!category || !settings) {
      return NextResponse.json(
        { error: 'Category and settings are required' },
        { status: 400 }
      );
    }

    // Validate settings based on category
    let validatedSettings;
    try {
      switch (category) {
        case SETTING_CATEGORIES.API_KEYS:
          validatedSettings = apiKeysSchema.parse(settings);
          break;
        case SETTING_CATEGORIES.FILE_STORAGE:
          validatedSettings = fileStorageSchema.parse(settings);
          break;
        case SETTING_CATEGORIES.VECTOR_SEARCH:
          validatedSettings = vectorSearchSchema.parse(settings);
          break;
        case SETTING_CATEGORIES.CACHE:
          validatedSettings = cacheSchema.parse(settings);
          break;
        case SETTING_CATEGORIES.BILLING:
          validatedSettings = billingSchema.parse(settings);
          break;
        default:
          validatedSettings = settings;
      }
    } catch (validationError) {
      return NextResponse.json(
        { error: 'Invalid settings format', details: validationError },
        { status: 400 }
      );
    }

    // Encrypt sensitive fields
    const sensitiveFields = SENSITIVE_FIELDS[category as keyof typeof SENSITIVE_FIELDS] || [];
    const encryptedSettings = encryptSettings(validatedSettings, sensitiveFields);

    // Upsert settings
    const savedSettings = await prisma.organizationSettings.upsert({
      where: {
        organizationId_category: {
          organizationId: user.organizationId,
          category,
        },
      },
      update: {
        settings: encryptedSettings,
        updatedBy: user.id,
      },
      create: {
        organizationId: user.organizationId,
        category,
        settings: encryptedSettings,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
      settings: {
        id: savedSettings.id,
        category: savedSettings.category,
        updatedAt: savedSettings.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/settings
 * Delete organization settings by category
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const user = await prisma.user.findUnique({
      where: { clerkId: userId, deletedAt: null, organization: { deletedAt: null } },
      select: { organizationId: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!['OWNER', 'ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Organization administrator required' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    await prisma.organizationSettings.deleteMany({
      where: {
        organizationId: user.organizationId,
        category,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Settings deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting settings:', error);
    return NextResponse.json(
      { error: 'Failed to delete settings' },
      { status: 500 }
    );
  }
}
