'use client'

import React from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { Shield, User, Key, TestTube, AlertCircle, CheckCircle } from 'lucide-react'

export function AuthDebug() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const { user } = useUser()
  const { theme } = useTheme()

  const [tokenInfo, setTokenInfo] = React.useState<string>('Loading...')
  const [authTestResult, setAuthTestResult] = React.useState<any>(null)
  const [notificationTestResult, setNotificationTestResult] = React.useState<any>(null)
  const [isTestingAuth, setIsTestingAuth] = React.useState(false)
  const [isTestingNotifications, setIsTestingNotifications] = React.useState(false)

  React.useEffect(() => {
    async function checkToken() {
      try {
        const token = await getToken()
        setTokenInfo(token ? 'Token available' : 'No token available')
      } catch (error) {
        setTokenInfo(`Token error: ${error}`)
      }
    }
    
    if (isLoaded && isSignedIn) {
      checkToken()
    }
  }, [isLoaded, isSignedIn, getToken])

  const testAuth = async () => {
    setIsTestingAuth(true)
    try {
      const response = await fetch('/api/v1/auth-test')
      const data = await response.json()
      setAuthTestResult(data)
    } catch (error) {
      setAuthTestResult({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsTestingAuth(false)
    }
  }

  const testNotifications = async () => {
    setIsTestingNotifications(true)
    try {
      const token = await getToken()
      const response = await fetch('/api/v1/notifications?limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      const data = await response.json()
      setNotificationTestResult(data)
    } catch (error) {
      setNotificationTestResult({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsTestingNotifications(false)
    }
  }

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? (
      <CheckCircle className="h-4 w-4 text-success-600 dark:text-success-400" />
    ) : (
      <AlertCircle className="h-4 w-4 text-error-600 dark:text-error-400" />
    )
  }

  return (
    <Card className="w-full max-w-3xl mx-auto border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
            <Shield className="h-5 w-5 text-primary dark:text-primary-400" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Authentication Debug Panel
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Current authentication state and API connectivity status
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {/* Authentication Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Authentication Loaded</span>
              {getStatusIcon(isLoaded)}
            </div>
            <Badge variant={isLoaded ? "default" : "destructive"} className="text-xs">
              {isLoaded ? "System Ready" : "Loading..."}
            </Badge>
          </div>
          
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">User Session</span>
              {getStatusIcon(isSignedIn)}
            </div>
            <Badge variant={isSignedIn ? "default" : "destructive"} className="text-xs">
              {isSignedIn ? "Authenticated" : "Not Signed In"}
            </Badge>
          </div>
          
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">User ID</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-900 p-2 rounded border">
              {userId || 'No user ID available'}
            </div>
          </div>
          
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-900 p-2 rounded border">
              {user?.emailAddresses[0]?.emailAddress || 'No email available'}
            </div>
          </div>
        </div>
        
        {/* Token Status */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Authentication Token</span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <code className="text-xs text-gray-600 dark:text-gray-400 break-all">
              {isLoaded && isSignedIn ? tokenInfo : 'User not authenticated'}
            </code>
          </div>
        </div>
        
        {/* API Testing */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TestTube className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">API Connectivity Tests</span>
          </div>
          
          <div className="flex gap-3">
            <Button 
              onClick={testAuth}
              disabled={isTestingAuth}
              variant="outline"
              size="sm"
              className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {isTestingAuth ? 'Testing...' : 'Test Authentication API'}
            </Button>
            
            <Button 
              onClick={testNotifications}
              disabled={isTestingNotifications || !isSignedIn}
              variant="outline"
              size="sm"
              className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {isTestingNotifications ? 'Testing...' : 'Test Notifications API'}
            </Button>
          </div>
        </div>
        
        {/* Test Results */}
        {authTestResult && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Authentication API Test Result</span>
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-40">
              {JSON.stringify(authTestResult, null, 2)}
            </pre>
          </div>
        )}
        
        {notificationTestResult && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notifications API Test Result</span>
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-40">
              {JSON.stringify(notificationTestResult, null, 2)}
            </pre>
          </div>
        )}
        
        {/* User Details */}
        {user && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Complete User Profile</span>
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-48">
              {JSON.stringify({
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                emailAddresses: user.emailAddresses.map(e => e.emailAddress),
                phoneNumbers: user.phoneNumbers.map(p => p.phoneNumber),
                hasImage: !!user.hasImage,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastSignInAt: user.lastSignInAt,
                twoFactorEnabled: user.twoFactorEnabled,
                publicMetadata: user.publicMetadata,
              }, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}