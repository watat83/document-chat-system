'use client'

import React, { useState } from 'react'
import { DocumentChatInterface, ChatToggleButton } from './document-chat-interface'
import { Document, DocumentType } from '@/types/documents'

// Mock document for demo purposes
const mockDocument: Document = {
  id: 'demo-doc-1',
  name: 'IT Services Contract Solicitation',
  description: 'Sample government IT services contract for demonstration',
  documentType: DocumentType.SOLICITATION,
  organizationId: 'demo-org',
  userId: 'demo-user',
  folderId: null,
  tags: ['IT', 'Services', 'Government'],
  naicsCodes: ['541511', '541512'],
  size: 1024000,
  mimeType: 'application/pdf',
  url: '/demo/sample-contract.pdf',
  extractedText: 'Sample contract text for AI processing...',
  content: null,
  summary: 'This is a sample IT services contract solicitation',
  embeddings: {
    documentId: 'demo-doc-1',
    documentTitle: 'IT Services Contract Solicitation',
    organizationNamespace: 'demo-org',
    chunks: [
      { id: 'chunk-1', chunkIndex: 0, vectorId: 'vec-1', startChar: 0, endChar: 500, keywords: ['requirements', 'IT'] },
      { id: 'chunk-2', chunkIndex: 1, vectorId: 'vec-2', startChar: 501, endChar: 1000, keywords: ['timeline', 'delivery'] }
    ],
    model: 'text-embedding-3-small',
    dimensions: 1536,
    totalChunks: 2,
    lastProcessed: new Date().toISOString()
  },
  metadata: {},
  permissions: [],
  sharedWith: [],
  comments: [],
  versions: [],
  workflowStatus: 'DRAFT' as any,
  securityClassification: 'PUBLIC' as any,
  retentionDate: null,
  lastAccessedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null
}

export function DocumentChatDemo() {
  const [isChatOpen, setIsChatOpen] = useState(false)

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen)
  }

  return (
    <div className="relative h-96 border rounded-lg bg-background overflow-hidden">
      {/* Demo content area */}
      <div className={`transition-all duration-300 h-full ${isChatOpen ? 'mr-96' : 'mr-0'}`}>
        <div className="p-6 h-full flex flex-col justify-center items-center bg-gradient-to-br from-muted/30 to-muted/10">
          <div className="text-center space-y-4">
            <h3 className="text-xl font-semibold">Document Chat Interface Demo</h3>
            <p className="text-muted-foreground max-w-md">
              Click the chat button to open an AI-powered Q&A interface for document analysis. 
              This demo uses semantic search to answer questions about document content.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <code className="px-2 py-1 bg-muted rounded text-xs">
                &quot;What are the requirements?&quot;
              </code>
              <code className="px-2 py-1 bg-muted rounded text-xs">
                &quot;When is the deadline?&quot;
              </code>
              <code className="px-2 py-1 bg-muted rounded text-xs">
                &quot;What&apos;s the budget?&quot;
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <DocumentChatInterface 
        document={mockDocument}
        isOpen={isChatOpen} 
        onToggle={toggleChat} 
      />
      
      {/* Chat Toggle Button */}
      <ChatToggleButton 
        onClick={toggleChat} 
        isOpen={isChatOpen} 
      />
    </div>
  )
}