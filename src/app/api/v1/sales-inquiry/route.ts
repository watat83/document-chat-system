import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const salesInquirySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').describe('Full name of the person contacting sales'),
  email: z.string().email('Please enter a valid email address').describe('Email address for follow-up communication'),
  phone: z.string().min(10, 'Please enter a valid phone number').describe('Phone number for direct contact'),
  subject: z.string().min(5, 'Subject must be at least 5 characters').describe('Subject line for the sales inquiry'),
  message: z.string().min(20, 'Message must be at least 20 characters').describe('Detailed message describing the sales inquiry'),
  context: z.enum(['enterprise', 'pricing', 'general']).optional().describe('Context of the sales inquiry submission'),
  planName: z.string().optional().describe('Name of the pricing plan if inquiry is plan-specific'),
  userTimezone: z.string().optional().describe('User\'s timezone for accurate timestamp display')
})

/**
 * @swagger
 * /api/v1/sales-inquiry:
 *   post:
 *     summary: Submit a sales inquiry
 *     description: Public endpoint for submitting sales inquiries about Document Chat System AI pricing, enterprise plans, or general questions. No authentication required.
 *     tags: [Sales]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - subject
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 description: Full name of the person contacting sales
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address for follow-up communication
 *                 example: "john.doe@company.com"
 *               phone:
 *                 type: string
 *                 minLength: 10
 *                 description: Phone number for direct contact
 *                 example: "(555) 123-4567"
 *               subject:
 *                 type: string
 *                 minLength: 5
 *                 description: Subject line for the sales inquiry
 *                 example: "Enterprise Plan Inquiry - Document Chat System AI"
 *               message:
 *                 type: string
 *                 minLength: 20
 *                 description: Detailed message describing the sales inquiry
 *                 example: "I'm interested in learning more about the Enterprise plan..."
 *               context:
 *                 type: string
 *                 enum: [enterprise, pricing, general]
 *                 description: Context of the sales inquiry submission
 *                 example: "enterprise"
 *               planName:
 *                 type: string
 *                 description: Name of the pricing plan if inquiry is plan-specific
 *                 example: "Professional"
 *           examples:
 *             enterprise:
 *               summary: Enterprise plan inquiry
 *               value:
 *                 name: "Sarah Johnson"
 *                 email: "sarah.johnson@govcontractor.com"
 *                 phone: "(555) 987-6543"
 *                 subject: "Enterprise Plan Inquiry - Document Chat System AI"
 *                 message: "Hello Document Chat System AI Sales Team,\n\nI'm interested in learning more about the Enterprise plan for my organization.\n\nPlease provide information about:\n• Pricing and subscription options\n• Implementation timeline and onboarding process\n• Training and support included\n• Custom integrations and features available\n• Enterprise security and compliance features\n\nOrganization Details:\n• Company: ABC Document Management\n• Estimated Users: 50+\n• Industry: Document Management\n• Current Document Volume: $25M annually\n\nI would appreciate the opportunity to schedule a demo and discuss how Document Chat System AI can help streamline our document management processes.\n\nBest regards,"
 *                 context: "enterprise"
 *                 planName: "Enterprise"
 *             pricing:
 *               summary: General pricing inquiry
 *               value:
 *                 name: "Michael Chen"
 *                 email: "mchen@smallbiz.com"
 *                 phone: "(555) 321-9876"
 *                 subject: "Professional Plan Inquiry - Document Chat System AI"
 *                 message: "Hello Document Chat System AI Sales Team,\n\nI'm interested in learning more about the Professional plan for my organization.\n\nPlease provide information about:\n• Detailed pricing and subscription options\n• Feature comparison between plans\n• Implementation and onboarding process\n• Training and support included\n• Custom requirements and integrations\n\nOrganization Details:\n• Company: Small Business Solutions\n• Estimated Users: 5-10\n• Industry: IT Services\n• Current Document Volume: $2M annually\n\nI would like to schedule a demo to see how Document Chat System AI can help with our document management needs.\n\nBest regards,"
 *                 context: "pricing"
 *                 planName: "Professional"
 *     responses:
 *       200:
 *         description: Sales inquiry submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Sales inquiry submitted successfully"
 *                 inquiryId:
 *                   type: string
 *                   example: "INQ-1703123456789-a1b2c3d4e"
 *             example:
 *               success: true
 *               message: "Sales inquiry submitted successfully"
 *               inquiryId: "INQ-1703123456789-a1b2c3d4e"
 *       400:
 *         description: Bad request - validation errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Validation failed"
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                       message:
 *                         type: string
 *             example:
 *               error: "Validation failed"
 *               details:
 *                 - field: "email"
 *                   message: "Please enter a valid email address"
 *                 - field: "message"
 *                   message: "Message must be at least 20 characters"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
export async function POST(request: NextRequest) {
  try {
    // Get real IP address - check multiple headers in order of reliability
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const cfConnectingIp = request.headers.get('cf-connecting-ip') // Cloudflare
    const vercelIp = request.headers.get('x-vercel-forwarded-for') // Vercel specific
    const clientIp = request.headers.get('client-ip')

    // Parse x-forwarded-for to get the actual client IP (first in the chain)
    const ip = forwardedFor?.split(',')[0].trim() ||
                cfConnectingIp ||
                vercelIp?.split(',')[0].trim() ||
                realIp ||
                clientIp ||
                request.headers.get('x-forwarded-for')?.split(',')[0] || // Next.js built-in IP detection
                '127.0.0.1'

    // Log all headers for debugging IP detection
    console.log('IP Detection Debug:', {
      'x-forwarded-for': forwardedFor,
      'x-real-ip': realIp,
      'cf-connecting-ip': cfConnectingIp,
      'x-vercel-forwarded-for': vercelIp,
      'client-ip': clientIp,
      'forwardedIp': request.headers.get('x-forwarded-for')?.split(',')[0],
      'detected': ip
    })

    // Parse and validate request body
    const body = await request.json()
    const validatedData = salesInquirySchema.parse(body)

    // Generate unique inquiry ID for tracking
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 11)
    const inquiryId = `INQ-${timestamp}-${randomId}`

    // Get timestamp in user's timezone if provided
    const utcTime = new Date()

    // Convert to user's timezone and format as ISO string
    const userLocalTime = validatedData.userTimezone
      ? new Date(utcTime.toLocaleString('en-US', { timeZone: validatedData.userTimezone })).toISOString()
      : utcTime.toISOString()

    // Console log the incoming data for debugging
    console.log('=== NEW SALES INQUIRY RECEIVED ===')
    console.log('Inquiry ID:', inquiryId)
    console.log('Timestamp (UTC):', utcTime.toISOString())
    console.log('Timestamp (User Local):', userLocalTime)
    console.log('User Timezone:', validatedData.userTimezone || 'Not detected')
    console.log('Contact Information:', {
      name: validatedData.name,
      email: validatedData.email,
      phone: validatedData.phone
    })
    console.log('Inquiry Details:', {
      subject: validatedData.subject,
      context: validatedData.context || 'general',
      planName: validatedData.planName || 'N/A'
    })
    console.log('Message:', validatedData.message)
    console.log('Request Metadata:', {
      ip: ip,
      userAgent: request.headers.get('user-agent') || 'unknown',
      referrer: request.headers.get('referer') || 'direct',
      origin: request.headers.get('origin') || 'unknown',
      country: request.headers.get('cf-ipcountry') || 'unknown' // Cloudflare provides this
    })
    console.log('===================================')

    // Prepare webhook payload with all relevant information
    const webhookPayload = {
      inquiryId,
      timestamp: new Date().toISOString(),
      timestampUserLocal: userLocalTime,
      type: 'sales_inquiry',
      contact: {
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone
      },
      inquiry: {
        subject: validatedData.subject,
        message: validatedData.message,
        context: validatedData.context || 'general',
        planName: validatedData.planName
      },
      metadata: {
        source: 'website_contact_form',
        userAgent: request.headers.get('user-agent') || 'unknown',
        ip: ip,
        ipHeaders: {
          'x-forwarded-for': forwardedFor,
          'x-real-ip': realIp,
          'cf-connecting-ip': cfConnectingIp,
          'x-vercel-forwarded-for': vercelIp
        },
        location: {
          country: request.headers.get('cf-ipcountry') || 'unknown',
          timezone: validatedData.userTimezone || 'Not detected'
        },
        referrer: request.headers.get('referer') || 'direct',
        origin: request.headers.get('origin') || 'unknown',
        timestamp: new Date().toISOString()
      }
    }

    // Send data to webhook endpoint if configured
    const webhookUrl = process.env.SALES_INQUIRY_WEBHOOK_URL
    if (webhookUrl) {
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Source': 'document-chat-system-ai',
            'X-Inquiry-ID': inquiryId,
            ...(process.env.SALES_INQUIRY_WEBHOOK_SECRET && {
              'Authorization': `Bearer ${process.env.SALES_INQUIRY_WEBHOOK_SECRET}`
            })
          },
          body: JSON.stringify(webhookPayload)
        })

        if (!webhookResponse.ok) {
          console.error('Sales inquiry webhook failed:', {
            status: webhookResponse.status,
            statusText: webhookResponse.statusText,
            inquiryId
          })
        } else {
          console.log('Sales inquiry sent to webhook successfully:', inquiryId)
        }
      } catch (webhookError) {
        console.error('Failed to send sales inquiry to webhook:', {
          error: webhookError,
          inquiryId
        })
        // Don't fail the request if webhook fails - inquiry was still received
      }
    } else {
      // Log for manual processing if no webhook configured
      console.log('Sales inquiry received (no webhook configured):', {
        inquiryId,
        email: validatedData.email,
        context: validatedData.context,
        planName: validatedData.planName
      })
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Sales inquiry submitted successfully',
      inquiryId: inquiryId
    })

  } catch (error) {
    console.error('Sales inquiry API error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
