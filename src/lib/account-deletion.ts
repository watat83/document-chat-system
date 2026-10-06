/**
 * Account Deletion Service
 *
 * Implements industry-standard account deletion following GDPR and financial compliance requirements.
 *
 * Features:
 * - Immediate soft delete with PII anonymization
 * - Subscription cancellation and cleanup
 * - Scheduled hard deletion after grace period
 * - Comprehensive audit logging
 * - Compliance with financial record retention
 */

import { supabaseAdmin } from '@/lib/supabase';
import { defaultNamespaceManager } from '@/lib/ai/services/pinecone-namespace-manager';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { clerkClient as clerkClientInstance } from '@clerk/nextjs/server';
import { DeletionStatus, DeletionType, DeletionAction } from '@prisma/client';

export interface AccountDeletionRequest {
  organizationId: string;
  userId?: string;
  requestedBy: string;
  requestedByEmail?: string;
  reason?: string;
  deletionType?: DeletionType;
  gracePeriodDays?: number; // Default: 30 days
}

export interface DeletionResult {
  accountDeletionId: string;
  status: DeletionStatus;
  softDeletedAt?: Date;
  scheduledHardDeleteAt?: Date;
  message: string;
  auditTrail: string[];
}

export class AccountDeletionService {
  private readonly DEFAULT_GRACE_PERIOD_DAYS = 30;

  /**
   * Initiate account deletion process
   */
  async initiateAccountDeletion(request: AccountDeletionRequest): Promise<DeletionResult> {
    const gracePeriodDays = request.gracePeriodDays || this.DEFAULT_GRACE_PERIOD_DAYS;
    const scheduledHardDeleteAt = new Date();
    scheduledHardDeleteAt.setDate(scheduledHardDeleteAt.getDate() + gracePeriodDays);

    // Create deletion record
    const accountDeletion = await db.accountDeletion.create({
      data: {
        organizationId: request.organizationId,
        userId: request.userId,
        status: DeletionStatus.REQUESTED,
        deletionType: request.deletionType || DeletionType.USER_INITIATED,
        reason: request.reason,
        requestedBy: request.requestedBy,
        requestedByEmail: request.requestedByEmail,
        scheduledHardDeleteAt,
      }
    });

    // Create audit entry
    await this.createAuditEntry(accountDeletion.id, DeletionAction.REQUEST_CREATED, {
      dataType: 'account_deletion',
      details: {
        request,
        gracePeriodDays,
        scheduledHardDeleteAt: scheduledHardDeleteAt.toISOString()
      }
    });

    // Perform immediate soft deletion
    const softDeleteResult = await this.performSoftDeletion(accountDeletion.id);

    return {
      accountDeletionId: accountDeletion.id,
      status: softDeleteResult.status,
      softDeletedAt: softDeleteResult.softDeletedAt,
      scheduledHardDeleteAt,
      message: `Account deletion initiated. Data will be permanently deleted on ${scheduledHardDeleteAt.toLocaleDateString()}.`,
      auditTrail: softDeleteResult.auditTrail
    };
  }

