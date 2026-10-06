'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { 
  Settings, 
  Save, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Trash2,
  Download,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react'

/**
 * Error Configuration Manager
 * 
 * Admin interface for managing error handling configuration via API.
 * Allows runtime updates to error configuration without restarting the application.
 */

interface EnvVar {
  key: string
  configPath: string
  description: string
  type: 'number' | 'boolean' | 'string' | 'array'
  defaultValue?: any
}

interface ConfigOverride {
  [key: string]: string | number | boolean
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  recommendations: Array<{
    key: string
    current: any
    recommended: any
    reason: string
  }>
}

export function ErrorConfigManager() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // Configuration state
  const [currentConfig, setCurrentConfig] = useState<any>(null)
  const [availableVars, setAvailableVars] = useState<EnvVar[]>([])
  const [currentOverrides, setCurrentOverrides] = useState<ConfigOverride>({})
  const [pendingChanges, setPendingChanges] = useState<ConfigOverride>({})
  
  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [lastValidation, setLastValidation] = useState<Date | null>(null)
  
  // UI state
  const [alerts, setAlerts] = useState<Array<{ type: 'success' | 'error' | 'warning' | 'info'; message: string }>>([])
  const [searchFilter, setSearchFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Load initial configuration
  useEffect(() => {
    loadConfiguration()
  }, [])

  // Auto-validate changes
  useEffect(() => {
    if (Object.keys(pendingChanges).length > 0) {
      const timeoutId = setTimeout(() => {
        validateChanges()
      }, 1000) // Debounce validation

      return () => clearTimeout(timeoutId)
    }
  }, [pendingChanges])

  async function loadConfiguration() {
    try {
      setIsLoading(true)
      const response = await fetch('/api/v1/admin/error-config')
      
      if (!response.ok) {
        throw new Error('Failed to load configuration')
      }
      
      const data = await response.json()
      setCurrentConfig(data.config)
      setAvailableVars(data.availableVars)
      setCurrentOverrides(data.envVarOverrides)
      setPendingChanges({})
      setValidationResult(null)
      
      addAlert('success', 'Configuration loaded successfully')
    } catch (error) {
      console.error('Failed to load configuration:', error)
      addAlert('error', 'Failed to load configuration')
    } finally {
      setIsLoading(false)
    }
  }

  async function validateChanges() {
    if (Object.keys(pendingChanges).length === 0) {
      setValidationResult(null)
      return
    }

    try {
      setIsValidating(true)
      const response = await fetch('/api/v1/admin/error-config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateType: 'envVars',
          envVars: { ...currentOverrides, ...pendingChanges }
        })
      })
      
      if (!response.ok) {
        throw new Error('Validation failed')
      }
      
      const result = await response.json()
      setValidationResult(result)
      setLastValidation(new Date())
    } catch (error) {
      console.error('Validation failed:', error)
      addAlert('error', 'Validation failed')
    } finally {
      setIsValidating(false)
    }
  }

  const saveConfiguration = async () => {
    if (Object.keys(pendingChanges).length === 0) {
      addAlert('info', 'No changes to save')
      return
    }

    try {
      setIsSaving(true)
      const response = await fetch('/api/v1/admin/error-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateType: 'envVars',
          envVars: pendingChanges,
          validate: true
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save configuration')
      }
      
      const data = await response.json()
      setCurrentConfig(data.updatedConfig)
      setCurrentOverrides({ ...currentOverrides, ...pendingChanges })
      setPendingChanges({})
      setValidationResult(null)
      
      addAlert('success', `Configuration saved successfully (${Object.keys(pendingChanges).length} changes applied)`)
    } catch (error) {
      console.error('Failed to save configuration:', error)
      addAlert('error', `Failed to save configuration: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const resetConfiguration = async () => {
    if (!confirm('Are you sure you want to reset all configuration overrides to environment defaults?')) {
      return
    }

    try {
      const response = await fetch('/api/v1/admin/error-config', {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error('Failed to reset configuration')
      }
      
      await loadConfiguration()
      addAlert('success', 'Configuration reset to environment defaults')
    } catch (error) {
      console.error('Failed to reset configuration:', error)
      addAlert('error', 'Failed to reset configuration')
    }
  }

  const updateValue = (key: string, value: any, type: string) => {
    let processedValue = value

    // Type conversion
    if (type === 'number') {
      processedValue = parseFloat(value) || 0
    } else if (type === 'boolean') {
      processedValue = value === true || value === 'true'
    }

    setPendingChanges(prev => ({
      ...prev,
      [key]: processedValue
    }))
  }

  const removeChange = (key: string) => {
    setPendingChanges(prev => {
      const updated = { ...prev }
      delete updated[key]
      return updated
    })
  }

  const addAlert = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    const id = Date.now()
    setAlerts(prev => [...prev, { type, message }])
    
    // Auto-remove alert after 5 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter((_, index) => index !== 0))
    }, 5000)
  }

  const getCurrentValue = (key: string): any => {
    if (key in pendingChanges) {
      return pendingChanges[key]
    }
    if (key in currentOverrides) {
      return currentOverrides[key]
    }
    
    // Get from current config
    const envVar = availableVars.find(v => v.key === key)
    if (envVar) {
      const configPath = envVar.configPath.split('.')
      let value = currentConfig
      for (const path of configPath) {
        value = value?.[path]
      }
      return value
    }
    
    return undefined
  }

  const getFilteredVars = () => {
    return availableVars.filter(envVar => {
      const matchesSearch = envVar.key.toLowerCase().includes(searchFilter.toLowerCase()) ||
                           envVar.description.toLowerCase().includes(searchFilter.toLowerCase())
      
      const matchesCategory = categoryFilter === 'all' || 
                             envVar.key.includes(categoryFilter.toUpperCase())
      
      return matchesSearch && matchesCategory
    })
  }

  const categories = [
    { key: 'all', label: 'All Categories' },
    { key: 'circuit_breaker', label: 'Circuit Breaker' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'retry', label: 'Retry Logic' },
    { key: 'recovery', label: 'Auto Recovery' },
    { key: 'health', label: 'Health Monitoring' },
    { key: 'ai', label: 'AI Services' },
    { key: 'reporting', label: 'Error Reporting' },
    { key: 'dev', label: 'Development' },
  ]

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading error configuration...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.map((alert, index) => (
        <Alert key={index} variant={alert.type === 'error' ? 'destructive' : 'default'}>
          {alert.type === 'success' && <CheckCircle className="h-4 w-4" />}
          {alert.type === 'error' && <AlertTriangle className="h-4 w-4" />}
          {alert.type === 'warning' && <AlertTriangle className="h-4 w-4" />}
          {alert.type === 'info' && <Info className="h-4 w-4" />}
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      ))}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Error Configuration Manager
          </h2>
          <p className="text-muted-foreground">
            Manage error handling configuration at runtime via environment variable overrides
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadConfiguration} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active Overrides</span>
              <Badge variant="outline">{Object.keys(currentOverrides).length}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pending Changes</span>
              <Badge variant={Object.keys(pendingChanges).length > 0 ? "default" : "outline"}>
                {Object.keys(pendingChanges).length}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Validation Status</span>
              {validationResult ? (
                <Badge variant={validationResult.valid ? "default" : "destructive"}>
                  {validationResult.valid ? 'Valid' : 'Invalid'}
                </Badge>
              ) : (
                <Badge variant="outline">Not Validated</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Settings</span>
              <Badge variant="outline">{availableVars.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="config" className="w-full">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="changes">Pending Changes</TabsTrigger>
          {showAdvanced && <TabsTrigger value="advanced">Advanced</TabsTrigger>}
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search configuration variables..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
            <div className="w-48">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                {categories.map(cat => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Configuration Variables */}
          <div className="space-y-4">
            {getFilteredVars().map(envVar => {
              const currentValue = getCurrentValue(envVar.key)
              const hasChanges = envVar.key in pendingChanges
              const hasOverride = envVar.key in currentOverrides

              return (
                <Card key={envVar.key} className={hasChanges ? 'border-blue-200' : undefined}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="font-medium">{envVar.key}</Label>
                          {hasOverride && <Badge variant="outline" size="sm">Override</Badge>}
                          {hasChanges && <Badge variant="default" size="sm">Modified</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{envVar.description}</p>
                        <div className="text-xs text-muted-foreground">
                          Config path: {envVar.configPath} | Type: {envVar.type}
                        </div>
                      </div>
                      
                      <div className="w-48 space-y-2">
                        {envVar.type === 'boolean' ? (
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={currentValue === true}
                              onCheckedChange={(checked) => updateValue(envVar.key, checked, envVar.type)}
                            />
                            <Label className="text-sm">{currentValue ? 'Enabled' : 'Disabled'}</Label>
                          </div>
                        ) : envVar.type === 'array' ? (
                          <Input
                            value={Array.isArray(currentValue) ? currentValue.join(',') : currentValue || ''}
                            onChange={(e) => updateValue(envVar.key, e.target.value, envVar.type)}
                            placeholder="Comma-separated values"
                          />
                        ) : (
                          <Input
                            type={envVar.type === 'number' ? 'number' : 'text'}
                            value={currentValue ?? ''}
                            onChange={(e) => updateValue(envVar.key, e.target.value, envVar.type)}
                            placeholder={`Enter ${envVar.type} value`}
                          />
                        )}
                        
                        {hasChanges && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeChange(envVar.key)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Revert
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="validation" className="space-y-4">
          {validationResult ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Validation Results</h3>
                <div className="flex items-center gap-2">
                  <Badge variant={validationResult.valid ? "default" : "destructive"}>
                    {validationResult.valid ? 'Valid Configuration' : 'Invalid Configuration'}
                  </Badge>
                  {lastValidation && (
                    <span className="text-sm text-muted-foreground">
                      Last validated: {lastValidation.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>

              {validationResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Validation Errors</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1">
                      {validationResult.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {validationResult.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1">
                      {validationResult.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {validationResult.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {validationResult.recommendations.map((rec, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{rec.key}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateValue(rec.key, rec.recommended, 'auto')}
                          >
                            Apply
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{rec.reason}</p>
                        <div className="text-xs">
                          Current: <code>{rec.current}</code> → Recommended: <code>{rec.recommended}</code>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">Make configuration changes to see validation results</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          {Object.keys(pendingChanges).length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Pending Changes ({Object.keys(pendingChanges).length})</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPendingChanges({})}
                  >
                    Clear All
                  </Button>
                  <Button
                    onClick={saveConfiguration}
                    disabled={isSaving || (validationResult && !validationResult.valid)}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {Object.entries(pendingChanges).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">{key}</span>
                      <div className="text-sm text-muted-foreground">
                        {currentOverrides[key] !== undefined ? currentOverrides[key] : 'default'} → {String(value)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeChange(key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No pending changes</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {showAdvanced && (
          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Advanced Actions</CardTitle>
                <CardDescription>
                  Dangerous operations that affect the entire configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <span className="font-medium">Reset All Overrides</span>
                    <div className="text-sm text-muted-foreground">
                      Remove all configuration overrides and return to environment defaults
                    </div>
                  </div>
                  <Button variant="destructive" onClick={resetConfiguration}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset All
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}