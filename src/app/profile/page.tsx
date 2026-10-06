'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { AppLayout } from '@/components/layout'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Building2,
  MapPin,
  Mail,
  Phone,
  Globe,
  Save,
  User,
  UserX,
  AlertTriangle,
} from 'lucide-react'
import { useNotify } from '@/contexts/notification-context'
import { Profile } from '@/types'
import { useCSRF } from '@/hooks/useCSRF'
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog'
import { AccountDeletionStatus } from '@/components/account/account-deletion-status'

export default function ProfilePage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const notify = useNotify()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const { token: csrfToken, addToHeaders } = useCSRF()
  const initialLoadRef = useRef(false)

  // Form state
  const [formData, setFormData] = useState({
    companyName: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',
  })

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/profile')
      const data = await response.json()

      if (data.success) {
        setProfile(data.data)
        setFormData({
          companyName: data.data.companyName || '',
          website: data.data.website || '',
          addressLine1: data.data.addressLine1 || '',
          addressLine2: data.data.addressLine2 || '',
          city: data.data.city || '',
          state: data.data.state || '',
          zipCode: data.data.zipCode || '',
          primaryContactName: data.data.primaryContactName || '',
          primaryContactEmail: data.data.primaryContactEmail || '',
          primaryContactPhone: data.data.primaryContactPhone || '',
        })
      } else if (data.needsUserCreation) {
        // Create user
        const syncResponse = await fetch('/api/v1/user/sync', {
          method: 'POST',
        })
        const syncData = await syncResponse.json()

        if (syncData.success) {
          // Retry fetching profile
          const retryResponse = await fetch('/api/v1/profile')
          const retryData = await retryResponse.json()

          if (retryData.success) {
            setProfile(retryData.data)
            setFormData({
              companyName: retryData.data.companyName || '',
              website: retryData.data.website || '',
              addressLine1: retryData.data.addressLine1 || '',
              addressLine2: retryData.data.addressLine2 || '',
              city: retryData.data.city || '',
              state: retryData.data.state || '',
              zipCode: retryData.data.zipCode || '',
              primaryContactName: retryData.data.primaryContactName || '',
              primaryContactEmail: retryData.data.primaryContactEmail || '',
              primaryContactPhone: retryData.data.primaryContactPhone || '',
            })
          }
        }
      } else {
        setError(data.error || 'Failed to load profile')
      }
    } catch (err) {
      console.error('Profile fetch error:', err)
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isLoaded && isSignedIn && !initialLoadRef.current) {
      initialLoadRef.current = true
      fetchProfile()
    }
  }, [isLoaded, isSignedIn, fetchProfile])

  const handleSave = async () => {
    if (!csrfToken) {
      notify.error('Security token not available. Please refresh the page.')
      return
    }

    if (!formData.companyName.trim()) {
      notify.error('Company name is required')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/v1/profile', {
        method: 'PATCH',
        headers: addToHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        setProfile(data.data)
        notify.success('Profile updated successfully')
      } else {
        notify.error(data.error || 'Failed to update profile')
      }
    } catch (err) {
      console.error('Profile update error:', err)
      notify.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  if (!isLoaded || loading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-pulse">Loading...</div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!isSignedIn) {
    return (
      <AppLayout showNavigation={false}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Required</CardTitle>
                <CardDescription>
                  Please sign in to access your profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() =>
                    router.push(
                      `/sign-in/?redirect_url=${encodeURIComponent('/profile')}`
                    )
                  }
                >
                  Sign In
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Profile Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your account and company information
          </p>
        </div>

        {error && (
          <Alert className="mb-6" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Information
              </CardTitle>
              <CardDescription>
                Basic information about your company
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">
                  Company Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                  placeholder="Enter your company name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) =>
                    setFormData({ ...formData, website: e.target.value })
                  }
                  placeholder="https://example.com"
                />
              </div>
            </CardContent>
          </Card>

          {/* Address Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address
              </CardTitle>
              <CardDescription>Company address details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="addressLine1">Address Line 1</Label>
                <Input
                  id="addressLine1"
                  value={formData.addressLine1}
                  onChange={(e) =>
                    setFormData({ ...formData, addressLine1: e.target.value })
                  }
                  placeholder="Street address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="addressLine2">Address Line 2</Label>
                <Input
                  id="addressLine2"
                  value={formData.addressLine2}
                  onChange={(e) =>
                    setFormData({ ...formData, addressLine2: e.target.value })
                  }
                  placeholder="Apartment, suite, etc. (optional)"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    placeholder="City"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        state: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="CA"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={formData.zipCode}
                  onChange={(e) =>
                    setFormData({ ...formData, zipCode: e.target.value })
                  }
                  placeholder="12345"
                  maxLength={10}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Contact Information
              </CardTitle>
              <CardDescription>Primary contact details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryContactName">Contact Name</Label>
                <Input
                  id="primaryContactName"
                  value={formData.primaryContactName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      primaryContactName: e.target.value,
                    })
                  }
                  placeholder="Full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryContactEmail">Email</Label>
                <Input
                  id="primaryContactEmail"
                  type="email"
                  value={formData.primaryContactEmail}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      primaryContactEmail: e.target.value,
                    })
                  }
                  placeholder="email@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryContactPhone">Phone</Label>
                <Input
                  id="primaryContactPhone"
                  type="tel"
                  value={formData.primaryContactPhone}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      primaryContactPhone: e.target.value,
                    })
                  }
                  placeholder="(555) 123-4567"
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-4">
            <Button onClick={handleSave} disabled={saving || !csrfToken}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>

          {/* Account Deletion */}
          <AccountDeletionStatus />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-red-600">
                <UserX className="h-5 w-5 mr-2" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that affect your entire account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>Warning:</strong> Account deletion is permanent and
                  cannot be undone. All your data will be deleted after a 30-day
                  grace period.
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
                <div>
                  <h4 className="font-semibold text-red-900">Delete Account</h4>
                  <p className="text-sm text-red-700 mt-1">
                    Permanently delete your account and all associated data.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <UserX className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </div>

              {user && (
                <div className="text-xs text-gray-500 pt-4 border-t">
                  <strong>Account:</strong>{' '}
                  {user.emailAddresses[0]?.emailAddress} • <strong>User ID:</strong>{' '}
                  {user.id}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Account Deletion Dialog */}
        <DeleteAccountDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
        />
      </div>
    </AppLayout>
  )
}
