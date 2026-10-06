'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Mock document data for the generic document details page
const mockDocument = {
  id: '1',
  name: 'Sample Document.pdf',
  type: 'pdf',
  size: '1.2MB',
  status: 'COMPLETED',
  lastModified: '2025-07-23',
  documentType: 'proposal'
}

export function DocumentDetails() {
  return (
    <div className="h-full bg-background">
      <div className="text-center py-8">
        <p className="text-muted-foreground">Generic document details page.</p>
        <div className="mt-4">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-lg">{mockDocument.name}</CardTitle>
              <CardDescription>
                Type: {mockDocument.type} • Size: {mockDocument.size}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge variant="secondary">{mockDocument.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Last Modified:</span>
                  <span className="text-sm">{mockDocument.lastModified}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Document Type:</span>
                  <span className="text-sm capitalize">{mockDocument.documentType}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default DocumentDetails