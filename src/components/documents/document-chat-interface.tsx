'use client'

import React, { useState, useRef, useEffect } from 'react'
import { X, MessageCircle, Send, Minimize2, Loader2, Sparkles, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNotify } from '@/contexts/notification-context'
import { Document } from '@/types/documents'
import { EnhancedMessageRenderer } from '@/components/chat/enhanced-message-renderer'

interface ChatMessage {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  sources?: Array<{
    chunkIndex: number
    text: string
    score: number
  }>
}

interface DocumentChatInterfaceProps {
  document: Document
  isOpen: boolean
  onToggle: () => void
}

export function DocumentChatInterface({ document, isOpen, onToggle }: DocumentChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: `Hi! I'm here to help you understand "${document.name}". You can ask me questions about the content, requirements, deadlines, or any specific details in this document.`,
      isUser: false,
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { error: notifyError } = useNotify()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const performSemanticSearch = async (query: string) => {
    try {
      console.log('🔍 [Chat] Document object for filters:', {
        id: document.id,
        name: document.name,
        mimeType: document.mimeType,
        documentType: document.documentType,
        hasEmbeddings: !!document.embeddings,
        embeddings: document.embeddings,
        naicsCodes: document.naicsCodes,
        tags: document.tags
      })

      const response = await fetch('/api/v1/search/similarity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          documentId: document.id, // Filter to specific document
          documentTypes: document.documentType ? [document.documentType] : undefined,
          naicsCodes: document.naicsCodes && document.naicsCodes.length > 0 ? document.naicsCodes : undefined,
          tags: document.tags && document.tags.length > 0 ? document.tags : undefined,
          topK: 10,
          minScore: 0.1, // Much lower threshold for better recall
          includeHighlights: true
        })
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const data = await response.json()

      console.log('📊 Search API response:', data)
      console.log('📊 Results count:', data.results?.length || 0)

      // Check if the API returned an error (even with 200 status)
      if (data.error) {
        console.warn('⚠️ Search API returned error:', data.error)
        if (data.details) {
          console.warn('📝 Error details:', data.details)
        }
        // Return empty results but don't throw - let the chat handle it gracefully
        return []
      }

      // The API already filters by documentId, so no need to filter again
      return data.results || []
    } catch (error) {
      console.error('Semantic search error:', error)
      return []
    }
  }

  const generateAIResponse = async (userQuery: string, searchResults: any[]) => {
    console.log('🧠 generateAIResponse called with:', {
      userQuery,
      searchResultsCount: searchResults.length,
      searchResults: searchResults.slice(0, 2) // Log first 2 results
    })

    if (searchResults.length === 0) {
      // Provide helpful suggestions based on document type
      const suggestions = getDocumentTypeSuggestions(document.documentType)
      console.log('❌ No search results, returning suggestions')

      // Check if this might be due to search service issues
      const searchServiceNote = process.env.NODE_ENV === 'development' ? ' (search service may be temporarily unavailable)' : ''

      return {
        text: `I couldn't find specific information about "${userQuery}" in this document${searchServiceNote}. Here are some things you might ask about:\n\n${suggestions}`,
        sources: []
      }
    }

    // Sort results by relevance score
    const sortedResults = searchResults.sort((a, b) => b.score - a.score)

    // Use real AI to generate intelligent responses
    try {
      console.log('🤖 Using AI to generate intelligent response...')

      // Prepare context from top search results
      const topResults = sortedResults.slice(0, 5) // Use top 5 most relevant chunks
      const combinedContext = topResults.map((result, index) => {
        const cleanText = result.chunkText
          .replace(/\s+/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .trim()
        return `[Section ${index + 1}]:\n${cleanText}`
      }).join('\n\n')

      // Call OpenAI for intelligent response generation
      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are an expert document analyst helping users understand ${document.documentType || 'documents'}. Your job is to:

1. Analyze the user's question and the provided document sections
2. Synthesize information from multiple sections when relevant
3. Provide clear, direct answers to the user's question
4. Highlight key information that directly addresses their query
5. Use natural, conversational language
6. If you can't find the specific information, say so clearly and suggest related information that might be helpful

Document context: "${document.name}"
Document type: ${document.documentType || 'Unknown'}

Always structure your response with:
- A direct answer to their question if possible
- Supporting details from the document
- Any relevant context or implications
- Clear indication of what information is and isn't available in the document`
            },
            {
              role: 'user',
              content: `User Question: "${userQuery}"

Relevant Document Sections:
${combinedContext}

Please analyze this information and provide a helpful, comprehensive answer to the user's question. Focus on what they actually asked about and synthesize information from the relevant sections.`
            }
          ],
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 800
        })
      })

      if (!response.ok) {
        throw new Error(`AI response failed: ${response.statusText}`)
      }

      const aiResult = await response.json()
      const aiGeneratedText = aiResult.choices?.[0]?.message?.content

      if (aiGeneratedText) {
        console.log('✅ AI response generated successfully')
        return {
          text: aiGeneratedText,
          sources: sortedResults.slice(0, 3).map(result => ({
            chunkIndex: result.chunkIndex,
            text: result.chunkText
              .replace(/\s+/g, ' ')
              .replace(/([a-z])([A-Z])/g, '$1 $2')
              .trim()
              .substring(0, 200) + '...',
            score: result.score
          }))
        }
      }
    } catch (error) {
      console.error('❌ AI response generation failed:', error)
      // Fall back to the old method if AI fails
    }

    // Fallback: Use the old method if AI fails
    console.log('⚠️ Falling back to simple response generation')
    const topResult = sortedResults[0]
    const cleanText = topResult.chunkText
      .replace(/\s+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim()

    let responseText = ""

    if (isRequirementsQuery(userQuery)) {
      responseText = generateRequirementsResponse(sortedResults)
    } else if (isDeadlineQuery(userQuery)) {
      responseText = generateDeadlineResponse(sortedResults)
    } else if (isPricingQuery(userQuery)) {
      responseText = generatePricingResponse(sortedResults)
    } else if (isNaicsQuery(userQuery)) {
      responseText = generateNaicsResponse(sortedResults)
    } else {
      responseText = `Based on the document content:\n\n${cleanText}`

      if (topResult.highlights && topResult.highlights.length > 0) {
        const cleanHighlights = topResult.highlights
          .map((h: string) => h.replace(/\s+/g, ' ').trim())
          .filter((h: string) => h.length > 10)

        if (cleanHighlights.length > 0) {
          responseText += `\n\nKey points:\n${cleanHighlights.map((h: string) => `• ${h}`).join('\n')}`
        }
      }

      if (sortedResults.length > 1) {
        responseText += `\n\nI found ${sortedResults.length} relevant sections that might help answer your question.`
      }
    }

    return {
      text: responseText,
      sources: sortedResults.map(result => ({
        chunkIndex: result.chunkIndex,
        text: result.chunkText
          .replace(/\s+/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .trim()
          .substring(0, 200) + '...',
        score: result.score
      }))
    }
  }

  // Helper functions for query classification
  const isRequirementsQuery = (query: string) => {
    const keywords = ['requirement', 'must', 'shall', 'specification', 'criteria', 'needed']
    return keywords.some(keyword => query.toLowerCase().includes(keyword))
  }

  const isDeadlineQuery = (query: string) => {
    const keywords = ['deadline', 'due', 'date', 'when', 'timeline', 'schedule']
    return keywords.some(keyword => query.toLowerCase().includes(keyword))
  }

  const isPricingQuery = (query: string) => {
    const keywords = ['cost', 'price', 'budget', 'payment', 'fee', 'dollar', '$']
    return keywords.some(keyword => query.toLowerCase().includes(keyword))
  }

  const isNaicsQuery = (query: string) => {
    const keywords = ['naics', 'naics code', 'industry code', 'classification code']
    return keywords.some(keyword => query.toLowerCase().includes(keyword))
  }

  const generateRequirementsResponse = (results: any[]) => {
    const requirements = results
      .filter(r => r.chunkText.toLowerCase().includes('shall') || r.chunkText.toLowerCase().includes('must'))
      .slice(0, 3)

    if (requirements.length === 0) {
      return `Here's what I found regarding requirements:\n\n${results[0].chunkText}`
    }

    return `Here are the key requirements I found:\n\n${requirements.map((r, i) => `${i + 1}. ${r.chunkText}`).join('\n\n')}`
  }

  const generateDeadlineResponse = (results: any[]) => {
    // Look for date patterns in the results
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{4}|\b\d{1,2}-\d{1,2}-\d{4}|\b[A-Za-z]+ \d{1,2}, \d{4}/g

    for (const result of results) {
      const dates = result.chunkText.match(datePattern)
      if (dates) {
        return `I found these deadline-related details:\n\n${result.chunkText}\n\nDates mentioned: ${dates.join(', ')}`
      }
    }

    return `Here's timeline-related information:\n\n${results[0].chunkText}`
  }

  const generatePricingResponse = (results: any[]) => {
    // Look for currency patterns
    const currencyPattern = /\$[\d,]+|\d+\s*dollars?/gi

    for (const result of results) {
      const amounts = result.chunkText.match(currencyPattern)
      if (amounts) {
        return `I found pricing information:\n\n${result.chunkText}\n\nAmounts mentioned: ${amounts.join(', ')}`
      }
    }

    return `Here's cost-related information:\n\n${results[0].chunkText}`
  }

  const generateNaicsResponse = (results: any[]) => {
    // Look for NAICS code patterns (6-digit numbers)
    const naicsPattern = /\b\d{6}\b|NAICS\s*:?\s*\d{6}|classification\s*:?\s*\d{6}/gi

    for (const result of results) {
      const naicsCodes = result.chunkText.match(naicsPattern)
      if (naicsCodes) {
        return `I found NAICS code information:\n\n${result.chunkText}\n\nNAICS codes mentioned: ${naicsCodes.join(', ')}`
      }
    }

    // Also check if the document metadata has NAICS codes
    if (document.naicsCodes && document.naicsCodes.length > 0) {
      return `Based on the document metadata, the NAICS codes for this solicitation are: ${document.naicsCodes.join(', ')}\n\nHere's related content from the document:\n\n${results[0].chunkText}`
    }

    return `Here's information related to industry classification:\n\n${results[0].chunkText}`
  }

  const getDocumentTypeSuggestions = (documentType: string) => {
    const suggestions: Record<string, string> = {
      'SOLICITATION': '• Requirements and specifications\n• Submission deadlines\n• Evaluation criteria\n• Contract terms',
      'CONTRACT': '• Performance requirements\n• Payment terms\n• Deliverables\n• Compliance obligations',
      'PROPOSAL': '• Technical approach\n• Cost breakdown\n• Timeline\n• Team qualifications',
      'AMENDMENT': '• Changes to original terms\n• New requirements\n• Updated deadlines',
      default: '• Key requirements\n• Important dates\n• Contact information\n• Next steps'
    }

    return suggestions[documentType] || suggestions.default
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: inputValue.trim(),
      isUser: true,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      // Check if document has embeddings
      if (!document.embeddings || Object.keys(document.embeddings).length === 0) {
        const noEmbeddingsMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: "This document hasn't been processed for semantic search yet. Please click the 'Vectorize' button in the document details to enable AI-powered Q&A.",
          isUser: false,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, noEmbeddingsMessage])
        setIsLoading(false)
        return
      }

      // Perform semantic search
      const searchResults = await performSemanticSearch(userMessage.text)

      // Generate AI response
      console.log('🤖 Search results before AI response:', searchResults)
      const aiResponse = await generateAIResponse(userMessage.text, searchResults)
      console.log('📝 Generated AI response:', aiResponse)

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: aiResponse.text,
        isUser: false,
        timestamp: new Date(),
        sources: aiResponse.sources
      }

      console.log('💬 Final AI message:', aiMessage)
      setMessages(prev => [...prev, aiMessage])
    } catch (error) {
      console.error('Chat error:', error)
      notifyError('Error', 'Failed to process your question. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!isOpen) return null

  return (
    <div className="h-full w-full bg-background border-l shadow-lg flex flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Document Assistant</h3>
            <p className="text-xs text-muted-foreground">Ask questions about this document</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Document Info */}
      <div className="px-4 py-2 bg-muted/10 border-b">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="text-xs">
            {document.documentType}
          </Badge>
          <span className="text-muted-foreground truncate flex-1">
            {document.name}
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 overflow-hidden">
        <div className="space-y-4 break-words">
          {messages.map((message) => (
            <div key={message.id}>
              <div className={cn(
                "flex",
                message.isUser ? "justify-end" : "justify-start"
              )}>
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm break-words",
                  message.isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}>
                  {message.isUser ? (
                    <p className="whitespace-pre-wrap break-words overflow-wrap-anywhere">{message.text}</p>
                  ) : (
                    <EnhancedMessageRenderer
                      content={message.text}
                      isMarkdown={true}
                      className="text-sm"
                    />
                  )}
                  <p className={cn(
                    "text-xs mt-1",
                    message.isUser ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 max-w-full">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Sources ({message.sources.length}):</p>
                  <div className="relative overflow-hidden">
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent w-full" style={{ scrollbarWidth: 'thin', maxWidth: '320px' }}>
                      {message.sources.map((source, idx) => (
                        <div key={idx} className="flex-shrink-0 w-72 text-xs bg-muted/30 rounded-lg p-3 border">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Badge variant="outline" className="text-xs shrink-0">
                              Chunk {source.chunkIndex}
                            </Badge>
                            <span className="text-muted-foreground text-xs shrink-0">
                              {(source.score * 100).toFixed(0)}% match
                            </span>
                          </div>
                          <p className="text-muted-foreground text-xs leading-relaxed break-words hyphens-auto overflow-wrap-anywhere whitespace-pre-wrap line-clamp-4">
                            {source.text}
                          </p>
                        </div>
                      ))}
                    </div>
                    {message.sources.length > 1 && (
                      <div className="flex justify-center mt-1">
                        <span className="text-xs text-muted-foreground/60">
                          ← Scroll to see more sources →
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t bg-background shrink-0">
        <div className="flex gap-2 max-w-full">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about requirements, deadlines, specifications..."
            className="flex-1 resize-none border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[120px] max-w-full break-words"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            disabled={!inputValue.trim() || isLoading}
            className="h-10 w-10 shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 break-words">
          {document.embeddings ?
            'AI-powered search is enabled for this document' :
            'Vectorize this document to enable AI search'
          }
        </p>
      </div>
    </div>
  )
}


// Chat Toggle Button Component
export function ChatToggleButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  if (isOpen) return null

  return (
    <Button
      onClick={onClick}
      size="icon"
      className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-[55]"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  )
}
