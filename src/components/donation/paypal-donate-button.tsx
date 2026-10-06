'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart } from 'lucide-react'

interface PayPalDonateButtonProps {
  email?: string // Your PayPal email - you'll need to provide this
  itemName?: string
  currency?: string
  variant?: 'button' | 'card'
  className?: string
}

export function PayPalDonateButton({
  email = process.env.NEXT_PUBLIC_PAYPAL_EMAIL || '',
  itemName = 'Support GovMatch AI - Free AI Models',
  currency = 'USD',
  variant = 'button',
  className = ''
}: PayPalDonateButtonProps) {

  // Don't render if no email is configured
  if (!email) {
    console.warn('PayPal email not configured. Set NEXT_PUBLIC_PAYPAL_EMAIL environment variable.')
    return null
  }

  // PayPal donation link
  const donateUrl = `https://www.paypal.com/donate/?business=${encodeURIComponent(email)}&item_name=${encodeURIComponent(itemName)}&currency_code=${currency}`

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Support Free AI Access
          </CardTitle>
          <CardDescription>
            Help us keep AI models free for everyone by covering API costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Your donations help us provide free AI-powered document analysis, chat,
            and matching services to users who can&apos;t afford premium AI subscriptions.
            Every contribution makes a difference!
          </p>
          <Button
            onClick={() => window.open(donateUrl, '_blank')}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Heart className="h-4 w-4 mr-2" />
            Donate via PayPal
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Button
      onClick={() => window.open(donateUrl, '_blank')}
      variant="outline"
      className={`border-blue-600 text-blue-600 hover:bg-blue-50 ${className}`}
    >
      <Heart className="h-4 w-4 mr-2" />
      Donate
    </Button>
  )
}

// Alternative: PayPal embedded button (more customizable)
interface PayPalDonateFormProps {
  email?: string
  itemName?: string
  currency?: string
  presetAmounts?: number[]
  className?: string
}

export function PayPalDonateForm({
  email = process.env.NEXT_PUBLIC_PAYPAL_EMAIL || '',
  itemName = 'Support GovMatch AI',
  currency = 'USD',
  presetAmounts = [5, 10, 25, 50, 100],
  className = ''
}: PayPalDonateFormProps) {

  // Don't render if no email is configured
  if (!email) {
    console.warn('PayPal email not configured. Set NEXT_PUBLIC_PAYPAL_EMAIL environment variable.')
    return null
  }

  return (
    <div className={className}>
      <form
        action="https://www.paypal.com/donate"
        method="post"
        target="_blank"
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="business" value={email} />
        <input type="hidden" name="item_name" value={itemName} />
        <input type="hidden" name="currency_code" value={currency} />

        <div className="flex flex-wrap gap-2">
          {presetAmounts.map(amount => (
            <Button
              key={amount}
              type="submit"
              variant="outline"
              className="flex-1 min-w-[80px]"
              onClick={(e) => {
                // Dynamically set the amount when clicked
                const form = e.currentTarget.closest('form')
                const amountInput = form?.querySelector('input[name="amount"]') as HTMLInputElement
                if (amountInput) {
                  amountInput.value = amount.toString()
                }
              }}
            >
              ${amount}
            </Button>
          ))}
        </div>

        <input type="hidden" name="amount" value="" />

        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          <Heart className="h-4 w-4 mr-2" />
          Donate via PayPal
        </Button>
      </form>
    </div>
  )
}
