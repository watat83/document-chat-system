'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

export function EnvCheck() {
  const checks = [
    {
      name: 'Clerk Publishable Key',
      value: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      required: true,
      type: 'public'
    },
    {
      name: 'Database URL',
      value: process.env.DATABASE_URL,
      required: true,
      type: 'server',
      hideValue: true
    },
    {
      name: 'Node Environment',
      value: process.env.NODE_ENV,
      required: false,
      type: 'system'
    },
  ]

  const getIcon = (check: any) => {
    if (check.type === 'server') {
      return <AlertTriangle className="h-4 w-4 text-amber-500" />
    }
    if (check.value) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  const getStatus = (check: any) => {
    if (check.type === 'server') {
      return <Badge variant="secondary">Server-only</Badge>
    }
    if (check.value) {
      return <Badge variant="success">Available</Badge>
    }
    return <Badge variant="destructive">Missing</Badge>
  }

  const getValue = (check: any) => {
    if (check.type === 'server') {
      return 'Hidden (server-side only)'
    }
    if (check.hideValue && check.value) {
      return `${check.value.slice(0, 20)}...`
    }
    return check.value || 'Not set'
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Environment Configuration</CardTitle>
        <CardDescription>
          Check if required environment variables are properly configured
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {checks.map((check, index) => (
          <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              {getIcon(check)}
              <div>
                <div className="font-medium">{check.name}</div>
                <div className="text-sm text-muted-foreground">
                  {getValue(check)}
                </div>
              </div>
            </div>
            {getStatus(check)}
          </div>
        ))}
        
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h3 className="font-medium mb-2">Setup Instructions</h3>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>If you&apos;re getting authentication errors, check:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Clerk Publishable Key is set in environment variables</li>
              <li>You have a Clerk account and project set up</li>
              <li>Your Clerk project is configured correctly</li>
              <li>You are signed in to the application</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}