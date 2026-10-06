'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { z } from 'zod'

const contactSalesSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(20, 'Message must be at least 20 characters')
})

type ContactSalesFormData = z.infer<typeof contactSalesSchema>

interface ContactSalesModalProps {
  isOpen: boolean
  onClose: () => void
  context?: 'enterprise' | 'pricing' | 'general'
  planName?: string
}

const getPrefilledContent = (context: string = 'general', planName?: string) => {
  const subjects = {
    enterprise: 'Enterprise Plan Inquiry - Document Chat System',
    pricing: `${planName ? `${planName} Plan` : 'Pricing'} Inquiry - Document Chat System`,
    general: 'Sales Inquiry - Document Chat System'
  }

  const messages = {
    enterprise: `Hello Document Chat System Sales Team,

I'm interested in learning more about the Enterprise plan for my organization.

Please provide information about:
• Pricing and subscription options
• Implementation timeline and onboarding process
• Training and support included
• Custom integrations and features available
• Enterprise security and compliance features

Organization Details:
• Company: [Your company name]
• Estimated Users: [Number of users]
• Industry: [Your industry]
• Current Contracting Volume: [Annual contract volume]

I would appreciate the opportunity to schedule a demo and discuss how Document Chat System can help streamline our document management processes.

Best regards,`,

    pricing: `Hello Document Chat System Sales Team,

I'm interested in learning more about ${planName ? `the ${planName} plan` : 'your pricing options'} for my organization.

Please provide information about:
• Detailed pricing and subscription options
• Feature comparison between plans
• Implementation and onboarding process
• Training and support included
• Custom requirements and integrations

Organization Details:
• Company: [Your company name]
• Estimated Users: [Number of users]
• Industry: [Your industry]
• Current Contracting Volume: [Annual contract volume]

I would like to schedule a demo to see how Document Chat System can help with our document management needs.

Best regards,`,

    general: `Hello Document Chat System Sales Team,

I'm interested in learning more about Document Chat System for my organization.

Please provide information about:
• Available plans and pricing
• Key features and capabilities
• Implementation timeline
• Training and support options

Organization Details:
• Company: [Your company name]
• Industry: [Your industry]
• Current Contracting Volume: [Annual contract volume]

I would appreciate the opportunity to discuss how Document Chat System can help with our document management processes.

Best regards,`
  }

  return {
    subject: subjects[context as keyof typeof subjects] || subjects.general,
    message: messages[context as keyof typeof messages] || messages.general
  }
}

export function ContactSalesModal({ isOpen, onClose, context = 'general', planName }: ContactSalesModalProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [inquiryId, setInquiryId] = useState<string>('')
  const [submissionTime, setSubmissionTime] = useState<string>('')
  const prefilledContent = getPrefilledContent(context, planName)

  const [formData, setFormData] = useState<ContactSalesFormData>({
    name: '',
    email: '',
    phone: '',
    subject: prefilledContent.subject,
    message: prefilledContent.message
  })

  const [errors, setErrors] = useState<Partial<Record<keyof ContactSalesFormData, string>>>({})

  const handleInputChange = (field: keyof ContactSalesFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const validatedData = contactSalesSchema.parse(formData)

      // Get user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      const response = await fetch('/api/v1/sales-inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...validatedData,
          context,
          planName,
          userTimezone
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const result = await response.json()

      // Set inquiry ID and show confirmation
      setInquiryId(result.inquiryId || 'N/A')

      // Capture submission time in user's local timezone
      const now = new Date()
      const localTime = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      })
      setSubmissionTime(localTime)

      setShowConfirmation(true)

      // Reset form data
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: prefilledContent.subject,
        message: prefilledContent.message
      })

    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof ContactSalesFormData, string>> = {}
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof ContactSalesFormData] = err.message
          }
        })
        setErrors(fieldErrors)
      } else {
        toast({
          type: 'error',
          title: 'Error',
          description: 'Failed to send message. Please try again.'
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setShowConfirmation(false)
    setErrors({})
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{showConfirmation ? 'Thank You!' : 'Contact Sales'}</DialogTitle>
        </DialogHeader>

        {showConfirmation ? (
          <div className="space-y-6 py-4">
            {/* Success Animation and Header */}
            <div className="text-center space-y-4">
              <div className="relative">
                <div className="mx-auto w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="absolute inset-0 mx-auto w-20 h-20 bg-green-400 rounded-full animate-ping opacity-20"></div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">Successfully Submitted!</h3>
                <p className="text-base text-gray-600 max-w-md mx-auto">
                  Thank you for your interest in Document Chat System. Our sales team is excited to connect with you.
                </p>
              </div>
            </div>

            {/* Inquiry Details Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Inquiry Details
              </h4>
              <div className="space-y-3">
                <div className="flex items-start">
                  <span className="text-sm font-medium text-gray-600 w-24">Reference ID:</span>
                  <span className="font-mono text-sm bg-muted px-3 py-1 rounded-md border border-border">{inquiryId}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-sm font-medium text-gray-600 w-24">Email:</span>
                  <span className="text-sm text-gray-800">{formData.email}</span>
                </div>
                <div className="flex items-start">
                  <span className="text-sm font-medium text-gray-600 w-24">Submitted:</span>
                  <span className="text-sm text-gray-800">{submissionTime}</span>
                </div>
                {planName && (
                  <div className="flex items-start">
                    <span className="text-sm font-medium text-gray-600 w-24">Plan Interest:</span>
                    <span className="text-sm font-semibold text-blue-600">{planName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Next Steps */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-900 flex items-center">
                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                What Happens Next
              </h4>
              <div className="space-y-2">
                <div className="flex items-start bg-card rounded-lg p-3 border border-border">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 font-semibold text-sm">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Email Confirmation</p>
                    <p className="text-gray-600 text-sm">You'll receive a confirmation email within the next few minutes</p>
                  </div>
                </div>
                <div className="flex items-start bg-card rounded-lg p-3 border border-border">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 font-semibold text-sm">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Sales Team Review</p>
                    <p className="text-gray-600 text-sm">Our team will review your requirements and prepare a personalized response</p>
                  </div>
                </div>
                <div className="flex items-start bg-card rounded-lg p-3 border border-border">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="text-blue-600 font-semibold text-sm">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">Schedule Demo</p>
                    <p className="text-gray-600 text-sm">We'll reach out within 24 hours to schedule a demo at your convenience</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                onClick={handleClose}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-200"
              >
                Got it, thanks!
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="John Doe"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="phone">Phone Number *</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="(555) 123-4567"
                className={errors.phone ? 'border-red-500' : ''}
              />
              {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              placeholder="john.doe@company.com"
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              type="text"
              value={formData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              className={errors.subject ? 'border-red-500' : ''}
            />
            {errors.subject && <p className="text-sm text-red-500 mt-1">{errors.subject}</p>}
          </div>

          <div>
            <Label htmlFor="message">Message *</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
              rows={12}
              className={errors.message ? 'border-red-500' : ''}
            />
            {errors.message && <p className="text-sm text-red-500 mt-1">{errors.message}</p>}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? 'Sending...' : 'Send Message'}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
