'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  Users,
  Zap,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Settings,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'

interface PricingPlan {
  id: string
  planType: string
  displayName: string
  description: string
  monthlyPrice: number
  yearlyPrice?: number
  currency: string
  features: {
    list: string[]
    detailed?: Record<string, any>
  }
  limits: {
    seats: number
    savedSearches: number
    aiCreditsPerMonth: number
    matchScoreCalculations: number
  }
  isActive: boolean
  isPopular: boolean
  displayOrder: number
  metadata?: Record<string, any>
  stripeMonthlyPriceId?: string
  stripeYearlyPriceId?: string
}

// Stripe sync interfaces
interface SyncResult {
  planType: string
  success: boolean
  stripeProductId?: string
  stripePriceId?: string
  message?: string
  error?: string
  details?: {
    productId?: string
    priceId?: string
    amount?: number
    currency?: string
  }
}

interface SyncResponse {
  success: boolean
  message: string
  environment: string
  results: SyncResult[]
  summary: {
    total: number
    successful: number
    failed: number
  }
}

export function PricingPlanManager() {
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null)
  const [deletingPlan, setDeletingPlan] = useState<PricingPlan | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Stripe sync state
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncEnvironment, setSyncEnvironment] = useState<
    'development' | 'staging' | 'production'
  >('development')
  const [forceUpdate, setForceUpdate] = useState(false)
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])
  const [syncResults, setSyncResults] = useState<SyncResult[]>([])
  const [lastSyncResponse, setLastSyncResponse] = useState<SyncResponse | null>(
    null
  )

  const { toast } = useToast()

  // Form state for create/edit
  const [formData, setFormData] = useState({
    planType: '',
    displayName: '',
    description: '',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [''],
    limits: {
      seats: 1,
      savedSearches: 1,
      aiCreditsPerMonth: 0,
      matchScoreCalculations: 50,
    },
    isActive: true,
    isPopular: false,
    displayOrder: 0,
  })

  useEffect(() => {
    fetchPlans()
  }, [])

  async function fetchPlans() {
    try {
      setLoading(true)
      const response = await fetch(
        '/api/v1/admin/pricing-plans?includeStripeData=true'
      )
      if (!response.ok) throw new Error('Failed to fetch plans')

      const data = await response.json()
      setPlans(data.data || [])
    } catch (error) {
      console.error('Failed to fetch plans:', error)
      toast({
        title: 'Error',
        description: 'Failed to load pricing plans',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePlan = async () => {
    try {
      const response = await fetch('/api/v1/admin/pricing-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          monthlyPrice: Math.round(formData.monthlyPrice * 100), // Convert to cents
          yearlyPrice: formData.yearlyPrice
            ? Math.round(formData.yearlyPrice * 100)
            : null,
          features: {
            list: formData.features.filter((f) => f.trim()),
            detailed: {},
          },
          createStripeProducts: true, // Enable Stripe sync for bi-directional updates
        }),
      })

      if (!response.ok) {
        const errorResponse = await response.json()
        throw new Error(errorResponse.details || 'Failed to create plan')
      }

      toast({
        title: 'Success',
        description: 'Pricing plan created successfully',
      })

      setShowCreateDialog(false)
      resetForm()
      fetchPlans()
      
      // Auto-sync to Stripe after successful creation
      try {
        await fetch('/api/v1/admin/pricing-plans/sync-stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environment: 'development', // Default to development
            forceUpdate: true
          })
        })
        console.log('✅ Auto-sync to Stripe completed after plan creation')
      } catch (syncError) {
        console.warn('⚠️ Auto-sync to Stripe failed after plan creation:', syncError)
        // Don't block the UI for sync failures
      }
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create plan',
        variant: 'destructive',
      })
    }
  }

  const handleUpdatePlan = async () => {
    if (!editingPlan) return

    try {
      const response = await fetch('/api/v1/admin/pricing-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPlan.id,
          ...formData,
          monthlyPrice: Math.round(formData.monthlyPrice * 100),
          yearlyPrice: formData.yearlyPrice
            ? Math.round(formData.yearlyPrice * 100)
            : null,
          features: {
            list: formData.features.filter((f) => f.trim()),
            detailed: editingPlan.features.detailed || {},
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Failed to update plan')
      }

      toast({
        title: 'Success',
        description: 'Pricing plan updated successfully',
      })

      setEditingPlan(null)
      resetForm()
      fetchPlans()
      
      // Auto-sync to Stripe after successful update
      try {
        await fetch('/api/v1/admin/pricing-plans/sync-stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planIds: [editingPlan.id],
            environment: 'development',
            forceUpdate: true
          })
        })
        console.log('✅ Auto-sync to Stripe completed after plan update')
      } catch (syncError) {
        console.warn('⚠️ Auto-sync to Stripe failed after plan update:', syncError)
        // Don't block the UI for sync failures
      }
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update plan',
        variant: 'destructive',
      })
    }
  }

  const handleDeletePlan = async () => {
    if (!deletingPlan) return

    try {
      const response = await fetch(
        `/api/v1/admin/pricing-plans?id=${deletingPlan.id}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Failed to delete plan')
      }

      toast({
        title: 'Success',
        description: 'Pricing plan deleted successfully',
      })

      setDeletingPlan(null)
      fetchPlans()
      
      // Auto-sync to Stripe after successful deletion (will deactivate the product)
      try {
        await fetch('/api/v1/admin/pricing-plans/sync-stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environment: 'development',
            forceUpdate: true
          })
        })
        console.log('✅ Auto-sync to Stripe completed after plan deletion')
      } catch (syncError) {
        console.warn('⚠️ Auto-sync to Stripe failed after plan deletion:', syncError)
        // Don't block the UI for sync failures
      }
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete plan',
        variant: 'destructive',
      })
    }
  }

  const resetForm = () => {
    setFormData({
      planType: '',
      displayName: '',
      description: '',
      monthlyPrice: 0,
      yearlyPrice: 0,
      features: [''],
      limits: {
        seats: 1,
        savedSearches: 1,
        aiCreditsPerMonth: 0,
        matchScoreCalculations: 50,
      },
      isActive: true,
      isPopular: false,
      displayOrder: 0,
    })
  }

  // Stripe sync functions
  const handleStripeSync = async () => {
    try {
      setSyncing(true)
      setSyncResults([])

      const requestBody = {
        environment: syncEnvironment,
        forceUpdate,
        ...(selectedPlanIds.length > 0 ? { planIds: selectedPlanIds } : {}),
      }

      const response = await fetch('/api/v1/admin/pricing-plans/sync-stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || 'Sync failed')
      }

      const data: SyncResponse = await response.json()
      setLastSyncResponse(data)
      setSyncResults(data.results)

      toast({
        title: data.success ? 'Sync Completed' : 'Sync Completed with Errors',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      })

      // Refresh plans to show updated Stripe data
      fetchPlans()
    } catch (error) {
      console.error('Stripe sync error:', error)
      toast({
        title: 'Sync Failed',
        description:
          error instanceof Error ? error.message : 'Failed to sync with Stripe',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  const resetSyncDialog = () => {
    setSyncResults([])
    setLastSyncResponse(null)
    setSelectedPlanIds([])
    setForceUpdate(false)
    setSyncEnvironment('development')
  }

  const openEditDialog = (plan: PricingPlan) => {
    setFormData({
      planType: plan.planType,
      displayName: plan.displayName,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice / 100,
      yearlyPrice: plan.yearlyPrice ? plan.yearlyPrice / 100 : 0,
      features: plan.features.list,
      limits: plan.limits,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      displayOrder: plan.displayOrder,
    })
    setEditingPlan(plan)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Pricing Plan Management</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage dynamic pricing plans
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowSyncDialog(true)}
            disabled={plans.length === 0}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync to Stripe
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Plan
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {plans.map((plan) => (
          <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {plan.displayName}
                    <Badge variant="outline" className="text-xs">
                      {plan.planType}
                    </Badge>
                    {plan.isPopular && (
                      <Badge className="bg-blue-500">Popular</Badge>
                    )}
                    {!plan.isActive && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(plan)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingPlan(plan)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="font-medium flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    Pricing
                  </div>
                  <div>
                    {plan.monthlyPrice > 0
                      ? `$${plan.monthlyPrice / 100}/mo`
                      : 'Custom'}
                    {plan.yearlyPrice && ` • $${plan.yearlyPrice / 100}/yr`}
                  </div>
                </div>
                <div>
                  <div className="font-medium flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    Seats
                  </div>
                  <div>
                    {plan.limits.seats === -1 ? 'Unlimited' : plan.limits.seats}
                  </div>
                </div>
                <div>
                  <div className="font-medium flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    AI Credits
                  </div>
                  <div>
                    {plan.limits.aiCreditsPerMonth === -1
                      ? 'Unlimited'
                      : plan.limits.aiCreditsPerMonth}
                  </div>
                </div>
                <div>
                  <div className="font-medium flex items-center gap-1">
                    <Search className="h-4 w-4" />
                    Saved Searches
                  </div>
                  <div>
                    {plan.limits.savedSearches === -1
                      ? 'Unlimited'
                      : plan.limits.savedSearches}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="font-medium text-sm mb-2">Features</div>
                <div className="flex flex-wrap gap-2">
                  {plan.features.list.slice(0, 3).map((feature, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                  {plan.features.list.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{plan.features.list.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>

              {/* Stripe sync info */}
              {(plan.stripeMonthlyPriceId ||
                plan.metadata?.stripeProductId) && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Settings className="h-3 w-3" />
                      Stripe Integration
                    </div>
                    {plan.stripeMonthlyPriceId && (
                      <div className="mt-1">
                        Price ID: {plan.stripeMonthlyPriceId}
                      </div>
                    )}
                    {plan.metadata?.stripeProductId && (
                      <div className="mt-1">
                        Product ID: {plan.metadata.stripeProductId}
                      </div>
                    )}
                    {plan.metadata?.lastStripSync && (
                      <div className="mt-1">
                        Last Sync:{' '}
                        {new Date(
                          plan.metadata.lastStripSync
                        ).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || !!editingPlan}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false)
            setEditingPlan(null)
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? 'Edit Pricing Plan' : 'Create New Pricing Plan'}
            </DialogTitle>
            <DialogDescription>
              {editingPlan
                ? 'Update the pricing plan details'
                : 'Create a new pricing plan for your platform'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="planType">Plan Type</Label>
                <Input
                  id="planType"
                  value={formData.planType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      planType: e.target.value
                        .toUpperCase()
                        .replace(/\s/g, '_'),
                    })
                  }
                  placeholder="e.g., STARTER, PRO"
                  disabled={!!editingPlan}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) =>
                    setFormData({ ...formData, displayName: e.target.value })
                  }
                  placeholder="e.g., Starter Plan"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description of the plan"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyPrice">Monthly Price ($)</Label>
                <Input
                  id="monthlyPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.monthlyPrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      monthlyPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearlyPrice">Yearly Price ($)</Label>
                <Input
                  id="yearlyPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.yearlyPrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      yearlyPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Features</Label>
              {formData.features.map((feature, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={feature}
                    onChange={(e) => {
                      const newFeatures = [...formData.features]
                      newFeatures[index] = e.target.value
                      setFormData({ ...formData, features: newFeatures })
                    }}
                    placeholder="Feature description"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newFeatures = formData.features.filter(
                        (_, i) => i !== index
                      )
                      setFormData({ ...formData, features: newFeatures })
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData({
                    ...formData,
                    features: [...formData.features, ''],
                  })
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Feature
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Usage Limits</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="seats">Seats (-1 for unlimited)</Label>
                  <Input
                    id="seats"
                    type="number"
                    min="-1"
                    value={formData.limits.seats}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        limits: {
                          ...formData.limits,
                          seats: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="savedSearches">
                    Saved Searches (-1 for unlimited)
                  </Label>
                  <Input
                    id="savedSearches"
                    type="number"
                    min="-1"
                    value={formData.limits.savedSearches}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        limits: {
                          ...formData.limits,
                          savedSearches: parseInt(e.target.value) || 1,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aiCredits">
                    AI Credits/Month (-1 for unlimited)
                  </Label>
                  <Input
                    id="aiCredits"
                    type="number"
                    min="-1"
                    value={formData.limits.aiCreditsPerMonth}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        limits: {
                          ...formData.limits,
                          aiCreditsPerMonth: parseInt(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="matchScores">
                    Match Scores/Month (-1 for unlimited)
                  </Label>
                  <Input
                    id="matchScores"
                    type="number"
                    min="-1"
                    value={formData.limits.matchScoreCalculations}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        limits: {
                          ...formData.limits,
                          matchScoreCalculations:
                            parseInt(e.target.value) || 50,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked })
                  }
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="isPopular"
                  checked={formData.isPopular}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isPopular: checked })
                  }
                />
                <Label htmlFor="isPopular">Mark as Popular</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                type="number"
                min="0"
                value={formData.displayOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    displayOrder: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                setEditingPlan(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingPlan ? handleUpdatePlan : handleCreatePlan}>
              {editingPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingPlan}
        onOpenChange={(open) => !open && setDeletingPlan(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pricing Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &ldquo;
              {deletingPlan?.displayName}&rdquo; plan? This action cannot be
              undone.
              {deletingPlan?.planType && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                  <strong>Warning:</strong> Make sure no active subscriptions
                  are using this plan.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlan}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stripe Sync Dialog */}
      <Dialog
        open={showSyncDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowSyncDialog(false)
            if (!syncing) {
              resetSyncDialog()
            }
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sync Pricing Plans to Stripe</DialogTitle>
            <DialogDescription>
              Sync your pricing plans to Stripe to enable subscription billing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!lastSyncResponse && (
              <>
                {/* Environment Selection */}
                <div className="space-y-2">
                  <Label>Target Environment</Label>
                  <Select
                    value={syncEnvironment}
                    onValueChange={(
                      value: 'development' | 'staging' | 'production'
                    ) => setSyncEnvironment(value)}
                    disabled={syncing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Products will be created with environment-specific naming
                  </p>
                </div>

                {/* Plan Selection */}
                <div className="space-y-3">
                  <Label>Select Plans to Sync</Label>
                  <div className="text-sm text-muted-foreground mb-2">
                    Leave empty to sync all active plans
                  </div>
                  <div className="grid gap-2 max-h-40 overflow-y-auto border rounded p-3">
                    {plans
                      .filter((p) => p.isActive)
                      .map((plan) => (
                        <div
                          key={plan.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={plan.id}
                            checked={selectedPlanIds.includes(plan.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedPlanIds([
                                  ...selectedPlanIds,
                                  plan.id,
                                ])
                              } else {
                                setSelectedPlanIds(
                                  selectedPlanIds.filter((id) => id !== plan.id)
                                )
                              }
                            }}
                            disabled={syncing}
                          />
                          <Label
                            htmlFor={plan.id}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex justify-between items-center">
                              <span>
                                {plan.displayName} ({plan.planType})
                              </span>
                              <span className="text-muted-foreground">
                                ${plan.monthlyPrice / 100}/month
                              </span>
                            </div>
                          </Label>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Force Update Option */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="forceUpdate"
                    checked={forceUpdate}
                    onCheckedChange={setForceUpdate}
                    disabled={syncing}
                  />
                  <Label htmlFor="forceUpdate" className="text-sm">
                    Force update existing Stripe products
                  </Label>
                </div>
              </>
            )}

            {/* Sync Progress */}
            {syncing && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Syncing plans to Stripe...</span>
                </div>
                <Progress value={undefined} className="w-full" />
              </div>
            )}

            {/* Sync Results */}
            {lastSyncResponse && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Sync Results</h4>
                  <Badge
                    variant={
                      lastSyncResponse.success ? 'default' : 'destructive'
                    }
                  >
                    {lastSyncResponse.success
                      ? 'Success'
                      : 'Completed with Errors'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {lastSyncResponse.summary.total}
                    </div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {lastSyncResponse.summary.successful}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Successful
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {lastSyncResponse.summary.failed}
                    </div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {syncResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        result.success
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <div>
                            <div className="font-medium">{result.planType}</div>
                            <div
                              className={`text-sm ${
                                result.success
                                  ? 'text-green-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {result.success ? result.message : result.error}
                            </div>
                            {result.success && result.details && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Product: {result.details.productId}
                                <br />
                                {result.details.priceId &&
                                  `Price: ${result.details.priceId}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSyncDialog(false)
                resetSyncDialog()
              }}
              disabled={syncing}
            >
              {lastSyncResponse ? 'Close' : 'Cancel'}
            </Button>
            {!lastSyncResponse && (
              <Button
                onClick={handleStripeSync}
                disabled={
                  syncing ||
                  (selectedPlanIds.length === 0 &&
                    plans.filter((p) => p.isActive).length === 0)
                }
              >
                {syncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync to Stripe
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
