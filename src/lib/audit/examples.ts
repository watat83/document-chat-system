import { auditLogger } from './audit-logger';
import { AuditUserAction, AuditDataAccess, AuditSecurityEvent } from './decorators';
import { AuditEventType } from '@prisma/client';

// Example service class showing how to integrate audit logging
export class OpportunityService {
  
  @AuditDataAccess(AuditEventType.OPPORTUNITY_VIEW, 'opportunity')
  async getOpportunity(id: string) {
    // Your existing logic here
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
    });
    
    return opportunity;
  }

  @AuditUserAction(AuditEventType.OPPORTUNITY_CREATE, 'opportunity')
  async createOpportunity(data: any) {
    // Your existing logic here
    const opportunity = await prisma.opportunity.create({
      data,
    });

    // Additional manual logging if needed
    await auditLogger.logUserAction(
      AuditEventType.OPPORTUNITY_CREATE,
      opportunity.id,
      'opportunity',
      `Created opportunity: ${opportunity.title}`,
      {
        title: opportunity.title,
        agency: opportunity.agency,
        contractValue: opportunity.contractValue,
      }
    );

    return opportunity;
  }

  @AuditUserAction(AuditEventType.OPPORTUNITY_UPDATE, 'opportunity')
  async updateOpportunity(id: string, data: any) {
    // Log what changed
    const before = await prisma.opportunity.findUnique({ where: { id } });
    
    const opportunity = await prisma.opportunity.update({
      where: { id },
      data,
    });

    // Log detailed changes
    await auditLogger.logUserAction(
      AuditEventType.OPPORTUNITY_UPDATE,
      id,
      'opportunity',
      `Updated opportunity: ${opportunity.title}`,
      {
        changes: this.getChanges(before, opportunity),
        updatedFields: Object.keys(data),
      }
    );

    return opportunity;
  }

  @AuditUserAction(AuditEventType.OPPORTUNITY_DELETE, 'opportunity')
  async deleteOpportunity(id: string) {
    const opportunity = await prisma.opportunity.findUnique({ where: { id } });
    
    await prisma.opportunity.delete({ where: { id } });

    await auditLogger.logUserAction(
      AuditEventType.OPPORTUNITY_DELETE,
      id,
      'opportunity',
      `Deleted opportunity: ${opportunity?.title}`,
      {
        deletedOpportunity: {
          title: opportunity?.title,
          agency: opportunity?.agency,
        },
      }
    );
  }

  private getChanges(before: any, after: any): Record<string, { from: any; to: any }> {
    const changes: Record<string, { from: any; to: any }> = {};
    
    for (const key in after) {
      if (before[key] !== after[key]) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    
    return changes;
  }
}

// Example authentication service
export class AuthService {

  @AuditSecurityEvent(AuditEventType.USER_LOGIN)
  async login(email: string, password: string) {
    try {
      // Your authentication logic
      const user = await this.authenticateUser(email, password);
      
      await auditLogger.logSecurityEvent(
        AuditEventType.USER_LOGIN,
        `User login successful: ${email}`,
        'INFO',
        {
          userEmail: email,
          loginMethod: 'email_password',
          success: true,
        }
      );

      return user;
    } catch (error) {
      await auditLogger.logSecurityEvent(
        AuditEventType.LOGIN_FAILED,
        `User login failed: ${email}`,
        'WARNING',
        {
          userEmail: email,
          loginMethod: 'email_password',
          success: false,
          error: error.message,
        }
      );
      throw error;
    }
  }

  async logout(userId: string) {
    await auditLogger.logSecurityEvent(
      AuditEventType.USER_LOGOUT,
      `User logged out`,
      'INFO',
      {
        userId,
      }
    );
  }

  private async authenticateUser(email: string, password: string) {
    // Your authentication logic
    return { id: '123', email };
  }
}

// Example profile service
export class ProfileService {

  @AuditDataAccess(AuditEventType.PROFILE_VIEW, 'profile')
  async getProfile(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    return profile;
  }

  @AuditUserAction(AuditEventType.PROFILE_UPDATE, 'profile')
  async updateProfile(userId: string, data: any) {
    const before = await prisma.profile.findUnique({ where: { userId } });
    
    const profile = await prisma.profile.update({
      where: { userId },
      data,
    });

    // Log sensitive field changes separately
    const sensitiveFields = ['email', 'phone', 'address'];
    const changedSensitiveFields = sensitiveFields.filter(field => 
      data[field] && data[field] !== before?.[field]
    );

    if (changedSensitiveFields.length > 0) {
      await auditLogger.logSecurityEvent(
        AuditEventType.SENSITIVE_DATA_UPDATE,
        `Sensitive profile data updated`,
        'WARNING',
        {
          userId,
          changedFields: changedSensitiveFields,
          // Don't log actual values for sensitive data
        }
      );
    }

    return profile;
  }
}

// Example billing service
export class BillingService {

  @AuditUserAction(AuditEventType.SUBSCRIPTION_CREATE, 'subscription')
  async createSubscription(userId: string, planId: string) {
    const subscription = await this.createStripeSubscription(userId, planId);

    await auditLogger.logUserAction(
      AuditEventType.SUBSCRIPTION_CREATE,
      subscription.id,
      'subscription',
      `Created subscription for plan: ${planId}`,
      {
        userId,
        planId,
        amount: subscription.amount,
        currency: subscription.currency,
      }
    );

    return subscription;
  }

  @AuditUserAction(AuditEventType.PAYMENT_PROCESSED, 'payment')
  async processPayment(userId: string, amount: number) {
    try {
      const payment = await this.chargeUser(userId, amount);

      await auditLogger.logUserAction(
        AuditEventType.PAYMENT_PROCESSED,
        payment.id,
        'payment',
        `Payment processed successfully`,
        {
          userId,
          amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
        }
      );

      return payment;
    } catch (error) {
      await auditLogger.logUserAction(
        AuditEventType.PAYMENT_FAILED,
        userId,
        'payment',
        `Payment processing failed`,
        {
          userId,
          amount,
          error: error.message,
        }
      );
      throw error;
    }
  }

  private async createStripeSubscription(userId: string, planId: string) {
    // Stripe integration logic
    return { id: 'sub_123', amount: 99, currency: 'USD' };
  }

  private async chargeUser(userId: string, amount: number) {
    // Payment processing logic
    return { 
      id: 'pay_123', 
      currency: 'USD', 
      paymentMethod: 'card',
      amount 
    };
  }
}

// Example API route integration
export async function handleAPIRequest(request: Request, handler: (...args: any[]) => any) {
  const startTime = Date.now();
  const url = new URL(request.url);
  
  try {
    const result = await handler(request);
    const duration = Date.now() - startTime;

    await auditLogger.logApiAccess(
      url.pathname,
      request.method,
      200,
      duration,
      {
        queryParams: Object.fromEntries(url.searchParams),
      }
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    await auditLogger.logApiAccess(
      url.pathname,
      request.method,
      500,
      duration,
      {
        error: error.message,
        queryParams: Object.fromEntries(url.searchParams),
      }
    );

    throw error;
  }
}