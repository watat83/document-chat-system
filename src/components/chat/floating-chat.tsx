'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MessageCircle, X, Maximize2, Minimize2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { CleanAIChat } from '@/components/ai/clean-ai-chat'
import { DocumentChatToggle } from './document-chat-toggle'
import { DocumentScopeSelector } from './document-scope-selector'
import { ChatState, DEFAULT_GENERAL_STATE } from '@/types/chat'

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

interface DragState {
  isDragging: boolean
  startX: number
  startY: number
  buttonX: number
  buttonY: number
}

interface PageContext {
  page: string
  title: string
  description: string
  supportsDocumentChat: boolean
  isDocumentDetailPage: boolean
}

export function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [position, setPosition] = useState<Position>('bottom-right')
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    buttonX: 0,
    buttonY: 0,
  })
  const [chatState, setChatState] = useState<ChatState>(DEFAULT_GENERAL_STATE)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [availableDocuments, setAvailableDocuments] = useState<
    Array<{
      id: string
      name: string
      folderId?: string
      documentType?: string
      folderName?: string
      createdAt: string
    }>
  >([])
  const [availableFolders, setAvailableFolders] = useState<
    Array<{ id: string; name: string }>
  >([])

  const pathname = usePathname()
  const { isSignedIn, userId, isLoaded } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const loadedForOrgIdRef = useRef<string | null>(null)
  const fetchingOrgIdRef = useRef<boolean>(false)
  const lastFetchedOrgIdRef = useRef<string | null>(null)

  // Note: Mounted state removed to prevent hydration mismatches
  // The parent AppLayout handles the mounting logic

  // Fetch organization ID when user is loaded
  useEffect(() => {
    // Skip if we already fetched for this user
    if (lastFetchedOrgIdRef.current === userId) {
      console.log('🔍 Already fetched org ID for this user, skipping')
      return
    }

    const fetchOrgId = async (retryCount = 0) => {
      const maxRetries = 3

      // Prevent concurrent fetches
      if (fetchingOrgIdRef.current) {
        console.log('🔍 Already fetching organization ID, skipping duplicate request')
        return
      }

      // Wait for Clerk to be fully loaded before proceeding
      if (!isLoaded) {
        console.log('🔍 Waiting for Clerk to load...')
        return
      }

      if (!userId || !isSignedIn) {
        console.log('🔍 User not authenticated:', {
          userId: !!userId,
          isSignedIn,
        })
        setOrganizationId(null)
        fetchingOrgIdRef.current = false
        lastFetchedOrgIdRef.current = null
        return
      }

      // Mark as fetching
      fetchingOrgIdRef.current = true

      try {
        console.log(
          `🔍 Fetching organization ID for userId: ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`
        )

        // Add delay to ensure Clerk auth token is ready (longer delay on retries)
        const delay = retryCount === 0 ? 100 : 500 + retryCount * 500
        await new Promise((resolve) => setTimeout(resolve, delay))

        // Fallback: try profile endpoint
        console.log('📡 Trying profile endpoint as fallback...')
        const profileResponse = await fetch('/api/v1/profile')

        console.log('📡 Profile response status:', profileResponse.status)

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          console.log(
            '📡 Profile response data:',
            JSON.stringify(profileData, null, 2)
          )

          if (profileData.success && profileData.data?.organizationId) {
            console.log(
              '✅ Found organization ID from profile:',
              profileData.data.organizationId
            )
            setOrganizationId(profileData.data.organizationId)
            console.log(
              '✅ Called setOrganizationId with:',
              profileData.data.organizationId
            )
            fetchingOrgIdRef.current = false
            lastFetchedOrgIdRef.current = userId ?? null
            return
          } else {
            console.log(
              '❌ Profile endpoint succeeded but no organization ID found. Data structure:',
              {
                success: profileData.success,
                hasData: !!profileData.data,
                organizationId: profileData.data?.organizationId,
                dataKeys: profileData.data
                  ? Object.keys(profileData.data)
                  : null,
              }
            )
          }
        } else {
          // Clone the response so we can try reading it as JSON or text
          const clonedResponse = profileResponse.clone()
          let errorData
          try {
            errorData = await profileResponse.json()
          } catch {
            try {
              errorData = await clonedResponse.text()
            } catch {
              errorData = 'Could not read error response'
            }
          }
          console.error(
            '❌ Profile endpoint failed:',
            profileResponse.status,
            errorData
          )

          // If auth error and we have retries left, try again
          if (profileResponse.status === 401 && retryCount < maxRetries) {
            console.log(`🔄 Retrying in ${delay}ms due to auth error...`)
            setTimeout(() => fetchOrgId(retryCount + 1), delay)
            return
          }
        }

        console.log('❌ Could not get organization ID from any source')
        setOrganizationId(null)
        fetchingOrgIdRef.current = false
      } catch (error) {
        console.error('❌ Failed to fetch organization ID:', error)

        // Retry on network errors
        if (retryCount < maxRetries) {
          const delay = 1000 + retryCount * 1000
          console.log(`🔄 Retrying in ${delay}ms due to error...`)
          setTimeout(() => fetchOrgId(retryCount + 1), delay)
          return
        }

        setOrganizationId(null)
        fetchingOrgIdRef.current = false
      }
    }

    fetchOrgId()
  }, [userId, isSignedIn, isLoaded])

  // Debug auth state
  useEffect(() => {
    console.log('🔐 Auth state changed:', {
      isLoaded,
      isSignedIn,
      userId,
      localOrganizationId: organizationId, // Make it clear this is local state
      timestamp: new Date().toISOString(),
    })
  }, [isLoaded, isSignedIn, userId, organizationId])

  // Additional debug when organizationId actually gets set
  useEffect(() => {
    if (organizationId) {
      console.log(
        '✅ Organization ID successfully set:',
        organizationId,
        'at',
        new Date().toISOString()
      )
    } else {
      console.log(
        '❌ Organization ID is null/undefined at',
        new Date().toISOString()
      )
    }
  }, [organizationId])

  // Additional debugging: Track if organizationId gets reset after being set
  const prevOrganizationId = useRef<string | null>(null)
  useEffect(() => {
    if (prevOrganizationId.current && !organizationId) {
      console.warn(
        '⚠️ Organization ID was reset from',
        prevOrganizationId.current,
        'to null at',
        new Date().toISOString()
      )
      console.trace('Reset trace:')
    }
    prevOrganizationId.current = organizationId
  }, [organizationId])

  const buttonRef = useRef<HTMLButtonElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    buttonX: 0,
    buttonY: 0,
  })

  // Detect page context based on current route - memoized to prevent recreating objects
  const pageContext = useMemo(() => {
    const context: PageContext = {
      page: pathname,
      title: 'Current Page',
      description: 'Context-aware chat assistant',
      supportsDocumentChat: true,
      isDocumentDetailPage: false,
    }

    // Define context based on different pages
    switch (true) {
      case pathname === '/':
        context.title = 'Dashboard'
        context.description = 'Main dashboard with opportunities overview'
        break
      case pathname.startsWith('/opportunities'):
        context.title = 'Opportunities'
        context.description =
          'Government contracting opportunities and matching'
        break
      case pathname.startsWith('/profile'):
        context.title = 'Profile'
        context.description = 'User profile and company information'
        break
      case pathname.startsWith('/billing'):
        context.title = 'Billing'
        context.description = 'Subscription and billing management'
        break
      case pathname.startsWith('/settings'):
        context.title = 'Settings'
        context.description = 'Account and application settings'
        break
      case pathname.startsWith('/api-docs'):
        context.title = 'API Documentation'
        context.description = 'API endpoints and integration guides'
        break
      case pathname.startsWith('/components-showcase'):
        context.title = 'Components Showcase'
        context.description = 'UI component library and examples'
        break
      case /^\/documents\/[^/]+$/.test(pathname):
        context.title = 'Document Details'
        context.description = 'Individual document view and analysis'
        context.supportsDocumentChat = false
        context.isDocumentDetailPage = true
        break
      case pathname.startsWith('/documents'):
        context.title = 'Documents'
        context.description =
          'Document management with AI-powered chat across all documents'
        context.supportsDocumentChat = true
        break
      default:
        context.title = 'Assistant'
        context.description = 'AI-powered assistant'
    }

    return context
  }, [pathname])

  const loadDocumentContext = useCallback(async (orgId: string) => {
    if (!orgId) {
      console.log('🚫 loadDocumentContext: No organizationId provided')
      return
    }

    // Check if we've already loaded for this org
    if (loadedForOrgIdRef.current === orgId) {
      console.log('📦 Already loaded documents for this organization, skipping')
      return
    }

    console.log(
      '🔍 loadDocumentContext: Starting with organizationId:',
      orgId
    )
    try {
      console.log('📡 Making API calls to load documents and folders...')
      const [docsResponse, foldersResponse] = await Promise.all([
        fetch('/api/v1/documents', {
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch('/api/v1/folders', {
          headers: { 'Content-Type': 'application/json' },
        }),
      ])

      console.log('📄 Documents API response status:', docsResponse.status)
      console.log('📁 Folders API response status:', foldersResponse.status)

      const docsData = await docsResponse.json()
      const foldersData = await foldersResponse.json()

      console.log('📄 Documents API response data:', docsData)
      console.log('📁 Folders API response data:', foldersData)

      setAvailableDocuments(docsData.documents || [])
      setAvailableFolders(foldersData.folders || [])

      // Mark as loaded for this org
      loadedForOrgIdRef.current = orgId

      console.log('✅ Document context loaded:', {
        documents: docsData.documents?.length || 0,
        folders: foldersData.folders?.length || 0,
      })
    } catch (error) {
      console.error('❌ Failed to load document context:', error)
    } finally {
      setIsLoadingDocuments(false)
    }
  }, []) // No dependencies - completely stable

  // Load document context when enabled - with stable dependencies
  useEffect(() => {
    // Skip if no pageContext yet
    if (!pageContext) return

    console.log('🎯 useEffect triggered with:', {
      supportsDocumentChat: pageContext.supportsDocumentChat,
      organizationId: organizationId,
      isDocumentDetailPage: pageContext.isDocumentDetailPage,
      isLoaded,
      isSignedIn,
    })

    if (
      pageContext.supportsDocumentChat &&
      organizationId &&
      !pageContext.isDocumentDetailPage &&
      isLoaded &&
      isSignedIn
    ) {
      console.log('✅ All conditions met, calling loadDocumentContext')
      const timeout = window.setTimeout(() => {
        void loadDocumentContext(organizationId)
      }, 0)

      return () => window.clearTimeout(timeout)
    } else {
      console.log('❌ Conditions not met for loading document context:', {
        supportsDocumentChat: pageContext.supportsDocumentChat,
        hasOrganizationId: !!organizationId,
        notDetailPage: !pageContext.isDocumentDetailPage,
        isLoaded,
        isSignedIn,
      })
    }
  }, [
    pageContext, // Use the whole memoized object
    organizationId,
    loadDocumentContext, // Now stable because it has no dependencies
    isLoaded,
    isSignedIn
  ])

  // Handle document chat toggle
  const handleDocumentChatToggle = async (enabled: boolean) => {
    setIsLoadingDocuments(true)

    if (enabled) {
      // Switch to document mode - load OpenAI provider
      setChatState({
        documentChatEnabled: true,
        documentScope: {
          mode: 'all-documents',
          documentCount: availableDocuments.length,
        },
        provider: 'openai',
      })
    } else {
      // Switch to general mode - revert to OpenRouter
      setChatState(DEFAULT_GENERAL_STATE)
    }

    setIsLoadingDocuments(false)
  }

  // Get context description
  const getChatContextDescription = (
    chatState: ChatState,
    pageContext: PageContext | null
  ): string => {
    if (!chatState.documentChatEnabled) {
      return `${pageContext?.description || 'AI-powered assistance'} • General AI assistance`
    }

    const scope = chatState.documentScope!
    switch (scope.mode) {
      case 'all-documents':
        return `Searching across ${scope.documentCount || 0} documents in your account`
      case 'current-folder':
        return `Searching documents in folder: ${scope.folderName}`
      case 'selected-documents':
        return `Searching ${scope.documentIds?.length || 0} selected documents`
      default:
        return 'Document search enabled'
    }
  }

  // Drag functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return

    const newDragState = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      buttonX: rect.left,
      buttonY: rect.top,
    }

    setDragState(newDragState)
    dragRef.current = newDragState
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current.isDragging) return

    const deltaX = e.clientX - dragRef.current.startX
    const deltaY = e.clientY - dragRef.current.startY

    const newX = dragRef.current.buttonX + deltaX
    const newY = dragRef.current.buttonY + deltaY

    if (buttonRef.current) {
      buttonRef.current.style.left = `${newX}px`
      buttonRef.current.style.top = `${newY}px`
      buttonRef.current.style.right = 'auto'
      buttonRef.current.style.bottom = 'auto'
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current.isDragging) return

    // Calculate which corner to snap to
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    const centerX = windowWidth / 2
    const centerY = windowHeight / 2

    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return

    const buttonCenterX = rect.left + rect.width / 2
    const buttonCenterY = rect.top + rect.height / 2

    let newPosition: Position
    if (buttonCenterX < centerX && buttonCenterY < centerY) {
      newPosition = 'top-left'
    } else if (buttonCenterX >= centerX && buttonCenterY < centerY) {
      newPosition = 'top-right'
    } else if (buttonCenterX < centerX && buttonCenterY >= centerY) {
      newPosition = 'bottom-left'
    } else {
      newPosition = 'bottom-right'
    }

    setPosition(newPosition)

    // Reset positioning to CSS classes
    if (buttonRef.current) {
      buttonRef.current.style.left = ''
      buttonRef.current.style.top = ''
      buttonRef.current.style.right = ''
      buttonRef.current.style.bottom = ''
    }

    const resetDragState = {
      isDragging: false,
      startX: 0,
      startY: 0,
      buttonX: 0,
      buttonY: 0,
    }
    setDragState(resetDragState)
    dragRef.current = resetDragState
  }, [])

  // Setup global mouse event listeners
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // Prevent click when dragging
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragState.isDragging) {
        e.preventDefault()
        return
      }
      setIsOpen(true)
    },
    [dragState.isDragging]
  )

  // Position classes
  const getPositionClasses = () => {
    const baseClasses = 'fixed z-50'
    switch (position) {
      case 'top-left':
        return `${baseClasses} top-6 left-6`
      case 'top-right':
        return `${baseClasses} top-6 right-6`
      case 'bottom-left':
        return `${baseClasses} bottom-6 left-6`
      case 'bottom-right':
      default:
        return `${baseClasses} bottom-6 right-6`
    }
  }

  const getChatPositionClasses = () => {
    const baseClasses = 'fixed z-50'
    const size = isExpanded ? 'w-[800px] h-[700px]' : 'w-96 h-[500px]'

    switch (position) {
      case 'top-left':
        return `${baseClasses} top-6 left-6 ${size}`
      case 'top-right':
        return `${baseClasses} top-6 right-6 ${size}`
      case 'bottom-left':
        return `${baseClasses} bottom-6 left-6 ${size}`
      case 'bottom-right':
      default:
        return `${baseClasses} bottom-6 right-6 ${size}`
    }
  }

  // Don't show chat if user is not signed in or on document detail page
  if (!isSignedIn || pageContext?.isDocumentDetailPage) {
    return <div suppressHydrationWarning /> // Return empty div to prevent hydration mismatch
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <Button
          ref={buttonRef}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          size="lg"
          className={`${getPositionClasses()} h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 cursor-move select-none`}
          aria-label="Open chat assistant"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div ref={chatRef} className={getChatPositionClasses()}>
          <Card className="h-full shadow-xl border-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">
                    AI Assistant
                  </CardTitle>
                  {pageContext && (
                    <Badge variant="outline" className="text-xs">
                      {pageContext.title}
                    </Badge>
                  )}
                  {chatState.documentChatEnabled && (
                    <Badge variant="secondary" className="text-xs">
                      <FileText className="h-3 w-3 mr-1" />
                      Document Mode
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    onClick={() => setIsExpanded(!isExpanded)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    onClick={() => setIsOpen(false)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Close chat"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Document Chat Toggle - only show when supported and not on document detail page */}
              {pageContext?.supportsDocumentChat &&
                !pageContext.isDocumentDetailPage && (
                  <div className="mt-3">
                    <DocumentChatToggle
                      enabled={chatState.documentChatEnabled}
                      onToggle={handleDocumentChatToggle}
                      isLoading={isLoadingDocuments}
                      documentCount={availableDocuments.length}
                    />
                  </div>
                )}

              {/* Document Scope Selector - only show when document chat is enabled */}
              {chatState.documentChatEnabled && chatState.documentScope && (
                <div className="mt-3">
                  <DocumentScopeSelector
                    currentScope={chatState.documentScope}
                    onScopeChange={(scope) =>
                      setChatState((prev) => ({
                        ...prev,
                        documentScope: scope,
                      }))
                    }
                    availableDocuments={availableDocuments}
                    availableFolders={availableFolders}
                  />
                </div>
              )}

              {/* Context Description */}
              <div className="mt-3 text-sm text-muted-foreground">
                {getChatContextDescription(chatState, pageContext)}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col h-[calc(100%-180px)] p-0">
              {/* Embed the CleanAIChat component with chat state */}
              <div className="flex-1 overflow-hidden">
                <CleanAIChat
                  organizationId={organizationId || 'demo'}
                  chatState={chatState}
                  className="h-full"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
