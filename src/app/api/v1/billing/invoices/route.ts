import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe-server';
import { createErrorResponse, handleApiError } from '@/lib/api-errors';

/**
 * @swagger
 * /api/billing/invoices:
 *   get:
 *     summary: Get billing history and invoices
 *     description: Retrieves the invoice history for the authenticated organization from Stripe
 *     tags: [Billing]
 *     security:
 *       - ClerkAuth: []
 *     responses:
 *       200:
 *         description: Invoice history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       date:
 *                         type: string
 *                         format: date-time
 *                       amount:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [paid, pending, failed, draft, open, void]
 *                       description:
 *                         type: string
 *                       invoiceUrl:
 *                         type: string
 *                       pdfUrl:
 *                         type: string
 *                       customerName:
 *                         type: string
 *                       customerEmail:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No subscription or customer found
 *       500:
 *         description: Internal server error
 */
export async function GET() {
  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return createErrorResponse('Stripe is not configured. Please add STRIPE_SECRET_KEY to your environment variables.', 503, 'STRIPE_NOT_CONFIGURED');
    }

    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const user = await currentUser();
    if (!user) {
      return createErrorResponse('User not found', 404, 'USER_NOT_FOUND');
    }

    // Get user's organization from database
    const dbUser = await db.user.findUnique({
      where: { clerkId: user.id },
      select: { organizationId: true }
    });

    if (!dbUser) {
      return createErrorResponse('User not found in database', 404, 'USER_NOT_FOUND');
    }

    const organizationId = dbUser.organizationId;

    if (!organizationId) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    // Get organization with Stripe customer ID
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        stripeCustomerId: true,
        name: true,
        billingEmail: true
      }
    });

    if (!organization) {
      return createErrorResponse('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    if (!organization.stripeCustomerId) {
      // No Stripe customer ID means no billing history
      return NextResponse.json({
        invoices: [],
        message: 'No billing history found. Start a subscription to see invoices here.'
      });
    }

    // Fetch invoices from Stripe
    try {
      const invoices = await stripe.invoices.list({
        customer: organization.stripeCustomerId,
        limit: 50, // Fetch last 50 invoices
        expand: ['data.parent.subscription_details.subscription']
      });

      // Transform Stripe invoice data to our format
      const transformedInvoices = invoices.data.map((invoice) => {
        const subscription = invoice.parent?.subscription_details?.subscription;
        // Generate a description based on subscription info
        let description = 'Document Chat System Subscription';
        if (invoice.lines?.data?.[0]?.description) {
          description = invoice.lines.data[0].description;
        } else if (subscription && typeof subscription === 'object') {
          // Try to get plan info from subscription metadata or description
          const metadata = subscription.metadata;
          if (metadata?.planType) {
            const planNames = {
              'STARTER': 'Starter',
              'PROFESSIONAL': 'Professional',
              'AGENCY': 'Agency',
              'ENTERPRISE': 'Enterprise'
            };
            const planName = planNames[metadata.planType as keyof typeof planNames] || metadata.planType;
            description = `Document Chat System ${planName}`;
          }
        }

        // Add period info to description if available
        if (invoice.period_start && invoice.period_end) {
          const periodStart = new Date(invoice.period_start * 1000);
          const periodEnd = new Date(invoice.period_end * 1000);
          const monthYear = periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          description += ` - ${monthYear}`;
        }

        return {
          id: invoice.id,
          date: new Date(invoice.created * 1000).toISOString(),
          amount: invoice.total,
          currency: invoice.currency.toUpperCase(),
          status: invoice.status || 'unknown',
          description,
          invoiceUrl: invoice.hosted_invoice_url,
          pdfUrl: invoice.invoice_pdf,
          customerName: organization.name,
          customerEmail: organization.billingEmail || user.emailAddresses[0]?.emailAddress || '',
          number: invoice.number,
          periodStart: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
          periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
          subtotal: invoice.subtotal,
          tax: invoice.total_taxes?.reduce((sum, tax) => sum + tax.amount, 0) ?? 0,
          amountPaid: invoice.amount_paid,
          amountDue: invoice.amount_due
        };
      });

      return NextResponse.json({
        invoices: transformedInvoices,
        total: invoices.data.length,
        hasMore: invoices.has_more
      });

    } catch (stripeError: any) {
      console.error('Stripe API error:', stripeError);

      // Handle specific Stripe errors
      if (stripeError.code === 'resource_missing') {
        return NextResponse.json({
          invoices: [],
          message: 'No billing history found. This customer may not have any invoices yet.'
        });
      }

      return createErrorResponse(
        `Failed to fetch invoices from Stripe: ${stripeError.message}`,
        500,
        'STRIPE_API_ERROR',
        { stripeCode: stripeError.code, stripeType: stripeError.type }
      );
    }

  } catch (error) {
    console.error('Error fetching billing invoices:', error);
    return handleApiError(error);
  }
}