  /**
   * Perform immediate soft deletion and cleanup
   */
  async performSoftDeletion(accountDeletionId: string): Promise<{
    status: DeletionStatus;
    softDeletedAt: Date;
    auditTrail: string[];
  }> {
    const auditTrail: string[] = [];
    const softDeletedAt = new Date();

    try {
      const accountDeletion = await db.accountDeletion.findUnique({
        where: { id: accountDeletionId },
        include: { organization: true }
      });

      if (!accountDeletion) {
        throw new Error('Account deletion record not found');
      }

      // Step 1: Cancel all active subscriptions
      await this.cancelActiveSubscriptions(accountDeletion.organizationId);
      auditTrail.push('✅ Active subscriptions canceled');

      await this.createAuditEntry(accountDeletionId, DeletionAction.SUBSCRIPTIONS_CANCELLED, {
        dataType: 'subscriptions',
        details: { organizationId: accountDeletion.organizationId }
      });

      // Step 2: Process Stripe customer
      if (accountDeletion.organization.stripeCustomerId) {
        await this.processStripeCustomer(accountDeletion.organization.stripeCustomerId, accountDeletionId);
        auditTrail.push('✅ Stripe customer processed');
      }

      // Step 3: Delete user from Clerk
      if (accountDeletion.userId) {
        await this.deleteClerkUser(accountDeletion.userId, accountDeletionId);
        auditTrail.push('✅ User deleted from Clerk');
      }

      // Step 4: Anonymize PII data
      await this.anonymizePIIData(accountDeletion.organizationId, accountDeletionId);
      auditTrail.push('✅ PII data anonymized');

      // Step 5: Soft delete application data
      const deletedData = await this.softDeleteApplicationData(accountDeletion.organizationId, accountDeletionId);
      auditTrail.push(`✅ Application data soft deleted (${Object.keys(deletedData).length} data types)`);

      // Update account deletion status
      await db.accountDeletion.update({
        where: { id: accountDeletionId },
        data: {
          status: DeletionStatus.SOFT_DELETED,
          softDeletedAt,
          deletedData
        }
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.DATA_SOFT_DELETED, {
        dataType: 'all',
        details: { deletedData, auditTrail }
      });

      return {
        status: DeletionStatus.SOFT_DELETED,
        softDeletedAt,
        auditTrail
      };

    } catch (error) {
      await db.accountDeletion.update({
        where: { id: accountDeletionId },
        data: { status: DeletionStatus.FAILED }
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.DELETION_FAILED, {
        dataType: 'soft_deletion',
        details: { error: error instanceof Error ? error.message : String(error) },
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Cancel all active subscriptions for organization
   */
  private async cancelActiveSubscriptions(organizationId: string): Promise<void> {
    const activeSubscriptions = await db.subscription.findMany({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }
      }
    });

    for (const subscription of activeSubscriptions) {
      if (subscription.stripeSubscriptionId) {
        try {
          // Cancel immediately in Stripe
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        } catch (stripeError) {
          console.warn(`Failed to cancel Stripe subscription ${subscription.stripeSubscriptionId}:`, stripeError);
          // Continue with database update even if Stripe fails
        }
      }

      // Update in database
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELED',
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
  }

  /**
   * Process Stripe customer (anonymize but retain for compliance)
   */
  private async processStripeCustomer(stripeCustomerId: string, accountDeletionId: string): Promise<void> {
    try {
      // Mark customer as deleted in metadata (don't actually delete)
      await stripe.customers.update(stripeCustomerId, {
        email: `deleted_${stripeCustomerId}@deleted.local`,
        name: 'DELETED CUSTOMER',
        metadata: {
          deleted: 'true',
          deletedAt: new Date().toISOString(),
          accountDeletionId
        }
      });

      // Remove payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId
      });

      for (const pm of paymentMethods.data) {
        try {
          await stripe.paymentMethods.detach(pm.id);
        } catch (detachError) {
          console.warn(`Failed to detach payment method ${pm.id}:`, detachError);
        }
      }

      await db.accountDeletion.update({
        where: { id: accountDeletionId },
        data: { stripeCustomerProcessed: true }
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.STRIPE_CUSTOMER_PROCESSED, {
        dataType: 'stripe_customer',
        details: {
          stripeCustomerId,
          paymentMethodsRemoved: paymentMethods.data.length
        }
      });

    } catch (error) {
      console.error('Error processing Stripe customer:', error);
      throw new Error(`Failed to process Stripe customer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete user from Clerk
   */
  private async deleteClerkUser(userId: string, accountDeletionId: string): Promise<void> {
    try {
      // Get user data before deletion for audit
      const clerkClient = await clerkClientInstance();
      const user = await clerkClient.users.getUser(userId);
      const userEmail = user.emailAddresses[0]?.emailAddress;

      // Delete from Clerk
      await clerkClient.users.deleteUser(userId);

      await db.accountDeletion.update({
        where: { id: accountDeletionId },
        data: { clerkUserDeleted: true }
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.CLERK_USER_DELETED, {
        dataType: 'clerk_user',
        details: {
          userId,
          userEmail,
          deletedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error deleting Clerk user:', error);
      // Don't throw - user might already be deleted
      await this.createAuditEntry(accountDeletionId, DeletionAction.CLERK_USER_DELETED, {
        dataType: 'clerk_user',
        details: {
          userId,
          error: error instanceof Error ? error.message : String(error)
        },
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Anonymize PII data while maintaining referential integrity
   */
  private async anonymizePIIData(organizationId: string, accountDeletionId: string): Promise<void> {
    const anonymizedAt = new Date();
    const anonymizeId = (id: string) => `deleted_${id}`;

    // Anonymize organization
    await db.organization.update({
      where: { id: organizationId },
      data: {
        name: `DELETED_ORGANIZATION_${organizationId.slice(-8)}`,
        billingEmail: `${anonymizeId(organizationId)}@deleted.local`,
        deletedAt: anonymizedAt
      }
    });

    // Anonymize users
    const users = await db.user.findMany({
      where: { organizationId }
    });

    for (const user of users) {
      await db.user.update({
        where: { id: user.id },
        data: {
          email: `${anonymizeId(user.id)}@deleted.local`,
          firstName: 'DELETED',
          lastName: 'USER',
          imageUrl: null,
          deletedAt: anonymizedAt
        }
      });
    }

    // Anonymize profiles
    await db.profile.updateMany({
      where: { organizationId },
      data: {
        companyName: 'DELETED_COMPANY',
        primaryContactEmail: `${anonymizeId(organizationId)}@deleted.local`,
        primaryContactName: 'DELETED CONTACT',
        primaryContactPhone: null,
        website: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        zipCode: null,
        deletedAt: anonymizedAt
      }
    });

    await this.createAuditEntry(accountDeletionId, DeletionAction.PII_ANONYMIZED, {
      dataType: 'pii_data',
      recordsAffected: users.length + 1, // +1 for organization
      details: {
        organizationId,
        usersAnonymized: users.length,
        anonymizedAt: anonymizedAt.toISOString()
      }
    });
  }

  /**
   * Soft delete application data (mark as deleted, keep for compliance)
   */
  private async softDeleteApplicationData(organizationId: string, accountDeletionId: string): Promise<Record<string, number>> {
    const deletedAt = new Date();
    const deletedData: Record<string, number> = {};

    // Use current schema models and propagate failures so deletion is never falsely completed.
    const results = await db.$transaction(async tx => ({
      document: await tx.document.updateMany({ where: { organizationId, deletedAt: null }, data: { deletedAt } }),
      folder: await tx.folder.updateMany({ where: { organizationId, deletedAt: null }, data: { deletedAt } }),
      savedSearch: await tx.savedSearch.updateMany({ where: { organizationId, deletedAt: null }, data: { deletedAt } }),
      apiKey: await tx.apiKey.updateMany({ where: { organizationId, isActive: true }, data: { isActive: false } }),
    }))
    for (const [model, result] of Object.entries(results)) deletedData[model] = result.count

    // KEEP compliance data: subscriptions, usageRecords, invoices, audit logs
    // These are retained for financial and legal compliance

    await this.createAuditEntry(accountDeletionId, DeletionAction.DATA_SOFT_DELETED, {
      dataType: 'application_data',
      recordsAffected: Object.values(deletedData).reduce((sum, count) => sum + count, 0),
      details: { deletedData, deletedAt: deletedAt.toISOString() }
    });

    return deletedData;
  }

  /**
   * Perform hard deletion after grace period
   */
  async performHardDeletion(accountDeletionId: string): Promise<void> {
    const accountDeletion = await db.accountDeletion.findUnique({
      where: { id: accountDeletionId }
    });

    if (!accountDeletion) {
      throw new Error('Account deletion record not found');
    }

    if (!accountDeletion.softDeletedAt || ![DeletionStatus.SOFT_DELETED, DeletionStatus.FAILED].includes(accountDeletion.status as 'SOFT_DELETED' | 'FAILED')) {
      throw new Error('Cannot perform hard deletion: account not soft deleted');
    }

    if (!accountDeletion.scheduledHardDeleteAt || accountDeletion.scheduledHardDeleteAt > new Date()) {
      throw new Error('Account deletion grace period has not ended');
    }
    const hardDeletedAt = new Date();

    try {
      // Hard delete non-compliance data
      const organizationId = accountDeletion.organizationId;

      // Purge external assets first. A failed provider operation leaves the ledger retryable.
      await this.purgeOrganizationAssets(organizationId);
      await db.$transaction(async tx => {
        const where = { organizationId };
        await tx.savedSearch.deleteMany({ where });
        await tx.conversation.deleteMany({ where });
        await tx.document.deleteMany({ where });
        await tx.folder.deleteMany({ where });
        await tx.activity.deleteMany({ where: { user: { organizationId } } });
        await tx.apiKey.deleteMany({ where });
        await tx.profile.deleteMany({ where });
        await tx.user.deleteMany({ where });
        await tx.organization.update({ where: { id: organizationId }, data: { name: `HARD_DELETED_${organizationId.slice(-8)}`, deletedAt: hardDeletedAt } });
        await tx.accountDeletion.update({ where: { id: accountDeletionId }, data: { status: DeletionStatus.HARD_DELETED, hardDeletedAt } });
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.DATA_HARD_DELETED, {
        dataType: 'all',
        details: {
          organizationId,
          hardDeletedAt: hardDeletedAt.toISOString(),
          retainedForCompliance: ['subscriptions', 'usageRecords', 'accountDeletions', 'stripe_records']
        }
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.DELETION_COMPLETED, {
        dataType: 'account_deletion',
        details: {
          completedAt: hardDeletedAt.toISOString(),
          totalProcessingDays: Math.ceil((hardDeletedAt.getTime() - accountDeletion.requestedAt.getTime()) / (1000 * 60 * 60 * 24))
        }
      });

    } catch (error) {
      await db.accountDeletion.update({
        where: { id: accountDeletionId },
        data: { status: DeletionStatus.FAILED }
      });

      await this.createAuditEntry(accountDeletionId, DeletionAction.DELETION_FAILED, {
        dataType: 'hard_deletion',
        details: { error: error instanceof Error ? error.message : String(error) },
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Cancel account deletion request
   */
  async cancelAccountDeletion(accountDeletionId: string, cancelledBy: string): Promise<void> {
    const accountDeletion = await db.accountDeletion.findUnique({
      where: { id: accountDeletionId }
    });

    if (!accountDeletion) {
      throw new Error('Account deletion record not found');
    }

    if (accountDeletion.status === DeletionStatus.HARD_DELETED) {
      throw new Error('Cannot cancel: account has already been permanently deleted');
    }

    await db.accountDeletion.update({
      where: { id: accountDeletionId },
      data: { status: DeletionStatus.CANCELLED }
    });

    await this.createAuditEntry(accountDeletionId, DeletionAction.DELETION_CANCELLED, {
      dataType: 'account_deletion',
      performedBy: cancelledBy,
      details: {
        cancelledAt: new Date().toISOString(),
        previousStatus: accountDeletion.status
      }
    });
  }

  /**
   * Get pending hard deletions
   */
  async getPendingHardDeletions(): Promise<Array<{ id: string; organizationId: string; scheduledHardDeleteAt: Date }>> {
    const now = new Date();

    const pending = await db.accountDeletion.findMany({
      where: { status: { in: [DeletionStatus.SOFT_DELETED, DeletionStatus.FAILED] }, softDeletedAt: { not: null }, scheduledHardDeleteAt: { lte: now } },
      select: { id: true, organizationId: true, scheduledHardDeleteAt: true }
    });
    return pending.filter((row): row is typeof row & { scheduledHardDeleteAt: Date } => row.scheduledHardDeleteAt !== null);
  }

  private async purgeOrganizationAssets(organizationId: string): Promise<void> {
    if (!supabaseAdmin) throw new Error('Storage must be configured before permanent deletion');
    const bucket = supabaseAdmin.storage.from('documents');
    // Remove every object under both historical tenant prefixes, including unreferenced uploads.
    const visit = async (prefix: string, depth = 0): Promise<void> => {
      if (depth > 30) throw new Error('Storage hierarchy exceeds deletion depth limit');
      const files: string[] = [];
      const folders: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error || !data) throw error || new Error('Unable to list account storage');
        for (const object of data) {
          if (object.name.includes('/') || object.name === '..') throw new Error('Invalid storage object name');
          const path = `${prefix}/${object.name}`;
          if (object.id) files.push(path); else folders.push(path);
        }
        if (data.length < 1000) break;
      }
      for (const folder of folders) await visit(folder, depth + 1);
      for (let start = 0; start < files.length; start += 100) {
        const { error } = await bucket.remove(files.slice(start, start + 100));
        if (error) throw error;
      }
    };
    await visit(organizationId);
    await visit(`documents/${organizationId}`);
    await defaultNamespaceManager.deleteOrganizationNamespaces(organizationId);
    if (process.env.ENABLE_PGVECTOR_FALLBACK === 'true') {
      await db.$executeRaw`DELETE FROM document_vectors WHERE organization_id = ${organizationId}`;
    }
  }

  /**
   * Create audit entry
   */
  private async createAuditEntry(
    accountDeletionId: string,
    action: DeletionAction,
    data: {
      dataType: string;
      recordsAffected?: number;
      details?: any;
      performedBy?: string;
      success?: boolean;
      errorMessage?: string;
    }
  ): Promise<void> {
    await db.accountDeletionAudit.create({
      data: {
        accountDeletionId,
        action,
        dataType: data.dataType,
        recordsAffected: data.recordsAffected,
        details: data.details,
        performedBy: data.performedBy,
        success: data.success ?? true,
        errorMessage: data.errorMessage
      }
    });
  }
}

export const accountDeletionService = new AccountDeletionService();
