'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { 
  Copy, 
  RefreshCw, 
  Code, 
  Database,
  Zap,
  CheckCircle,
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

interface ExampleData {
  request?: any
  response?: any
  curl?: string
  javascript?: string
  python?: string
}

interface ExampleGeneratorProps {
  endpoint: {
    method: string
    path: string
    description: string
    auth: boolean
  }
  endpointKey: string
}

export function ExampleGenerator({ endpoint, endpointKey }: ExampleGeneratorProps) {
  const [generatedExamples, setExamples] = useState<ExampleData | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null)

  // Generate examples based on endpoint type
  const generateExamples = async () => {
    setLoading(true)
    try {
      // Simulate API call to generate real examples
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const newExamples = generateExampleData(endpoint)
      setExamples(newExamples)
      setLastGenerated(new Date())
      toast.success('Example templates generated')
    } catch (error) {
      toast.error('Failed to generate examples')
    } finally {
      setLoading(false)
    }
  }

  // Generate example data based on endpoint patterns
  const generateExampleData = (endpoint: { method: string; path: string }): ExampleData => {
    const baseUrl = 'https://api.document-chat-system.vercel.app'
    
    // Generate examples based on endpoint patterns
    if (endpoint.path.includes('/opportunities')) {
      return generateOpportunityExamples(endpoint, baseUrl)
    } else if (endpoint.path.includes('/match-scores')) {
      return generateMatchScoreExamples(endpoint, baseUrl)
    } else if (endpoint.path.includes('/profile')) {
      return generateProfileExamples(endpoint, baseUrl)
    } else if (endpoint.path.includes('/billing')) {
      return generateBillingExamples(endpoint, baseUrl)
    } else if (endpoint.path.includes('/notifications')) {
      return generateNotificationExamples(endpoint, baseUrl)
    } else {
      return generateGenericExamples(endpoint, baseUrl)
    }
  }

  const generateOpportunityExamples = (endpoint: any, baseUrl: string): ExampleData => {
    const requestExample = endpoint.method === 'GET' ? null : {
      agencies: ["Department of Defense"],
      naicsCodes: ["541511"],
      minValue: 100000,
      maxValue: 5000000
    }

    const responseExample = {
      success: true,
      data: [
        {
          id: "opp_2024_dod_cyber_001",
          title: "Cybersecurity Infrastructure Modernization",
          agency: "Department of Defense",
          naicsCode: "541511",
          value: 2500000,
          setAsideType: "8a",
          location: "Washington, DC",
          dueDate: "2024-03-15T23:59:59.000Z",
          description: "Comprehensive cybersecurity infrastructure modernization project for military installations...",
          requirements: [
            "Secret security clearance required",
            "FISMA compliance experience",
            "Minimum 5 years cybersecurity experience"
          ],
          createdAt: "2024-01-15T10:00:00.000Z",
          updatedAt: "2024-01-15T10:00:00.000Z"
        },
        {
          id: "opp_2024_dhs_cloud_002",
          title: "Cloud Migration Services",
          agency: "Department of Homeland Security",
          naicsCode: "541511",
          value: 1800000,
          setAsideType: "SDVOSB",
          location: "Arlington, VA",
          dueDate: "2024-04-20T23:59:59.000Z",
          description: "Migration of legacy systems to secure cloud infrastructure...",
          requirements: [
            "FedRAMP certification required",
            "AWS/Azure expertise",
            "NIST framework compliance"
          ],
          createdAt: "2024-01-10T14:30:00.000Z",
          updatedAt: "2024-01-12T09:15:00.000Z"
        }
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 247,
        totalPages: 13,
        hasNext: true,
        hasPrev: false
      },
      meta: {
        timestamp: "2024-01-15T12:00:00.000Z",
        requestId: "req_abc123"
      }
    }

    return {
      request: requestExample,
      response: responseExample,
      curl: generateCurlExample(endpoint, baseUrl, requestExample),
      javascript: generateJavaScriptExample(endpoint, baseUrl, requestExample),
      python: generatePythonExample(endpoint, baseUrl, requestExample)
    }
  }

  const generateMatchScoreExamples = (endpoint: any, baseUrl: string): ExampleData => {
    const requestExample = {
      opportunityIds: ["opp_2024_dod_cyber_001", "opp_2024_dhs_cloud_002"]
    }

    const responseExample = {
      success: true,
      data: [
        {
          opportunityId: "opp_2024_dod_cyber_001",
          score: 87,
          factors: {
            naicsAlignment: 95,
            geographicProximity: 80,
            certificationMatch: 90,
            pastPerformance: 75
          },
          explanation: "Strong match based on NAICS 541511 alignment and 8(a) certification. Geographic proximity to DC area is favorable.",
          calculatedAt: "2024-01-15T12:00:00.000Z"
        },
        {
          opportunityId: "opp_2024_dhs_cloud_002",
          score: 72,
          factors: {
            naicsAlignment: 95,
            geographicProximity: 85,
            certificationMatch: 60,
            pastPerformance: 80
          },
          explanation: "Good NAICS alignment and strong past performance. SDVOSB certification not held, reducing score.",
          calculatedAt: "2024-01-15T12:00:00.000Z"
        }
      ],
      meta: {
        timestamp: "2024-01-15T12:00:00.000Z",
        requestId: "req_match_456"
      }
    }

    return {
      request: requestExample,
      response: responseExample,
      curl: generateCurlExample(endpoint, baseUrl, requestExample),
      javascript: generateJavaScriptExample(endpoint, baseUrl, requestExample),
      python: generatePythonExample(endpoint, baseUrl, requestExample)
    }
  }

  const generateProfileExamples = (endpoint: any, baseUrl: string): ExampleData => {
    const requestExample = endpoint.method === 'GET' ? null : {
      companyName: "TechSolutions Inc",
      naicsCodes: ["541511", "541512"],
      certifications: ["8a", "SDVOSB"],
      address: {
        street: "123 Innovation Drive",
        city: "Washington",
        state: "DC",
        zipCode: "20001"
      }
    }

    const responseExample = {
      success: true,
      data: {
        id: "profile_user123_org456",
        companyName: "TechSolutions Inc",
        dbaName: "TechSol",
        uei: "ABC123DEF456GHI7",
        dunsNumber: "123456789",
        cageCode: "1A2B3",
        naicsCodes: ["541511", "541512"],
        certifications: ["8a", "SDVOSB", "HUBZone"],
        address: {
          street: "123 Innovation Drive",
          city: "Washington",
          state: "DC",
          zipCode: "20001"
        },
        completenessScore: 92,
        lastUpdated: "2024-01-15T10:30:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      meta: {
        timestamp: "2024-01-15T12:00:00.000Z",
        requestId: "req_profile_789"
      }
    }

    return {
      request: requestExample,
      response: responseExample,
      curl: generateCurlExample(endpoint, baseUrl, requestExample),
      javascript: generateJavaScriptExample(endpoint, baseUrl, requestExample),
      python: generatePythonExample(endpoint, baseUrl, requestExample)
    }
  }

  const generateBillingExamples = (endpoint: any, baseUrl: string): ExampleData => {
    let requestExample = null
    let responseExample = {}

    if (endpoint.path.includes('/usage')) {
      requestExample = {
        usageType: "AI_QUERY",
        quantity: 1,
        resourceId: "query_abc123",
        metadata: {
          model: "gpt-4",
          tokens: 1500,
          operation: "match_scoring"
        }
      }
      responseExample = {
        success: true,
        data: {
          id: "usage_record_xyz789",
          recorded: true,
          remaining: 99,
          limit: 100,
          resetsAt: "2024-02-01T00:00:00.000Z"
        }
      }
    } else if (endpoint.path.includes('/subscription')) {
      responseExample = {
        success: true,
        data: {
          id: "sub_document_chat_pro_123",
          status: "active",
          planType: "PROFESSIONAL",
          currentPeriodStart: "2024-01-01T00:00:00.000Z",
          currentPeriodEnd: "2024-02-01T00:00:00.000Z",
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: "sub_1234567890",
          features: {
            aiQueries: 1000,
            opportunitySearches: 500,
            teamMembers: 5,
            exportFormats: ["PDF", "Excel", "CSV"]
          }
        }
      }
    }

    return {
      request: requestExample,
      response: responseExample,
      curl: generateCurlExample(endpoint, baseUrl, requestExample),
      javascript: generateJavaScriptExample(endpoint, baseUrl, requestExample),
      python: generatePythonExample(endpoint, baseUrl, requestExample)
    }
  }

  const generateNotificationExamples = (endpoint: any, baseUrl: string): ExampleData => {
    const requestExample = endpoint.method === 'GET' ? null : {
      type: "OPPORTUNITY",
      category: "NEW_OPPORTUNITY",
      title: "New High-Value Cybersecurity Opportunity",
      message: "A new $2.5M cybersecurity opportunity matching your profile has been posted by the Department of Defense",
      actionUrl: "/opportunities/opp_2024_dod_cyber_001",
      priority: "HIGH"
    }

    const responseExample = {
      success: true,
      data: endpoint.method === 'GET' ? [
        {
          id: "notif_abc123",
          type: "OPPORTUNITY",
          category: "NEW_OPPORTUNITY",
          title: "New High-Value Cybersecurity Opportunity",
          message: "A new $2.5M cybersecurity opportunity matching your profile has been posted",
          isRead: false,
          priority: "HIGH",
          actionUrl: "/opportunities/opp_2024_dod_cyber_001",
          createdAt: "2024-01-15T11:30:00.000Z"
        },
        {
          id: "notif_def456",
          type: "BILLING",
          category: "USAGE_WARNING",
          title: "Usage Limit Warning",
          message: "You've used 80% of your monthly AI query limit",
          isRead: true,
          priority: "MEDIUM",
          actionUrl: "/billing",
          createdAt: "2024-01-14T15:20:00.000Z"
        }
      ] : {
        id: "notif_new123",
        created: true,
        deliveredTo: ["in_app", "email"],
        estimatedDelivery: "immediate"
      }
    }

    return {
      request: requestExample,
      response: responseExample,
      curl: generateCurlExample(endpoint, baseUrl, requestExample),
      javascript: generateJavaScriptExample(endpoint, baseUrl, requestExample),
      python: generatePythonExample(endpoint, baseUrl, requestExample)
    }
  }

  const generateGenericExamples = (endpoint: any, baseUrl: string): ExampleData => {
    const responseExample = {
      success: true,
      data: {
        message: "Operation completed successfully",
        timestamp: "2024-01-15T12:00:00.000Z"
      },
      meta: {
        requestId: "req_generic_123"
      }
    }

    return {
      response: responseExample,
      curl: generateCurlExample(endpoint, baseUrl, null),
      javascript: generateJavaScriptExample(endpoint, baseUrl, null),
      python: generatePythonExample(endpoint, baseUrl, null)
    }
  }

  const generateCurlExample = (endpoint: any, baseUrl: string, requestData: any) => {
    let curl = `curl -X ${endpoint.method}`
    curl += ` \\\n  -H "Content-Type: application/json"`
    
    if (endpoint.auth) {
      curl += ` \\\n  -H "Authorization: Bearer $API_TOKEN"`
    }
    
    if (requestData && ['POST', 'PATCH', 'PUT'].includes(endpoint.method)) {
      curl += ` \\\n  -d '${JSON.stringify(requestData, null, 2)}'`
    }
    
    curl += ` \\\n  "${baseUrl}${endpoint.path}"`
    
    return curl
  }

  const generateJavaScriptExample = (endpoint: any, baseUrl: string, requestData: any) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(endpoint.auth ? { 'Authorization': 'Bearer $API_TOKEN' } : {})
    }

    const fetchOptions = {
      method: endpoint.method,
      headers,
      ...(requestData && ['POST', 'PATCH', 'PUT'].includes(endpoint.method) ? {
        body: JSON.stringify(requestData, null, 2)
      } : {})
    }

    return `const response = await fetch('${baseUrl}${endpoint.path}', ${JSON.stringify(fetchOptions, null, 2)})

if (!response.ok) {
  throw new Error(\`HTTP error! status: \${response.status}\`)
}

const data = await response.json()
console.log(data)`
  }

  const generatePythonExample = (endpoint: any, baseUrl: string, requestData: any) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(endpoint.auth ? { 'Authorization': 'Bearer $API_TOKEN' } : {})
    }

    let pythonCode = `import requests
import json

headers = ${JSON.stringify(headers, null, 2).replace(/"/g, "'")}

`

    if (requestData && ['POST', 'PATCH', 'PUT'].includes(endpoint.method)) {
      pythonCode += `data = ${JSON.stringify(requestData, null, 2).replace(/"/g, "'")}

response = requests.${endpoint.method.toLowerCase()}(
    '${baseUrl}${endpoint.path}',
    headers=headers,
    json=data
)`
    } else {
      pythonCode += `response = requests.${endpoint.method.toLowerCase()}(
    '${baseUrl}${endpoint.path}',
    headers=headers
)`
    }

    pythonCode += `

response.raise_for_status()
data = response.json()
print(json.dumps(data, indent=2))`

    return pythonCode
  }

  const examples = generatedExamples ?? generateExampleData(endpoint)

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${type} copied to clipboard`)
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Live Examples
            </CardTitle>
            <CardDescription>
              Example templates for the selected endpoint
            </CardDescription>
          </div>
          <Button
            onClick={generateExamples}
            disabled={loading}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generating...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="response" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="request">Request</TabsTrigger>
            <TabsTrigger value="curl">cURL</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>

          <TabsContent value="response" className="space-y-4">
            {examples.response ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">Example Response</Label>
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Live Data
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(examples.response, null, 2), 'Response example')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-96">
                  {JSON.stringify(examples.response, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No response example available</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="request" className="space-y-4">
            {examples.request ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">Example Request Body</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(examples.request, null, 2), 'Request example')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  {JSON.stringify(examples.request, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No request body required for this endpoint</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="curl" className="space-y-4">
            {examples.curl && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">cURL Command</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(examples.curl!, 'cURL command')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  {examples.curl}
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="code" className="space-y-4">
            <Tabs defaultValue="javascript" className="w-full">
              <TabsList>
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>

              <TabsContent value="javascript" className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>JavaScript (Fetch API)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(examples.javascript!, 'JavaScript code')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  {examples.javascript}
                </pre>
              </TabsContent>

              <TabsContent value="python" className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Python (Requests)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(examples.python!, 'Python code')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                  {examples.python}
                </pre>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        {lastGenerated && (
          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>Last updated: {lastGenerated.toLocaleTimeString()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}