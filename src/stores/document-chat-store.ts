'use client'

/**
 * DocumentChatSystem AI - Unified Zustand Store
 *
 * Unified Implementation:
 * ✅ DOCUMENTS SLICE - Complete document/folder management with native Zustand operations
 * 🚧 OTHER SLICES - Organized placeholders for user, organization, opportunities, billing, etc.
 *
 * This store is designed to be:
 * - Pure Zustand implementation (no external services)
 * - Type-safe with comprehensive validation
 * - Scalable slice-based architecture
 * - Performance optimized with selective subscriptions
 * - Future-ready for enterprise features
 */

import React from 'react'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// Type imports
import type {
  Document,
  Folder,
} from '@/types/documents'

import type {
  User,
  Organization,
  Profile,
  ApiResponse,
  PaginatedResponse,
} from '@/types'

// Import new comprehensive document types
import type {
  DocumentsSlice,
  DocumentsState,
  DocumentsActions,
  DocumentCreateInput,
  DocumentUpdateInput,
  FolderCreateInput,
  FolderUpdateInput,
  TreeOperationResult,
  TreeOperationLog,
  ViewMode,
  SortOption,
  DocumentFilters,
  SelectedItems,
  DOCUMENT_OPERATIONS,
  FOLDER_OPERATIONS,
} from '@/types/documents'

import {
  DocumentType,
  ProcessingStatus,
  SecurityClassification,
  WorkflowStatus
} from '@/types/documents'

// Utilities
import {
  captureTreeState,
  logTreeStateChange,
} from '@/lib/utils/tree-state-utils'
import { TREE_OPERATIONS } from '@/lib/constants'
import { formatFileSize } from '@/lib/exif-utils'
import { getFileTypeFromMimeType } from '@/components/documents/file-type-utils'
import { TreeUtils } from '@/lib/utils/tree-utils'

// =============================================
// SLICE INTERFACES
// =============================================

// User State Slice
interface UserSlice {
  currentUser: User | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  // Actions (to be implemented)
  login: (credentials: any) => Promise<void>
  logout: () => void
  updateUser: (updates: Partial<User>) => Promise<void>
  clearError: () => void
}

// Organization State Slice
interface OrganizationSlice {
  current: Organization | null
  loading: boolean
  error: string | null
  // Actions (to be implemented)
  setOrganization: (org: Organization) => void
  updateOrganization: (updates: Partial<Organization>) => Promise<void>
  clearError: () => void
}

// Profile State Slice
interface ProfileSlice {
  current: Profile | null
  loading: boolean
  error: string | null
  // Actions (to be implemented)
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  clearError: () => void
}

// Opportunities State Slice
interface OpportunitiesSlice {
  items: any[]
  loading: boolean
  error: string | null
  filters: any
  searchQuery: string
  // Actions (to be implemented)
  fetchOpportunities: () => Promise<void>
  searchOpportunities: (query: string) => void
  setFilters: (filters: any) => void
  clearError: () => void
}

// Billing State Slice
interface BillingSlice {
  subscription: any | null
  loading: boolean
  error: string | null
  // Actions (to be implemented)
  fetchSubscription: () => Promise<void>
  updateSubscription: (updates: any) => Promise<void>
  clearError: () => void
}

// Notifications State Slice
interface NotificationsSlice {
  items: any[]
  unreadCount: number
  loading: boolean
  error: string | null
  // Actions
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearError: () => void
  // Add convenience method for showing notifications
  showNotification: (options: {
    title: string
    message: string
    type?: 'success' | 'error' | 'warning' | 'info'
    priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  }) => void
}

// Settings State Slice
interface SettingsSlice {
  theme: 'light' | 'dark' | 'system'
  loading: boolean
  error: string | null
  // Actions (to be implemented)
  updateTheme: (theme: 'light' | 'dark' | 'system') => void
  updateSettings: (settings: any) => Promise<void>
  clearError: () => void
}

// AI State Slice
interface AISlice {
  // Model management
  models: ModelInfo[]
  selectedModel: string | null
  loading: boolean
  error: string | null

  // Search functionality
  search: {
    query: string
    selectedTier: 'all' | 'fast' | 'balanced' | 'powerful'
    selectedCapabilities: string[]
    filteredModels: ModelInfo[]
    searchIndex: Map<string, ModelInfo[]>
    isSearching: boolean
    debounceTimer: NodeJS.Timeout | null
  }

  // Real-time performance data
  modelPerformance: Record<string, {
    averageLatency: number
    successRate: number
    averageCost: number
    qualityScore: number
    lastUpdated: string
    sampleSize: number
  }>

  // Real-time pricing
  realTimePricing: Record<string, {
    prompt: number
    completion: number
    lastUpdated: string
  }>

  // Provider status
  providerStatus: Record<string, {
    status: 'online' | 'degraded' | 'offline'
    lastChecked: string
  }>

  // Usage tracking
  currentUsage: {
    tokensUsed: number
    requestsCount: number
    totalCost: number
    resetAt: string
  }

  // Feature toggles
  features: {
    openRouterEnabled: boolean
    costOptimization: boolean
    realTimeMetrics: boolean
    advancedSettings: boolean
  }

  // PDF processing configuration
  pdfEngine: 'pdf-text' | 'mistral-ocr' | 'native'

  // Actions
  setModels: (models: ModelInfo[]) => void
  setSelectedModel: (modelId: string | null) => void
  updateModelPerformance: (modelId: string, performance: any) => void
  updateRealTimePricing: (modelId: string, pricing: { prompt: number; completion: number }) => void
  updateProviderStatus: (providerId: string, status: any) => void
  trackUsage: (usage: { tokens: number; cost: number }) => void
  resetUsage: () => void
  toggleFeature: (feature: keyof AISlice['features'], enabled: boolean) => void
  setPdfEngine: (engine: 'pdf-text' | 'mistral-ocr' | 'native') => void
  refreshModels: () => Promise<void>
  forceRefreshModels: () => Promise<void>
  clearError: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Search actions
  setSearchQuery: (query: string) => void
  setSelectedTier: (tier: 'all' | 'fast' | 'balanced' | 'powerful') => void
  setSelectedCapabilities: (capabilities: string[]) => void
  toggleCapability: (capability: string) => void
  performSearch: (immediate?: boolean) => void
  clearSearch: () => void
  buildSearchIndex: () => void
}

interface ModelInfo {
  name: string
  provider: string
  displayName: string
  description: string
  maxTokens: number
  costPer1KTokens: { prompt: number; completion: number }
  averageLatency: number | null
  qualityScore: number | null
  tier: 'fast' | 'balanced' | 'powerful'
  features: string[]
  metadata?: any
}

// =============================================
// MAIN STORE INTERFACE
// =============================================

interface DocumentChatSystemStore {
  // ==========================================
  // DOCUMENTS SLICE - FULLY IMPLEMENTED
  // ==========================================
  documents: DocumentsSlice

  // Backward compatibility aliases
  tree: DocumentsState
  state: DocumentsState

  // Backward compatibility methods (delegated to documents slice)
  loadFolders: () => Promise<TreeOperationResult<Folder[]>>
  createFolder: (
    name: string,
    parentId: string | null,
    description?: string,
    color?: string
  ) => Promise<TreeOperationResult<Folder>>
  updateFolder: (
    folderId: string,
    updates: Partial<Pick<Folder, 'name' | 'description' | 'color'>>
  ) => Promise<TreeOperationResult<Folder>>
  deleteFolder: (folderId: string) => Promise<TreeOperationResult<void>>
  moveFolder: (folderId: string, newParentId: string | null) => Promise<TreeOperationResult<Folder>>

  updateDocument: (
    documentId: string,
    updates: Partial<Document>
  ) => Promise<TreeOperationResult<Document>>
  moveDocument: (documentId: string, newFolderId: string | null) => Promise<TreeOperationResult<Document>>
  deleteDocument: (documentId: string) => Promise<TreeOperationResult<void>>
  createDocument: (
    file: File,
    folderId: string | null,
    organizationId: string
  ) => Promise<TreeOperationResult<Document>>

  navigateToFolder: (folderId: string | null) => void

  getFolderChildren: (parentId: string | null) => Folder[]
  getFolderPath: (folderId: string) => Folder[]
  getFolderDocuments: (folderId: string | null) => Document[]
  findFolder: (id: string) => Folder | undefined
  findDocument: (id: string) => Document | undefined
  searchDocuments: (query: string) => Document[]
  setSearchQuery: (query: string) => void
  setSearchResults: (results: Document[]) => void
  clearSearch: () => void

  clearError: () => void

  // ==========================================
  // OTHER SLICES - ORGANIZED FOR FUTURE IMPLEMENTATION
  // ==========================================
  user: UserSlice
  organization: OrganizationSlice
  profile: ProfileSlice
  opportunities: OpportunitiesSlice
  billing: BillingSlice
  notifications: NotificationsSlice
  settings: SettingsSlice

  // AI Integration slice
  ai: AISlice

  // Future slices (will be implemented in respective phases)
  government?: any // Phase 3: Government APIs
  analytics?: any // Phase 4: Enterprise features

  // ==========================================
  // STORE MANAGEMENT
  // ==========================================
  _setState: (updates: Partial<DocumentChatSystemStore>) => void
  _initializeStore: (initialData: {
    folders?: Folder[]
    documents?: Document[]
    user?: User
    organization?: Organization
  }) => void
  _resetStore: () => void
  _getStoreSnapshot: () => Partial<DocumentChatSystemStore>
}

// =============================================
// DOCUMENTS SLICE IMPLEMENTATION
// =============================================

const createDocumentsSlice = (set: any, get: any): DocumentsSlice => ({
  // State
  folders: [],
  documents: [],
  currentFolderId: null,
  selectedItems: { documents: [], folders: [] },
  loading: false,
  error: null,
  operationLogs: [],
  searchQuery: '',
  searchResults: [],
  viewMode: 'grid' as ViewMode,
  sortBy: { field: 'lastModified', label: 'Last Modified' },
  sortDirection: 'desc',
  filters: {
    types: [],
    tags: [],
  },

  // Helper functions for operation results
  _createSuccessResult: <T>(
    data: T,
    operation: string
  ): TreeOperationResult<T> => ({
    success: true,
    data,
    operation,
    timestamp: new Date().toISOString(),
  }),

  _createErrorResult: <T>(
    error: string,
    operation: string
  ): TreeOperationResult<T> => ({
    success: false,
    error,
    operation,
    timestamp: new Date().toISOString(),
  }),

  // Helper function to log operations
  _logOperation: (log: TreeOperationLog) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.operationLogs.push(log)
    })
    console.log('📋 Document Operation:', log)
  },

  // State management
  setFolders: (folders: Folder[]) => {
    console.log('🗂️ [DOCUMENTS STORE] setFolders called:', {
      action: 'SET_FOLDERS',
      foldersCount: folders.length,
      folders: folders.map((f: Folder) => ({ id: f.id, name: f.name, parentId: f.parentId })),
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.folders = folders
    })

    console.log('✅ [DOCUMENTS STORE] setFolders completed - New state:', {
      totalFolders: get().documents.folders.length,
      currentFolderId: get().documents.currentFolderId,
      documentsCount: get().documents.documents.length
    })
  },

  setDocuments: (documents: Document[]) => {
    console.log('📄 [DOCUMENTS STORE] setDocuments called:', {
      action: 'SET_DOCUMENTS',
      documentsCount: documents.length,
      documents: documents.map((d: any) => ({ id: d.id, name: d.name, folderId: d.folderId })),
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.documents = documents
    })

    console.log('✅ [DOCUMENTS STORE] setDocuments completed - New state:', {
      totalDocuments: get().documents.documents.length,
      currentFolderId: get().documents.currentFolderId,
      foldersCount: get().documents.folders.length
    })
  },

  setCurrentFolderId: (id: string | null) => {
    const previousId = get().documents.currentFolderId
    console.log('📂 [DOCUMENTS STORE] setCurrentFolderId called:', {
      action: 'SET_CURRENT_FOLDER',
      previousFolderId: previousId,
      newFolderId: id,
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.currentFolderId = id
    })

    const currentState = get().documents
    console.log('✅ [DOCUMENTS STORE] setCurrentFolderId completed - New state:', {
      currentFolderId: currentState.currentFolderId,
      documentsInFolder: currentState.documents.filter((d: Document) => d.folderId === id).length,
      subfolders: currentState.folders.filter((f: Folder) => f.parentId === id).length
    })
  },

  setLoading: (loading: boolean) => {
    console.log('⏳ [DOCUMENTS STORE] setLoading called:', {
      action: 'SET_LOADING',
      loading,
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.loading = loading
    })
  },

  setError: (error: string | null) => {
    console.log('❌ [DOCUMENTS STORE] setError called:', {
      action: 'SET_ERROR',
      error,
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.error = error
    })
  },

  clearError: () => {
    console.log('🧹 [DOCUMENTS STORE] clearError called:', {
      action: 'CLEAR_ERROR',
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.error = null
    })
  },

  // Folder operations
  createFolder: async (input: FolderCreateInput): Promise<TreeOperationResult<Folder>> => {
    const state = get() as DocumentChatSystemStore

    console.log('📁➕ [DOCUMENTS STORE] createFolder called:', {
      action: 'CREATE_FOLDER',
      input,
      currentState: {
        totalFolders: state.documents.folders.length,
        currentFolderId: state.documents.currentFolderId,
        foldersInParent: state.documents.folders.filter((f: any) => f.parentId === input.parentId).length
      },
      timestamp: new Date().toISOString()
    })

    try {
      // STEP 1: Client-side validation - check for duplicate names in same parent
      const existingFolder = state.documents.folders.find(
        (f) => f.name === input.name && f.parentId === input.parentId
      )
      if (existingFolder) {
        console.log('❌ [DOCUMENTS STORE] createFolder failed - duplicate name:', {
          existingFolder: { id: existingFolder.id, name: existingFolder.name },
          input
        })
        return state.documents._createErrorResult<Folder>(
          'A folder with this name already exists in this location',
          'CREATE_FOLDER'
        )
      }

      // STEP 2: Call the API to create the folder in the database
      console.log('🌐 [DOCUMENTS STORE] Calling folder creation API:', {
        endpoint: '/api/v1/folders',
        payload: {
          name: input.name,
          description: input.description,
          parentId: input.parentId,
          color: input.color,
          organizationId: input.organizationId
        }
      })

      const response = await fetch('/api/v1/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: input.name,
          description: input.description || '',
          parentId: input.parentId,
          color: input.color || '#6b7280',
          icon: input.icon || null,
          folderType: input.folderType || null
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
      }

      const apiResult = await response.json()
      console.log('✅ [DOCUMENTS STORE] API folder creation successful:', apiResult)

      if (!apiResult.success || !apiResult.folder) {
        throw new Error(apiResult.error || 'Failed to create folder - invalid API response')
      }

      // STEP 3: Transform API response to local format
      const newFolder: Folder = {
        id: apiResult.folder.id,
        name: apiResult.folder.name,
        description: apiResult.folder.description || null,
        parentId: apiResult.folder.parentId,
        color: apiResult.folder.color || null,
        organizationId: apiResult.folder.organizationId || input.organizationId,
        createdById: apiResult.folder.createdById || 'current_user',

        // Hierarchy
        path: apiResult.folder.path || [],
        level: apiResult.folder.level || 0,

        // Folder properties
        icon: apiResult.folder.icon || null,
        folderType: apiResult.folder.folderType || null,
        isSystemFolder: apiResult.folder.isSystemFolder || false,
        isPublic: apiResult.folder.isPublic || false,
        isProtected: apiResult.folder.isProtected || false,

        // Metadata
        metadata: apiResult.folder.metadata || null,

        // Timestamps
        createdAt: apiResult.folder.createdAt,
        updatedAt: apiResult.folder.updatedAt,
        deletedAt: apiResult.folder.deletedAt || null
      }

      // STEP 4: Update local state with API response data
      set((state: DocumentChatSystemStore) => {
        state.documents.folders.push(newFolder)
      })

      console.log('✅ [DOCUMENTS STORE] createFolder success - folder created and persisted:', {
        newFolder: { id: newFolder.id, name: newFolder.name, parentId: newFolder.parentId },
        apiData: apiResult.folder,
        newState: {
          totalFolders: get().documents.folders.length,
          foldersInParent: get().documents.folders.filter((f: any) => f.parentId === input.parentId).length
        }
      })

      // STEP 5: Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'CREATE_FOLDER',
        entityType: 'folder',
        entityId: newFolder.id,
        timestamp: new Date().toISOString(),
        success: true,
        afterState: newFolder,
        metadata: {
          parentId: input.parentId,
          name: input.name,
          apiResult: apiResult,
          persisted: true
        },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(
        newFolder,
        'CREATE_FOLDER'
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('❌ [DOCUMENTS STORE] createFolder error:', {
        error: errorMessage,
        input,
        timestamp: new Date().toISOString()
      })
      set((state: DocumentChatSystemStore) => {
        state.documents.error = errorMessage
      })
      return state.documents._createErrorResult<Folder>(
        errorMessage,
        'CREATE_FOLDER'
      )
    }
  },

  updateFolder: async (folderId: string, updates: FolderUpdateInput): Promise<TreeOperationResult<Folder>> => {
    const state = get() as DocumentChatSystemStore

    console.log('📁✏️ [DOCUMENTS STORE] updateFolder called:', {
      action: 'UPDATE_FOLDER',
      folderId,
      updates,
      timestamp: new Date().toISOString()
    })

    try {
      // STEP 1: Find folder in local state for validation
      const folderIndex = state.documents.folders.findIndex((f) => f.id === folderId)
      if (folderIndex === -1) {
        console.log('❌ [DOCUMENTS STORE] updateFolder failed - folder not found locally:', folderId)
        return state.documents._createErrorResult<Folder>('Folder not found', 'UPDATE_FOLDER')
      }

      const beforeState = state.documents.folders[folderIndex]

      // STEP 2: Call the API to update the folder in the database
      console.log('🌐 [DOCUMENTS STORE] Calling folder update API:', {
        endpoint: `/api/v1/folders/${folderId}`,
        method: 'PUT',
        payload: updates
      })

      const response = await fetch(`/api/v1/folders/${folderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
      }

      const apiResult = await response.json()
      console.log('✅ [DOCUMENTS STORE] API folder update successful:', apiResult)

      if (!apiResult.success || !apiResult.folder) {
        throw new Error(apiResult.error || 'Failed to update folder - invalid API response')
      }

      // STEP 3: Transform API response to local format
      const updatedFolder: Folder = {
        id: apiResult.folder.id,
        name: apiResult.folder.name,
        description: apiResult.folder.description || null,
        parentId: apiResult.folder.parentId,
        color: apiResult.folder.color || null,
        organizationId: apiResult.folder.organizationId,
        createdById: apiResult.folder.createdById || 'current_user',

        // Hierarchy
        path: apiResult.folder.path || [],
        level: apiResult.folder.level || 0,

        // Folder properties
        icon: apiResult.folder.icon || null,
        folderType: apiResult.folder.folderType || null,
        isSystemFolder: apiResult.folder.isSystemFolder || false,
        isPublic: apiResult.folder.isPublic || false,
        isProtected: apiResult.folder.isProtected || false,

        // Metadata
        metadata: apiResult.folder.metadata || null,

        // Timestamps
        createdAt: apiResult.folder.createdAt,
        updatedAt: apiResult.folder.updatedAt,
        deletedAt: apiResult.folder.deletedAt || null
      }

      // STEP 4: Update local state with API response data
      set((state: DocumentChatSystemStore) => {
        state.documents.folders[folderIndex] = updatedFolder
      })

      console.log('✅ [DOCUMENTS STORE] updateFolder success - folder updated and persisted:', {
        updatedFolder: { id: updatedFolder.id, name: updatedFolder.name, parentId: updatedFolder.parentId },
        apiData: apiResult.folder,
        changes: updates
      })

      // STEP 5: Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'UPDATE_FOLDER',
        entityType: 'folder',
        entityId: folderId,
        timestamp: new Date().toISOString(),
        success: true,
        beforeState,
        afterState: updatedFolder,
        metadata: {
          updates,
          apiResult: apiResult,
          persisted: true
        },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(updatedFolder, 'UPDATE_FOLDER')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('❌ [DOCUMENTS STORE] updateFolder error:', {
        error: errorMessage,
        folderId,
        updates,
        timestamp: new Date().toISOString()
      })
      set((state: DocumentChatSystemStore) => {
        state.documents.error = errorMessage
      })
      return state.documents._createErrorResult<Folder>(errorMessage, 'UPDATE_FOLDER')
    }
  },

  deleteFolder: async (folderId: string): Promise<TreeOperationResult<void>> => {
    const state = get() as DocumentChatSystemStore

    console.log('📁🗑️ [DOCUMENTS STORE] deleteFolder called:', {
      action: 'DELETE_FOLDER',
      folderId,
      timestamp: new Date().toISOString()
    })

    try {
      // STEP 1: Find folder in local state for validation
      const folder = state.documents.folders.find((f) => f.id === folderId)
      if (!folder) {
        console.log('❌ [DOCUMENTS STORE] deleteFolder failed - folder not found locally:', folderId)
        return state.documents._createErrorResult<void>('Folder not found', 'DELETE_FOLDER')
      }

      // STEP 2: Client-side validation
      if (folder.isProtected) {
        console.log('❌ [DOCUMENTS STORE] deleteFolder failed - protected folder:', folderId)
        return state.documents._createErrorResult<void>('Cannot delete protected system folders', 'DELETE_FOLDER')
      }

      // Check for children (local validation)
      const hasChildren = state.documents.folders.some((f) => f.parentId === folderId)
      const hasDocuments = state.documents.documents.some((d) => d.folderId === folderId)

      if (hasChildren || hasDocuments) {
        console.log('❌ [DOCUMENTS STORE] deleteFolder failed - folder contains items:', {
          folderId,
          hasChildren,
          hasDocuments
        })
        return state.documents._createErrorResult<void>('Cannot delete folder that contains items', 'DELETE_FOLDER')
      }

      console.log(`🗑️ Starting optimistic delete for folder: ${folder.name} (${folderId})`)

      // STEP 3: Optimistic UI update - remove from store immediately
      const folderBackup = { ...folder } // Create backup for rollback
      set((state: DocumentChatSystemStore) => {
        state.documents.folders = state.documents.folders.filter((f) => f.id !== folderId)
      })

      try {
        // STEP 4: Call DELETE API to remove from database
        console.log(`🌐 Calling DELETE API for folder: ${folderId}`)
        const response = await fetch(`/api/v1/folders/${folderId}`, {
          method: 'DELETE',
          credentials: 'include'
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
        }

        const result = await response.json()
        console.log(`✅ Folder deleted successfully from backend:`, result)

        // STEP 5: Log successful operation
        const log: TreeOperationLog = {
          id: `log_${Date.now()}`,
          operation: 'DELETE_FOLDER',
          entityType: 'folder',
          entityId: folderId,
          timestamp: new Date().toISOString(),
          success: true,
          beforeState: folderBackup,
          metadata: {
            deletedFolderId: folderId,
            apiResult: result,
            persisted: true
          },
        }
        state.documents._logOperation(log)

        return state.documents._createSuccessResult(undefined, 'DELETE_FOLDER')

      } catch (apiError) {
        // STEP 6: Rollback - restore folder to store if API call failed
        console.error(`❌ DELETE API failed, rolling back:`, apiError)

        set((state: DocumentChatSystemStore) => {
          // Add the folder back to its original position
          state.documents.folders = [...state.documents.folders, folderBackup]
          // Set error message for user notification
          state.documents.error = `Failed to delete "${folder.name}": ${apiError instanceof Error ? apiError.message : 'Unknown error'}`
        })

        // Log failed operation
        const log: TreeOperationLog = {
          id: `log_${Date.now()}`,
          operation: 'DELETE_FOLDER',
          entityType: 'folder',
          entityId: folderId,
          timestamp: new Date().toISOString(),
          success: false,
          beforeState: folderBackup,
          metadata: {
            deletedFolderId: folderId,
            error: apiError instanceof Error ? apiError.message : 'Unknown error',
            rolledBack: true
          },
        }
        state.documents._logOperation(log)

        throw apiError // Re-throw to indicate failure to the calling component
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`💥 Delete folder operation failed:`, error)

      return state.documents._createErrorResult<void>(errorMessage, 'DELETE_FOLDER')
    }
  },

  moveFolder: async (folderId: string, newParentId: string | null): Promise<TreeOperationResult<Folder>> => {
    const state = get() as DocumentChatSystemStore

    console.log('📁🚚 [DOCUMENTS STORE] moveFolder called:', {
      action: 'MOVE_FOLDER',
      folderId,
      newParentId,
      timestamp: new Date().toISOString()
    })

    try {
      // STEP 1: Find folder in local state for validation
      const folderIndex = state.documents.folders.findIndex((f) => f.id === folderId)
      if (folderIndex === -1) {
        console.log('❌ [DOCUMENTS STORE] moveFolder failed - folder not found locally:', folderId)
        return state.documents._createErrorResult<Folder>('Folder not found', 'MOVE_FOLDER')
      }

      const folder = state.documents.folders[folderIndex]

      // STEP 2: Check for circular dependency
      if (newParentId && TreeUtils.isDescendant(state.documents.folders, newParentId, folderId)) {
        console.log('❌ [DOCUMENTS STORE] moveFolder failed - circular dependency:', {
          folderId,
          newParentId
        })
        return state.documents._createErrorResult<Folder>('Cannot move folder into its own descendant', 'MOVE_FOLDER')
      }

      // STEP 3: Call the API to update the folder's parentId
      console.log('🌐 [DOCUMENTS STORE] Calling folder move API:', {
        endpoint: `/api/v1/folders/${folderId}`,
        method: 'PUT',
        payload: { parentId: newParentId }
      })

      const response = await fetch(`/api/v1/folders/${folderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          parentId: newParentId
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
      }

      const apiResult = await response.json()
      console.log('✅ [DOCUMENTS STORE] API folder move successful:', apiResult)

      if (!apiResult.success || !apiResult.folder) {
        throw new Error(apiResult.error || 'Failed to move folder - invalid API response')
      }

      // STEP 4: Transform API response to local format
      const updatedFolder: Folder = {
        id: apiResult.folder.id,
        name: apiResult.folder.name,
        description: apiResult.folder.description || null,
        parentId: apiResult.folder.parentId,
        color: apiResult.folder.color || null,
        organizationId: apiResult.folder.organizationId,
        createdById: apiResult.folder.createdById || 'current_user',

        // Hierarchy
        path: apiResult.folder.path || [],
        level: apiResult.folder.level || 0,

        // Folder properties
        icon: apiResult.folder.icon || null,
        folderType: apiResult.folder.folderType || null,
        isSystemFolder: apiResult.folder.isSystemFolder || false,
        isPublic: apiResult.folder.isPublic || false,
        isProtected: apiResult.folder.isProtected || false,

        // Metadata
        metadata: apiResult.folder.metadata || null,

        // Timestamps
        createdAt: apiResult.folder.createdAt,
        updatedAt: apiResult.folder.updatedAt,
        deletedAt: apiResult.folder.deletedAt || null
      }

      // STEP 5: Update local state with API response data
      set((state: DocumentChatSystemStore) => {
        state.documents.folders[folderIndex] = updatedFolder
      })

      console.log('✅ [DOCUMENTS STORE] moveFolder success - folder moved and persisted:', {
        movedFolder: { id: updatedFolder.id, name: updatedFolder.name, parentId: updatedFolder.parentId },
        oldParent: folder.parentId,
        newParent: newParentId
      })

      // STEP 6: Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'MOVE_FOLDER',
        entityType: 'folder',
        entityId: folderId,
        timestamp: new Date().toISOString(),
        success: true,
        beforeState: folder,
        afterState: updatedFolder,
        metadata: {
          newParentId,
          oldParentId: folder.parentId,
          apiResult: apiResult,
          persisted: true
        },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(updatedFolder, 'MOVE_FOLDER')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('❌ [DOCUMENTS STORE] moveFolder error:', {
        error: errorMessage,
        folderId,
        newParentId,
        timestamp: new Date().toISOString()
      })
      set((state: DocumentChatSystemStore) => {
        state.documents.error = errorMessage
      })
      return state.documents._createErrorResult<Folder>(errorMessage, 'MOVE_FOLDER')
    }
  },

  // Document operations
  createDocument: async (input: DocumentCreateInput): Promise<TreeOperationResult<Document>> => {
    const state = get() as DocumentChatSystemStore

    try {
      const fileType = getFileTypeFromMimeType(input.file.type, input.file.name)

      // SECURITY: This function should NOT be used in production
      // It's only for testing/development purposes
      if (process.env.NODE_ENV === 'production') {
        throw new Error('simulateDocumentUpload is not allowed in production');
      }

      const newDocument: Document = {
        // Core fields
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId: input.organizationId,
        uploadedById: 'test_user', // Must be provided in real implementation
        folderId: input.folderId,

        // File information
        name: input.file.name,
        size: input.file.size,
        mimeType: input.file.type,
        filePath: `/uploads/${input.file.name}`,
        uploadDate: new Date().toISOString(),
        lastModified: new Date().toISOString(),

        // Computed fields (needed for UI)
        type: fileType,

        // Document classification - Default to OTHER, not file type
        documentType: input.documentType || DocumentType.OTHER,
        securityClassification: input.securityClassification || SecurityClassification.INTERNAL,
        workflowStatus: input.workflowStatus || WorkflowStatus.DRAFT,

        // Extracted content
        extractedText: '',
        summary: '',

        // User metadata
        description: input.description || null,
        tags: input.tags || [],
        isEditable: true,

        // JSON fields (empty by default)
        content: { sections: [], tables: [], images: [] },
        embeddings: { documentId: '', documentTitle: '', organizationNamespace: '', chunks: [], model: '', dimensions: 0, totalChunks: 0, lastProcessed: '' },
        entities: { entities: [] },
        sharing: { permissions: [], share: null, shareViews: [], comments: [] },
        revisions: { revisions: [] },
        processing: {
          currentStatus: ProcessingStatus.PENDING,
          progress: 0,
          currentStep: null,
          estimatedCompletion: null,
          events: []
        },
        analysis: { contract: null, compliance: null },

        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,

        // Client-side only
        originalFile: input.file
      }

      // Update state
      set((state: DocumentChatSystemStore) => {
        state.documents.documents.push(newDocument)
      })


      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'CREATE_DOCUMENT',
        entityType: 'document',
        entityId: newDocument.id,
        timestamp: new Date().toISOString(),
        success: true,
        afterState: newDocument,
        metadata: { fileName: input.file.name, folderId: input.folderId },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(newDocument, 'CREATE_DOCUMENT')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set((state: DocumentChatSystemStore) => {
        state.documents.error = errorMessage
      })
      return state.documents._createErrorResult<Document>(errorMessage, 'CREATE_DOCUMENT')
    }
  },

  updateDocument: async (documentId: string, updates: DocumentUpdateInput): Promise<TreeOperationResult<Document>> => {
    const state = get() as DocumentChatSystemStore

    try {
      const documentIndex = state.documents.documents.findIndex((d) => d.id === documentId)
      if (documentIndex === -1) {
        return state.documents._createErrorResult<Document>('Document not found', 'UPDATE_DOCUMENT')
      }

      const beforeState = state.documents.documents[documentIndex]
      const updatedDocument: Document = {
        ...beforeState,
        ...updates,
        lastModified: new Date().toISOString(),
      }

      // Update state
      set((state: DocumentChatSystemStore) => {
        state.documents.documents[documentIndex] = updatedDocument
      })

      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'UPDATE_DOCUMENT',
        entityType: 'document',
        entityId: documentId,
        timestamp: new Date().toISOString(),
        success: true,
        beforeState,
        afterState: updatedDocument,
        metadata: { updates },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(updatedDocument, 'UPDATE_DOCUMENT')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set((state: DocumentChatSystemStore) => {
        state.documents.error = errorMessage
      })
      return state.documents._createErrorResult<Document>(errorMessage, 'UPDATE_DOCUMENT')
    }
  },


  moveDocument: async (documentId: string, newFolderId: string | null): Promise<TreeOperationResult<Document>> => {
    const state = get() as DocumentChatSystemStore

    try {
      const documentIndex = state.documents.documents.findIndex((d) => d.id === documentId)
      if (documentIndex === -1) {
        return state.documents._createErrorResult<Document>('Document not found', 'MOVE_DOCUMENT')
      }

      const originalDocument = state.documents.documents[documentIndex]
      console.log(`📂 Moving document: ${originalDocument.name} to folder: ${newFolderId || 'root'}`)

      // STEP 1: Optimistic UI update
      const optimisticDocument: Document = {
        ...originalDocument,
        folderId: newFolderId,
        lastModified: new Date().toISOString(),
      }

      set((state: DocumentChatSystemStore) => {
        state.documents.documents[documentIndex] = optimisticDocument
      })

      try {
        // STEP 2: Call PUT API to update in database
        console.log(`🌐 Calling PUT API to move document: ${documentId}`)
        const response = await fetch(`/api/v1/documents/${documentId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            folderId: newFolderId
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
        }

        const result = await response.json()
        console.log(`✅ Document moved successfully via API:`, result)

        // STEP 3: Update with server response (in case server modified anything)
        if (result.success && result.document) {
          set((state: DocumentChatSystemStore) => {
            const docIndex = state.documents.documents.findIndex((d) => d.id === documentId)
            if (docIndex !== -1) {
              state.documents.documents[docIndex] = result.document
            }
          })
        }

        // STEP 4: Log successful operation
        const log: TreeOperationLog = {
          id: `log_${Date.now()}`,
          operation: 'MOVE_DOCUMENT',
          entityType: 'document',
          entityId: documentId,
          timestamp: new Date().toISOString(),
          success: true,
          beforeState: originalDocument,
          afterState: result.document || optimisticDocument,
          metadata: {
            previousFolderId: originalDocument.folderId,
            newFolderId,
            apiResponse: result
          }
        }
        state.documents._logOperation(log)

        return state.documents._createSuccessResult(result.document || optimisticDocument, 'MOVE_DOCUMENT')

      } catch (apiError) {
        // STEP 5: Rollback on API failure
        console.error(`❌ API call failed, rolling back document move:`, apiError)
        set((state: DocumentChatSystemStore) => {
          state.documents.documents[documentIndex] = originalDocument
        })

        const errorMessage = apiError instanceof Error ? apiError.message : 'Failed to move document'

        // Log failed operation
        const log: TreeOperationLog = {
          id: `log_${Date.now()}`,
          operation: 'MOVE_DOCUMENT',
          entityType: 'document',
          entityId: documentId,
          timestamp: new Date().toISOString(),
          success: false,
          error: errorMessage,
          beforeState: originalDocument,
          afterState: originalDocument, // Rolled back
          metadata: {
            previousFolderId: originalDocument.folderId,
            newFolderId,
            rollback: true
          }
        }
        state.documents._logOperation(log)

        throw apiError
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set((state: DocumentChatSystemStore) => {
        state.documents.error = errorMessage
      })
      console.error(`❌ Error in moveDocument:`, error)
      return state.documents._createErrorResult<Document>(errorMessage, 'MOVE_DOCUMENT')
    }
  },

  deleteDocument: async (documentId: string): Promise<TreeOperationResult<void>> => {
    const state = get() as DocumentChatSystemStore

    try {
      const document = state.documents.documents.find((d) => d.id === documentId)
      if (!document) {
        return state.documents._createErrorResult<void>('Document not found', 'DELETE_DOCUMENT')
      }

      console.log(`🗑️  Starting optimistic delete for: ${document.name} (${documentId})`)

      // STEP 1: Optimistic UI update - remove from store immediately
      const documentBackup = { ...document } // Create backup for rollback
      set((state: DocumentChatSystemStore) => {
        state.documents.documents = state.documents.documents.filter((d) => d.id !== documentId)
      })

      try {
        // STEP 2: Call DELETE API to remove from Supabase storage and Prisma
        console.log(`🌐 Calling DELETE API for document: ${documentId}`)
        const response = await fetch(`/api/v1/documents/${documentId}`, {
          method: 'DELETE',
          credentials: 'include'
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
        }

        const result = await response.json()
        console.log(`✅ Document deleted successfully from backend:`, result)

        // STEP 3: Log successful operation
        const log: TreeOperationLog = {
          id: `log_${Date.now()}`,
          operation: 'DELETE_DOCUMENT',
          entityType: 'document',
          entityId: documentId,
          timestamp: new Date().toISOString(),
          success: true,
          beforeState: documentBackup,
          metadata: {
            deletedDocumentId: documentId,
            apiResult: result
          },
        }
        state.documents._logOperation(log)

        return state.documents._createSuccessResult(undefined, 'DELETE_DOCUMENT')

      } catch (apiError) {
        // STEP 4: Rollback - restore document to store if API call failed
        console.error(`❌ DELETE API failed, rolling back:`, apiError)

        set((state: DocumentChatSystemStore) => {
          // Add the document back to its original position
          state.documents.documents = [...state.documents.documents, documentBackup]
          // Set error message for user notification
          state.documents.error = `Failed to delete "${document.name}": ${apiError instanceof Error ? apiError.message : 'Unknown error'}`
        })

        // Log failed operation
        const log: TreeOperationLog = {
          id: `log_${Date.now()}`,
          operation: 'DELETE_DOCUMENT',
          entityType: 'document',
          entityId: documentId,
          timestamp: new Date().toISOString(),
          success: false,
          beforeState: documentBackup,
          metadata: {
            deletedDocumentId: documentId,
            error: apiError instanceof Error ? apiError.message : 'Unknown error',
            rolledBack: true
          },
        }
        state.documents._logOperation(log)

        throw apiError // Re-throw to indicate failure to the calling component
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`💥 Delete operation failed:`, error)

      return state.documents._createErrorResult<void>(errorMessage, 'DELETE_DOCUMENT')
    }
  },

  // Navigation and queries
  navigateToFolder: (folderId: string | null) => {
    const previousId = get().documents.currentFolderId
    console.log('🧭 [DOCUMENTS STORE] navigateToFolder called:', {
      action: 'NAVIGATE_TO_FOLDER',
      previousFolderId: previousId,
      newFolderId: folderId,
      timestamp: new Date().toISOString()
    })

    set((state: DocumentChatSystemStore) => {
      state.documents.currentFolderId = folderId
    })

    // Update URL using pushState to avoid page refresh
    if (typeof window !== 'undefined') {
      try {
        if (folderId) {
          // Navigate to specific folder using Next.js App Router path
          window.history.pushState({}, '', `/documents/folder/${folderId}`)
        } else {
          // Navigate back to root documents
          window.history.pushState({}, '', '/documents')
        }
      } catch (error) {
        console.warn('Navigation failed:', error)
      }
    }

    const newState = get().documents
    const targetFolder = folderId ? newState.folders.find((f: Folder) => f.id === folderId) : null
    console.log('✅ [DOCUMENTS STORE] navigateToFolder completed:', {
      currentFolderId: newState.currentFolderId,
      targetFolder: targetFolder ? { id: targetFolder.id, name: targetFolder.name } : null,
      documentsInFolder: newState.documents.filter((d: Document) => d.folderId === folderId).length,
      subfolders: newState.folders.filter((f: Folder) => f.parentId === folderId).length
    })
  },

  getFolderChildren: (parentId: string | null) => {
    const state = get() as DocumentChatSystemStore
    const children = state.documents.folders.filter((folder) => folder.parentId === parentId)
    return children
  },

  getFolderPath: (folderId: string) => {
    const state = get() as DocumentChatSystemStore
    const path = TreeUtils.getPath(state.documents.folders, folderId)
    console.log('🛤️ [DOCUMENTS STORE] getFolderPath called:', {
      action: 'GET_FOLDER_PATH',
      folderId,
      pathLength: path.length,
      path: path.map((p: Folder) => ({ id: p.id, name: p.name })),
      timestamp: new Date().toISOString()
    })
    return path
  },

  getFolderDocuments: (folderId: string | null) => {
    const state = get() as DocumentChatSystemStore
    const documents = state.documents.documents.filter((doc) => doc.folderId === folderId)
    return documents
  },

  findFolder: (id: string) => {
    const state = get() as DocumentChatSystemStore
    const folder = state.documents.folders.find((folder) => folder.id === id)
    console.log('🔍 [DOCUMENTS STORE] findFolder called:', {
      action: 'FIND_FOLDER',
      folderId: id,
      found: !!folder,
      folder: folder ? { id: folder.id, name: folder.name, parentId: folder.parentId } : null,
      timestamp: new Date().toISOString()
    })
    return folder
  },

  findDocument: (id: string) => {
    const state = get() as DocumentChatSystemStore
    const document = state.documents.documents.find((doc) => doc.id === id)
    return document
  },

  searchDocuments: (query: string): Document[] => {
    const state = get() as DocumentChatSystemStore
    console.log('🔍 [DOCUMENTS STORE] searchDocuments called:', {
      action: 'SEARCH_DOCUMENTS',
      query,
      totalDocuments: state.documents.documents.length,
      timestamp: new Date().toISOString()
    })

    if (!query.trim()) {
      console.log('🧹 [DOCUMENTS STORE] searchDocuments - empty query, returning empty results')
      return []
    }

    const searchTerm = query.toLowerCase()
    const results = state.documents.documents.filter(
      (doc) =>
        doc.name.toLowerCase().includes(searchTerm) ||
        doc.tags?.some((tag) =>
          tag.toLowerCase().includes(searchTerm)
        ) ||
        doc.extractedText?.toLowerCase().includes(searchTerm) ||
        doc.summary?.toLowerCase().includes(searchTerm)
    )

    console.log('✅ [DOCUMENTS STORE] searchDocuments completed:', {
      query,
      resultsCount: results.length,
      results: results.map((r: Document) => ({ id: r.id, name: r.name, folderId: r.folderId })),
      searchCriteria: {
        searchTerm,
        searchedFields: ['name', 'tags']
      }
    })

    return results
  },

  // Separate actions for updating search state
  setSearchQuery: (query: string) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.searchQuery = query
    })
  },

  setSearchResults: (results: Document[]) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.searchResults = results
    })
  },

  clearSearch: () => {
    set((state: DocumentChatSystemStore) => {
      state.documents.searchQuery = ''
      state.documents.searchResults = []
    })
  },

  // View and selection management
  setViewMode: (mode: ViewMode) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.viewMode = mode
    })
  },

  setSortBy: (field: SortOption['field'], direction: 'asc' | 'desc' = 'desc') => {
    set((state: DocumentChatSystemStore) => {
      state.documents.sortBy = { field, label: field.charAt(0).toUpperCase() + field.slice(1) }
      state.documents.sortDirection = direction
    })
  },

  selectDocument: (documentId: string) => {
    set((state: DocumentChatSystemStore) => {
      if (!state.documents.selectedItems.documents.includes(documentId)) {
        state.documents.selectedItems.documents.push(documentId)
      }
    })
  },

  selectFolder: (folderId: string) => {
    set((state: DocumentChatSystemStore) => {
      if (!state.documents.selectedItems.folders.includes(folderId)) {
        state.documents.selectedItems.folders.push(folderId)
      }
    })
  },

  deselectDocument: (documentId: string) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.selectedItems.documents = state.documents.selectedItems.documents.filter(
        (id) => id !== documentId
      )
    })
  },

  deselectFolder: (folderId: string) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.selectedItems.folders = state.documents.selectedItems.folders.filter(
        (id) => id !== folderId
      )
    })
  },

  selectAll: () => {
    const state = get() as DocumentChatSystemStore
    set((state: DocumentChatSystemStore) => {
      state.documents.selectedItems.documents = state.documents.documents.map((d: Document) => d.id)
      state.documents.selectedItems.folders = state.documents.folders.map((f: Folder) => f.id)
    })
  },

  deselectAll: () => {
    set((state: DocumentChatSystemStore) => {
      state.documents.selectedItems.documents = []
      state.documents.selectedItems.folders = []
    })
  },

  // Filters
  setFilters: (filters: Partial<DocumentFilters>) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.filters = { ...state.documents.filters, ...filters }
    })
  },

  clearFilters: () => {
    set((state: DocumentChatSystemStore) => {
      state.documents.filters = {
        types: [],
        tags: [],
      }
    })
  },

  // Bulk operations
  bulkDeleteDocuments: async (documentIds: string[]): Promise<TreeOperationResult<void>> => {
    const state = get() as DocumentChatSystemStore

    try {
      // Update state
      set((state: DocumentChatSystemStore) => {
        state.documents.documents = state.documents.documents.filter(
          (d) => !documentIds.includes(d.id)
        )
      })

      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'BULK_DELETE_DOCUMENTS',
        entityType: 'document',
        entityId: 'bulk',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { deletedDocumentIds: documentIds },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(undefined, 'BULK_DELETE_DOCUMENTS')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return state.documents._createErrorResult<void>(errorMessage, 'BULK_DELETE_DOCUMENTS')
    }
  },

  bulkMoveDocuments: async (documentIds: string[], folderId: string | null): Promise<TreeOperationResult<void>> => {
    const state = get() as DocumentChatSystemStore

    try {
      // Update state
      set((state: DocumentChatSystemStore) => {
        state.documents.documents = state.documents.documents.map((doc) =>
          documentIds.includes(doc.id)
            ? {
                ...doc,
                folderId,
                lastModified: new Date().toISOString(),
              }
            : doc
        )
      })

      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'BULK_MOVE_DOCUMENTS',
        entityType: 'document',
        entityId: 'bulk',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { movedDocumentIds: documentIds, newFolderId: folderId },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(undefined, 'BULK_MOVE_DOCUMENTS')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return state.documents._createErrorResult<void>(errorMessage, 'BULK_MOVE_DOCUMENTS')
    }
  },

  bulkDeleteFolders: async (folderIds: string[]): Promise<TreeOperationResult<void>> => {
    const state = get() as DocumentChatSystemStore

    try {
      // Check for protected folders
      const protectedFolders = state.documents.folders.filter(
        (f) => folderIds.includes(f.id) && f.isProtected
      )
      if (protectedFolders.length > 0) {
        return state.documents._createErrorResult<void>('Cannot delete protected system folders', 'BULK_DELETE_FOLDERS')
      }

      // Update state
      set((state: DocumentChatSystemStore) => {
        state.documents.folders = state.documents.folders.filter(
          (f) => !folderIds.includes(f.id)
        )
      })

      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'BULK_DELETE_FOLDERS',
        entityType: 'folder',
        entityId: 'bulk',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { deletedFolderIds: folderIds },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(undefined, 'BULK_DELETE_FOLDERS')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return state.documents._createErrorResult<void>(errorMessage, 'BULK_DELETE_FOLDERS')
    }
  },

  bulkMoveFolders: async (folderIds: string[], parentId: string | null): Promise<TreeOperationResult<void>> => {
    const state = get() as DocumentChatSystemStore

    try {
      // Update state
      set((state: DocumentChatSystemStore) => {
        state.documents.folders = state.documents.folders.map((folder) =>
          folderIds.includes(folder.id)
            ? {
                ...folder,
                parentId,
                updatedAt: new Date().toISOString(),
              }
            : folder
        )
      })

      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'BULK_MOVE_FOLDERS',
        entityType: 'folder',
        entityId: 'bulk',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: { movedFolderIds: folderIds, newParentId: parentId },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(undefined, 'BULK_MOVE_FOLDERS')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return state.documents._createErrorResult<void>(errorMessage, 'BULK_MOVE_FOLDERS')
    }
  },

  // API methods for loading data
  loadFolders: async (): Promise<TreeOperationResult<Folder[]>> => {
    const state = get() as DocumentChatSystemStore

    console.log('📁📥 [DOCUMENTS STORE] loadFolders called:', {
      action: 'LOAD_FOLDERS',
      timestamp: new Date().toISOString()
    })

    try {
      // Set loading state
      set((state: DocumentChatSystemStore) => {
        state.documents.loading = true
        state.documents.error = null
      })

      // Call the API to get all folders
      console.log('🌐 [DOCUMENTS STORE] Calling folders GET API')
      const response = await fetch('/api/v1/folders', {
        method: 'GET',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`API Error ${response.status}: ${errorData.error || response.statusText}`)
      }

      const apiResult = await response.json()
      console.log('✅ [DOCUMENTS STORE] API folders load successful:', {
        success: apiResult.success,
        foldersCount: apiResult.folders?.length || 0
      })

      if (!apiResult.success || !Array.isArray(apiResult.folders)) {
        throw new Error(apiResult.error || 'Failed to load folders - invalid API response')
      }

      // Transform API response to local format if needed
      const folders: Folder[] = apiResult.folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description || '',
        parentId: folder.parentId,
        color: folder.color || '#6b7280',
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        isProtected: folder.isProtected || false,
        organizationId: folder.organizationId,
        icon: folder.icon,
        level: folder.level,
        folderType: folder.folderType,
        isSystemFolder: folder.isSystemFolder,
        isPublic: folder.isPublic,
        path: folder.path
      }))

      // Update local state
      set((state: DocumentChatSystemStore) => {
        state.documents.folders = folders
        state.documents.loading = false
        state.documents.error = null
      })

      console.log('✅ [DOCUMENTS STORE] loadFolders success - folders loaded:', {
        totalFolders: folders.length,
        rootFolders: folders.filter(f => f.parentId === null).length,
        systemFolders: folders.filter(f => f.isSystemFolder).length
      })

      // Log operation
      const log: TreeOperationLog = {
        id: `log_${Date.now()}`,
        operation: 'LOAD_FOLDERS',
        entityType: 'folder',
        entityId: 'bulk',
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          loadedCount: folders.length,
          apiResult: { success: apiResult.success, count: apiResult.count }
        },
      }
      state.documents._logOperation(log)

      return state.documents._createSuccessResult(folders, 'LOAD_FOLDERS')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('❌ [DOCUMENTS STORE] loadFolders error:', {
        error: errorMessage,
        timestamp: new Date().toISOString()
      })

      set((state: DocumentChatSystemStore) => {
        state.documents.loading = false
        state.documents.error = errorMessage
      })

      return state.documents._createErrorResult<Folder[]>(errorMessage, 'LOAD_FOLDERS')
    }
  },

  // Store management
  initializeStore: (data: { folders: Folder[]; documents: Document[] }) => {
    set((state: DocumentChatSystemStore) => {
      state.documents.folders = data.folders
      state.documents.documents = data.documents
      state.documents.loading = false
      state.documents.error = null
    })
  },

  resetStore: () => {
    set((state: DocumentChatSystemStore) => {
      state.documents.folders = []
      state.documents.documents = []
      state.documents.currentFolderId = null
      state.documents.selectedItems = { documents: [], folders: [] }
      state.documents.loading = false
      state.documents.error = null
      state.documents.operationLogs = []
      state.documents.searchQuery = ''
      state.documents.searchResults = []
    })
  },

  exportState: () => {
    const state = get() as DocumentChatSystemStore
    return state.documents
  },

  importState: (state: Partial<DocumentsState>) => {
    set((documentChatState: DocumentChatSystemStore) => {
      Object.assign(documentChatState.documents, state)
    })
  },
})

// =============================================
// STORE IMPLEMENTATION
// =============================================

export const useDocumentChatSystemStore = create<DocumentChatSystemStore>()(
  subscribeWithSelector(
    devtools(
      immer((set, get) => {
        const documentsSlice = createDocumentsSlice(set, get)

        return {
          // ==========================================
          // DOCUMENTS SLICE - FULLY IMPLEMENTED
          // ==========================================
          documents: documentsSlice,

          // Backward compatibility aliases
          tree: documentsSlice,
          state: documentsSlice,

          // Backward compatibility methods (delegated to documents slice)
          loadFolders: async () => {
            return documentsSlice.loadFolders()
          },

          createFolder: async (name, parentId, description, color) => {
            // DEPRECATED: This method is for backward compatibility only
            // Use documentsSlice.createFolder with proper organizationId
            console.warn('createFolder: Using deprecated backward compatibility method. Please update to use documentsSlice.createFolder directly with organizationId.');
            throw new Error('createFolder backward compatibility method requires organizationId parameter. Use documentsSlice.createFolder instead.');
          },

          updateFolder: async (folderId, updates) => {
            return documentsSlice.updateFolder(folderId, updates)
          },

          deleteFolder: async (folderId) => {
            return documentsSlice.deleteFolder(folderId)
          },

          moveFolder: async (folderId, newParentId) => {
            return documentsSlice.moveFolder(folderId, newParentId)
          },

          updateDocument: async (documentId, updates) => {
            return documentsSlice.updateDocument(documentId, updates)
          },

          moveDocument: async (documentId, newFolderId) => {
            return documentsSlice.moveDocument(documentId, newFolderId)
          },

          deleteDocument: async (documentId) => {
            return documentsSlice.deleteDocument(documentId)
          },

          createDocument: async (file, folderId, organizationId) => {
            return documentsSlice.createDocument({
              file,
              folderId,
              organizationId,
            })
          },


          navigateToFolder: (folderId) => {
            documentsSlice.navigateToFolder(folderId)
          },

          getFolderChildren: (parentId) => {
            return documentsSlice.getFolderChildren(parentId)
          },

          getFolderPath: (folderId) => {
            return documentsSlice.getFolderPath(folderId)
          },

          getFolderDocuments: (folderId) => {
            return documentsSlice.getFolderDocuments(folderId)
          },

          findFolder: (id) => {
            return documentsSlice.findFolder(id)
          },

          findDocument: (id) => {
            return documentsSlice.findDocument(id)
          },

          searchDocuments: (query) => {
            return documentsSlice.searchDocuments(query)
          },

          setSearchQuery: (query) => {
            documentsSlice.setSearchQuery(query)
          },

          setSearchResults: (results) => {
            documentsSlice.setSearchResults(results)
          },

          clearSearch: () => {
            documentsSlice.clearSearch()
          },

          clearError: () => {
            documentsSlice.clearError()
          },

          // ==========================================
          // OTHER SLICES - PLACEHOLDER IMPLEMENTATIONS
          // ==========================================
          user: {
            currentUser: null,
            isAuthenticated: false,
            loading: false,
            error: null,
            login: async () => {
              // TODO: Implement
            },
            logout: () => {
              // TODO: Implement
            },
            updateUser: async () => {
              // TODO: Implement
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.user.error = null
              })
            },
          },

          organization: {
            current: null,
            loading: false,
            error: null,
            setOrganization: (org) => {
              set((state: DocumentChatSystemStore) => {
                state.organization.current = org
              })
            },
            updateOrganization: async () => {
              // TODO: Implement
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.organization.error = null
              })
            },
          },

          profile: {
            current: null,
            loading: false,
            error: null,
            updateProfile: async () => {
              // TODO: Implement
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.profile.error = null
              })
            },
          },

          opportunities: {
            items: [],
            loading: false,
            error: null,
            filters: {},
            searchQuery: '',
            fetchOpportunities: async () => {
              // TODO: Implement
            },
            searchOpportunities: (query) => {
              set((state: DocumentChatSystemStore) => {
                state.opportunities.searchQuery = query
              })
            },
            setFilters: (filters) => {
              set((state: DocumentChatSystemStore) => {
                state.opportunities.filters = filters
              })
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.opportunities.error = null
              })
            },
          },

          billing: {
            subscription: null,
            loading: false,
            error: null,
            fetchSubscription: async () => {
              // TODO: Implement
            },
            updateSubscription: async () => {
              // TODO: Implement
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.billing.error = null
              })
            },
          },

          notifications: {
            items: [],
            unreadCount: 0,
            loading: false,
            error: null,
            fetchNotifications: async () => {
              // TODO: Implement
            },
            markAsRead: async () => {
              // TODO: Implement
            },
            markAllAsRead: async () => {
              // TODO: Implement
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.notifications.error = null
              })
            },
            showNotification: (options) => {
              // Create a temporary in-memory notification for UI display
              const notification = {
                id: `temp-${Date.now()}`,
                title: options.title,
                message: options.message,
                type: options.type || 'info',
                priority: options.priority || 'MEDIUM',
                createdAt: new Date(),
                isRead: false,
              }

              set((state: DocumentChatSystemStore) => {
                state.notifications.items = [notification, ...state.notifications.items]
                if (!notification.isRead) {
                  state.notifications.unreadCount = state.notifications.unreadCount + 1
                }
              })

              // Auto-dismiss after 5 seconds for success messages
              if (options.type === 'success') {
                setTimeout(() => {
                  set((state: DocumentChatSystemStore) => {
                    state.notifications.items = state.notifications.items.filter(
                      item => item.id !== notification.id
                    )
                  })
                }, 5000)
              }
            },
          },

          settings: {
            theme: 'system',
            loading: false,
            error: null,
            updateTheme: (theme) => {
              set((state: DocumentChatSystemStore) => {
                state.settings.theme = theme
              })
            },
            updateSettings: async () => {
              // TODO: Implement
            },
            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.settings.error = null
              })
            },
          },

          // AI slice implementation
          ai: {
            models: [],
            selectedModel: null,
            loading: false,
            error: null,
            search: {
              query: '',
              selectedTier: 'all',
              selectedCapabilities: [],
              filteredModels: [],
              searchIndex: new Map(),
              isSearching: false,
              debounceTimer: null
            },
            modelPerformance: {},
            realTimePricing: {},
            providerStatus: {},
            currentUsage: {
              tokensUsed: 0,
              requestsCount: 0,
              totalCost: 0,
              resetAt: new Date().toISOString()
            },
            features: {
              openRouterEnabled: true,
              costOptimization: true,
              realTimeMetrics: true,
              advancedSettings: false
            },

            pdfEngine: 'pdf-text',

            setModels: (models) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.models = models
                console.log('🤖 AI Store: Models updated:', models.length)
              })
            },

            setSelectedModel: (modelId) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.selectedModel = modelId
                console.log('🤖 AI Store: Selected model:', modelId)
              })
            },

            updateModelPerformance: (modelId, performance) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.modelPerformance[modelId] = {
                  ...state.ai.modelPerformance[modelId],
                  ...performance,
                  lastUpdated: new Date().toISOString()
                }
                console.log('🤖 AI Store: Performance updated for:', modelId)
              })
            },

            updateRealTimePricing: (modelId, pricing) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.realTimePricing[modelId] = {
                  ...pricing,
                  lastUpdated: new Date().toISOString()
                }
                console.log('🤖 AI Store: Pricing updated for:', modelId)
              })
            },

            updateProviderStatus: (providerId, status) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.providerStatus[providerId] = {
                  ...status,
                  lastChecked: new Date().toISOString()
                }
                console.log('🤖 AI Store: Provider status updated:', providerId, status)
              })
            },

            trackUsage: (usage) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.currentUsage.tokensUsed += usage.tokens
                state.ai.currentUsage.requestsCount += 1
                state.ai.currentUsage.totalCost += usage.cost
                console.log('🤖 AI Store: Usage tracked:', usage)
              })
            },

            resetUsage: () => {
              set((state: DocumentChatSystemStore) => {
                state.ai.currentUsage = {
                  tokensUsed: 0,
                  requestsCount: 0,
                  totalCost: 0,
                  resetAt: new Date().toISOString()
                }
                console.log('🤖 AI Store: Usage reset')
              })
            },

            toggleFeature: (feature, enabled) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.features[feature] = enabled
                console.log('🤖 AI Store: Feature toggled:', feature, enabled)
              })
            },

            setPdfEngine: (engine) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.pdfEngine = engine
                console.log('🤖 AI Store: PDF engine set:', engine)
              })
            },

            refreshModels: async () => {
              set((state: DocumentChatSystemStore) => {
                state.ai.loading = true
                state.ai.error = null
              })

              try {
                console.log('🚀 Fetching models from all providers in parallel...')

                // Use the new parallel loading endpoint for better performance
                const response = await fetch('/api/v1/ai/models/all', {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  credentials: 'include', // Include auth cookies
                });

                if (!response.ok) {
                  throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`📊 Loaded ${data.totalModels} models in ${data.loadingTime}ms`);
                console.log('🔍 Raw API Response:', data);

                // Combine all models from all providers
                const allModels: ModelInfo[] = [];

                // Transform OpenRouter models
                if (data.openrouter && Array.isArray(data.openrouter)) {
                  const openrouterModels = data.openrouter.map((model: any) => ({
                    name: model.id,
                    provider: 'openrouter',
                    displayName: model.name,
                    description: model.description,
                    maxTokens: model.maxTokens,
                    costPer1KTokens: {
                      prompt: model.costPerPromptToken * 1000,
                      completion: model.costPerCompletionToken * 1000
                    },
                    averageLatency: null,
                    qualityScore: null,
                    tier: model.tier,
                    features: model.features
                  }));
                  allModels.push(...openrouterModels);
                  console.log(`🔗 OpenRouter: Loaded ${openrouterModels.length} text generation models`);
                }

                // Transform ImageRouter models (when available)
                if (data.imagerouter && Array.isArray(data.imagerouter)) {
                  console.log(`🎨 ImageRouter: Raw models data:`, data.imagerouter);

                  const imagerouterModels = data.imagerouter.map((model: any) => ({
                    name: model.id || model.name,
                    provider: 'imagerouter',
                    displayName: model.displayName || model.name,
                    description: model.description,
                    maxTokens: 0, // Not applicable for media generation
                    costPer1KTokens: {
                      prompt: model.costPer1KTokens?.prompt || model.costPerPromptToken || 0,
                      completion: 0
                    },
                    averageLatency: model.averageLatency,
                    qualityScore: model.qualityScore,
                    tier: model.tier,
                    features: model.features || ['media-generation']
                  }));
                  allModels.push(...imagerouterModels);
                  console.log(`🎨 ImageRouter: Loaded ${imagerouterModels.length} media generation models`);
                  console.log('🎨 ImageRouter: Transformed models:', imagerouterModels);
                } else {
                  console.warn('⚠️ ImageRouter: No models data received or not array:', data.imagerouter);
                }

                set((state: DocumentChatSystemStore) => {
                  state.ai.models = allModels
                  state.ai.search.filteredModels = allModels
                  if (!state.ai.selectedModel && allModels.length > 0) {
                    // Prioritize text generation models (non-imagerouter) as default
                    const textModel = allModels.find(m => m.provider !== 'imagerouter' && !m.features?.includes('media-generation'))
                    state.ai.selectedModel = textModel ? textModel.name : allModels[0].name
                  }
                })

                // Rebuild search index with new models
                get().ai.buildSearchIndex()

                // Count models by provider for detailed logging
                const openrouterCount = allModels.filter(m => m.provider === 'openrouter').length;
                const imagerouterCount = allModels.filter(m => m.provider === 'imagerouter').length;

                console.log(`🤖 AI Store: Models refreshed with ${allModels.length} models from all providers (${data.loadingTime}ms)`);
                console.log(`📊 Provider breakdown: OpenRouter: ${openrouterCount}, ImageRouter: ${imagerouterCount}`);
                console.log(`🔍 AI Search: Built search index with ${get().ai.search.searchIndex.size} terms for ${allModels.length} models`);
              } catch (error) {
                // Report error to registry
                try {
                  const { reportError } = await import('@/lib/errors/error-registry')
                  const errorMessage = error instanceof Error ? error.message :
                                     typeof error === 'string' ? error :
                                     'Failed to fetch models (unknown error)'
                  const errorToReport = error instanceof Error ? error : new Error(errorMessage)

                  reportError(errorToReport, {
                    source: 'api',
                    feature: 'ai-models',
                    url: '/api/v1/ai/providers/openrouter/models',
                    metadata: {
                      operation: 'refreshModels',
                      timestamp: new Date().toISOString(),
                      originalError: typeof error === 'object' ? JSON.stringify(error) : String(error)
                    }
                  })
                } catch (reportError) {
                  console.warn('Failed to report error:', reportError)
                }

                console.warn('Failed to load OpenRouter models, using fallback:', error);

                // Update store with error state
                set((state: DocumentChatSystemStore) => {
                  state.ai.error = 'Unable to load AI models. Using fallback models.'
                })

                // Fallback to minimal set on error
                const fallbackModels: ModelInfo[] = [
                  {
                    name: 'openai/gpt-4o-mini',
                    provider: 'openrouter',
                    displayName: 'GPT-4o Mini',
                    description: 'Fast and efficient model via OpenRouter',
                    maxTokens: 128000,
                    costPer1KTokens: { prompt: 0.15, completion: 0.6 },
                    averageLatency: null,
                    qualityScore: null,
                    tier: 'balanced',
                    features: ['chat', 'completion', 'reasoning']
                  }
                ];

                set((state: DocumentChatSystemStore) => {
                  state.ai.models = fallbackModels
                  state.ai.search.filteredModels = fallbackModels
                  if (!state.ai.selectedModel) {
                    state.ai.selectedModel = fallbackModels[0].name
                  }
                  state.ai.error = error instanceof Error ? error.message : 'Failed to refresh models'
                })

                // Rebuild search index with fallback models
                get().ai.buildSearchIndex()
              } finally {
                set((state: DocumentChatSystemStore) => {
                  state.ai.loading = false
                })
              }
            },

            forceRefreshModels: async () => {
              console.log('🔄 Force refreshing models from all providers...');

              set((state: DocumentChatSystemStore) => {
                state.ai.loading = true
                state.ai.error = null
              })

              try {
                // Use the parallel force refresh endpoint
                const response = await fetch('/api/v1/ai/models/all', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                });

                if (!response.ok) {
                  throw new Error(`Failed to force refresh models: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                console.log(`🔄 Force refresh completed: ${result.totalModels} models in ${result.loadingTime}ms`);

                // After force refresh, load the new models
                return get().ai.refreshModels()

              } catch (error) {
                console.error('Failed to force refresh models:', error);
                set((state: DocumentChatSystemStore) => {
                  state.ai.error = error instanceof Error ? error.message : 'Failed to force refresh models',
                  state.ai.loading = false
                })
                throw error
              }
            },

            setLoading: (loading) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.loading = loading
              })
            },

            setError: (error) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.error = error
              })
            },

            clearError: () => {
              set((state: DocumentChatSystemStore) => {
                state.ai.error = null
              })
            },

            // Search functionality
            setSearchQuery: (query: string) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.search.query = query
              })
              get().ai.performSearch()
            },

            setSelectedTier: (tier: 'all' | 'fast' | 'balanced' | 'powerful') => {
              set((state: DocumentChatSystemStore) => {
                state.ai.search.selectedTier = tier
              })
              get().ai.performSearch(true) // Immediate search for filters
            },

            setSelectedCapabilities: (capabilities: string[]) => {
              set((state: DocumentChatSystemStore) => {
                state.ai.search.selectedCapabilities = capabilities
              })
              get().ai.performSearch(true) // Immediate search for filters
            },

            toggleCapability: (capability: string) => {
              const currentCapabilities = get().ai.search.selectedCapabilities
              const newCapabilities = currentCapabilities.includes(capability)
                ? currentCapabilities.filter(c => c !== capability)
                : [...currentCapabilities, capability]

              set((state: DocumentChatSystemStore) => {
                state.ai.search.selectedCapabilities = newCapabilities
              })
              get().ai.performSearch(true) // Immediate search for filters
            },

            performSearch: (immediate = false) => {
              const state = get()
              const { query, selectedTier, selectedCapabilities, debounceTimer } = state.ai.search

              // Clear existing debounce timer
              if (debounceTimer) {
                clearTimeout(debounceTimer)
              }

              const executeSearch = () => {
                set((state: DocumentChatSystemStore) => {
                  state.ai.search.isSearching = true
                })

                try {
                  const models = get().ai.models
                  const normalizedQuery = query.toLowerCase().trim()

                  let filteredModels = models

                  // Apply search query filter
                  if (normalizedQuery) {
                    const searchIndex = get().ai.search.searchIndex

                    // Use search index for performance
                    const indexedResults = searchIndex.get(normalizedQuery) || []

                    if (indexedResults.length > 0) {
                      filteredModels = indexedResults
                    } else {
                      // Fallback to regular search if not in index
                      filteredModels = models.filter(model =>
                        model.displayName.toLowerCase().includes(normalizedQuery) ||
                        model.description.toLowerCase().includes(normalizedQuery) ||
                        model.name.toLowerCase().includes(normalizedQuery) ||
                        model.features.some(f => f.toLowerCase().includes(normalizedQuery))
                      )
                    }
                  }

                  // Apply tier filter
                  if (selectedTier !== 'all') {
                    filteredModels = filteredModels.filter(model => model.tier === selectedTier)
                  }

                  // Apply capabilities filter
                  if (selectedCapabilities.length > 0) {
                    filteredModels = filteredModels.filter(model =>
                      selectedCapabilities.every(cap => model.features.includes(cap))
                    )
                  }

                  set((state: DocumentChatSystemStore) => {
                    state.ai.search.filteredModels = filteredModels
                    state.ai.search.isSearching = false
                    state.ai.search.debounceTimer = null
                  })

                  console.log('🔍 AI Search: Filtered', filteredModels.length, 'models from', models.length)
                } catch (error) {
                  console.error('Search error:', error)
                  set((state: DocumentChatSystemStore) => {
                    state.ai.search.isSearching = false
                    state.ai.search.debounceTimer = null
                  })
                }
              }

              if (immediate) {
                executeSearch()
              } else {
                // Debounce search for text input (300ms delay)
                const timer = setTimeout(executeSearch, 300)
                set((state: DocumentChatSystemStore) => {
                  state.ai.search.debounceTimer = timer
                })
              }
            },

            clearSearch: () => {
              const { debounceTimer } = get().ai.search
              if (debounceTimer) {
                clearTimeout(debounceTimer)
              }

              set((state: DocumentChatSystemStore) => {
                state.ai.search.query = ''
                state.ai.search.selectedTier = 'all'
                state.ai.search.selectedCapabilities = []
                state.ai.search.filteredModels = state.ai.models
                state.ai.search.isSearching = false
                state.ai.search.debounceTimer = null
              })
            },

            buildSearchIndex: () => {
              const models = get().ai.models
              const searchIndex = new Map<string, ModelInfo[]>()

              // Build search index for common search terms
              models.forEach(model => {
                const searchableText = [
                  model.displayName.toLowerCase(),
                  model.description.toLowerCase(),
                  model.name.toLowerCase(),
                  ...model.features.map(f => f.toLowerCase())
                ].join(' ')

                // Extract individual words and 2-3 character combinations
                const words = searchableText.split(/\s+/)
                const terms = new Set<string>()

                words.forEach(word => {
                  if (word.length >= 2) {
                    terms.add(word)
                    // Add partial matches for longer words
                    for (let i = 2; i <= word.length; i++) {
                      terms.add(word.substring(0, i))
                    }
                  }
                })

                // Add to search index
                terms.forEach(term => {
                  if (!searchIndex.has(term)) {
                    searchIndex.set(term, [])
                  }
                  searchIndex.get(term)!.push(model)
                })
              })

              set((state: DocumentChatSystemStore) => {
                state.ai.search.searchIndex = searchIndex
              })

              console.log('🔍 AI Search: Built search index with', searchIndex.size, 'terms for', models.length, 'models')
            }
          },

          // ==========================================
          // STORE MANAGEMENT
          // ==========================================
          _setState: (updates) => {
            set((state) => {
              Object.assign(state, updates)
            })
          },

          _initializeStore: (initialData) => {
            console.log('🚀 [STORE INIT] Store Initialization Started:', {
              hasFolders: !!initialData.folders,
              hasDocuments: !!initialData.documents,
              foldersCount: initialData.folders?.length || 0,
              documentsCount: initialData.documents?.length || 0,
              timestamp: new Date().toISOString()
            })

            set((state) => {
              // Initialize documents data directly
              if (initialData.folders && initialData.documents) {
                console.log('📁 [STORE INIT] Initializing documents store with data:', {
                  folders: initialData.folders.length,
                  documents: initialData.documents.length,
                  folderDetails: initialData.folders.map((f: Folder) => ({ id: f.id, name: f.name, parentId: f.parentId })),
                  documentDetails: initialData.documents.map((d: Document) => ({ id: d.id, name: d.name, folderId: d.folderId, type: d.documentType }))
                })

                state.documents.folders = initialData.folders
                state.documents.documents = initialData.documents
                state.documents.loading = false
                state.documents.error = null

                console.log('✅ [STORE INIT] Documents store initialized successfully - Final state:', {
                  totalFolders: state.documents.folders.length,
                  totalDocuments: state.documents.documents.length,
                  currentFolderId: state.documents.currentFolderId,
                  rootFolders: state.documents.folders.filter(f => f.parentId === null).length,
                  rootDocuments: state.documents.documents.filter(d => d.folderId === null).length
                })
              }

              // Initialize user data
              if (initialData.user) {
                console.log('👤 [STORE INIT] Initializing user data:', { userId: initialData.user.id })
                state.user.currentUser = initialData.user
                state.user.isAuthenticated = true
              }

              // Initialize organization data
              if (initialData.organization) {
                console.log('🏢 [STORE INIT] Initializing organization data:', { orgId: initialData.organization.id })
                state.organization.current = initialData.organization
              }
            })

            // Log complete store state after initialization
            const finalState = get()
            console.log('🎯 [STORE INIT] Complete Store State After Initialization:', {
              documents: {
                foldersCount: finalState.documents.folders.length,
                documentsCount: finalState.documents.documents.length,
                currentFolderId: finalState.documents.currentFolderId,
                loading: finalState.documents.loading,
                error: finalState.documents.error
              },
              user: {
                authenticated: finalState.user.isAuthenticated,
                hasUser: !!finalState.user.currentUser
              },
              organization: {
                hasOrg: !!finalState.organization.current
              },
              timestamp: new Date().toISOString()
            })
          },

          _resetStore: () => {
            set((state) => {
              // Reset documents slice
              state.documents.folders = []
              state.documents.documents = []
              state.documents.currentFolderId = null
              state.documents.selectedItems = { documents: [], folders: [] }
              state.documents.loading = false
              state.documents.error = null
              state.documents.operationLogs = []
              state.documents.searchQuery = ''
              state.documents.searchResults = []

              // Reset other slices
              state.user = {
                currentUser: null,
                isAuthenticated: false,
                loading: false,
                error: null,
                login: state.user.login,
                logout: state.user.logout,
                updateUser: state.user.updateUser,
                clearError: state.user.clearError,
              }
            })
          },

          _getStoreSnapshot: () => {
            const state = get()
            return {
              documents: state.documents,
              user: state.user,
              organization: state.organization,
              timestamp: new Date().toISOString(),
            }
          },
        }
      }),
      {
        name: 'document-chat-store-devtools',
        enabled: process.env.NODE_ENV === 'development',
      }
    )
  )
)

// =============================================
// HOOK COMPATIBILITY LAYER
// =============================================

// Backward compatible hooks - exact same API as TreeProvider
export const useTree = () => {
  const documents = useDocumentChatSystemStore((state) => state.documents)
  const createDocument = useDocumentChatSystemStore((state) => state.createDocument)
  const getFolderPath = useDocumentChatSystemStore((state) => state.getFolderPath)
  const findFolder = useDocumentChatSystemStore((state) => state.findFolder)

  // Use useEffect to log complete state changes without triggering during render
  React.useEffect(() => {
    console.log('🌳 [useTree HOOK] Documents store state accessed:', {
      action: 'USE_TREE_HOOK_CALLED',
      state: {
        foldersCount: documents.folders.length,
        documentsCount: documents.documents.length,
        currentFolderId: documents.currentFolderId,
        loading: documents.loading,
        error: documents.error,
        searchQuery: documents.searchQuery,
        searchResultsCount: documents.searchResults.length,
        viewMode: documents.viewMode,
        sortBy: documents.sortBy,
        sortDirection: documents.sortDirection,
        selectedItems: {
          documentsSelected: documents.selectedItems.documents.length,
          foldersSelected: documents.selectedItems.folders.length,
          selectedDocumentIds: documents.selectedItems.documents,
          selectedFolderIds: documents.selectedItems.folders
        },
        operationLogsCount: documents.operationLogs.length,
        filters: documents.filters
      },
      completeData: {
        folders: documents.folders.map((f: Folder) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          color: f.color,
          createdAt: f.createdAt,
          isProtected: f.isProtected
        })),
        documents: documents.documents.map((d: Document) => ({
          id: d.id,
          name: d.name,
          folderId: d.folderId,
          type: d.documentType,
          size: d.size,
          uploadDate: d.uploadDate,
          tags: d.tags?.length || 0
        })),
        searchResults: documents.searchResults.map((d: Document) => ({
          id: d.id,
          name: d.name,
          folderId: d.folderId
        })),
        recentOperations: documents.operationLogs.slice(-3).map(log => ({
          operation: log.operation,
          entityType: log.entityType,
          entityId: log.entityId,
          success: log.success,
          timestamp: log.timestamp
        }))
      },
      timestamp: new Date().toISOString()
    })
  }, [
    documents.folders.length,
    documents.documents.length,
    documents.currentFolderId,
    documents.loading,
    documents.error,
    documents.searchQuery,
    documents.searchResults.length,
    documents.selectedItems.documents.length,
    documents.selectedItems.folders.length,
    documents.viewMode,
    documents.sortBy.field,
    documents.sortDirection,
    documents.operationLogs.length
  ])

  return {
    state: documents, // Use reactive selector for documents state
    createDocument,
    getFolderPath,
    findFolder,
  }
}

export const useTreeNavigation = () => {
  const currentFolderId = useDocumentChatSystemStore(
    (state) => state.documents.currentFolderId
  )
  const findFolder = useDocumentChatSystemStore((state) => state.findFolder)
  const getFolderPath = useDocumentChatSystemStore((state) => state.getFolderPath)
  const navigateToFolder = useDocumentChatSystemStore((state) => state.navigateToFolder)

  return {
    currentFolderId, // Use reactive selector
    currentFolder: currentFolderId ? findFolder(currentFolderId) : null,
    folderPath: currentFolderId ? getFolderPath(currentFolderId) : [],
    navigateToFolder,
    navigateToRoot: () => navigateToFolder(null),
  }
}

export const useFolderOperations = () => {
  const loadFolders = useDocumentChatSystemStore((state) => state.loadFolders)
  const createFolder = useDocumentChatSystemStore((state) => state.createFolder)
  const updateFolder = useDocumentChatSystemStore((state) => state.updateFolder)
  const deleteFolder = useDocumentChatSystemStore((state) => state.deleteFolder)
  const moveFolder = useDocumentChatSystemStore((state) => state.moveFolder)
  const getFolderChildren = useDocumentChatSystemStore((state) => state.getFolderChildren)
  const findFolder = useDocumentChatSystemStore((state) => state.findFolder)

  return {
    loadFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    moveFolder,
    getFolderChildren,
    findFolder,
  }
}

export const useDocumentOperations = () => {
  const updateDocument = useDocumentChatSystemStore((state) => state.updateDocument)
  const moveDocument = useDocumentChatSystemStore((state) => state.moveDocument)
  const deleteDocument = useDocumentChatSystemStore((state) => state.deleteDocument)
  const getFolderDocuments = useDocumentChatSystemStore(
    (state) => state.getFolderDocuments
  )
  const findDocument = useDocumentChatSystemStore((state) => state.findDocument)
  const searchDocuments = useDocumentChatSystemStore((state) => state.searchDocuments)
  const setSearchQuery = useDocumentChatSystemStore((state) => state.setSearchQuery)
  const setSearchResults = useDocumentChatSystemStore((state) => state.setSearchResults)
  const clearSearch = useDocumentChatSystemStore((state) => state.clearSearch)

  return {
    updateDocument,
    moveDocument,
    deleteDocument,
    getFolderDocuments,
    findDocument,
    searchDocuments,
    setSearchQuery,
    setSearchResults,
    clearSearch,
  }
}

// =============================================
// PLACEHOLDER HOOKS - FOR FUTURE IMPLEMENTATION
// =============================================

// These hooks return basic state now, can be enhanced later
export const useUser = () => {
  return useDocumentChatSystemStore((state) => state.user)
}

export const useOrganization = () => {
  return useDocumentChatSystemStore((state) => state.organization)
}

export const useProfile = () => {
  return useDocumentChatSystemStore((state) => state.profile)
}

export const useOpportunities = () => {
  return useDocumentChatSystemStore((state) => state.opportunities)
}

export const useBilling = () => {
  return useDocumentChatSystemStore((state) => state.billing)
}

export const useNotifications = () => {
  return useDocumentChatSystemStore((state) => state.notifications)
}

export const useSettings = () => {
  return useDocumentChatSystemStore((state) => state.settings)
}

export const useAI = () => {
  return useDocumentChatSystemStore((state) => state.ai)
}

export const useAIModels = () => {
  return useDocumentChatSystemStore((state) => state.ai.models)
}

export const useAIFeatures = () => {
  return useDocumentChatSystemStore((state) => state.ai.features)
}

export const useAIUsage = () => {
  return useDocumentChatSystemStore((state) => state.ai.currentUsage)
}

// =============================================
// STORE UTILITIES
// =============================================

// Initialize store function for layout.tsx
export const initializeDocumentChatSystemStore = (initialData: {
  folders?: Folder[]
  documents?: Document[]
  user?: User
  organization?: Organization
}) => {
  const store = useDocumentChatSystemStore.getState()
  store._initializeStore(initialData)
}

// Modern naming alias
export const initializeDocumentChatStore = initializeDocumentChatSystemStore

// Backward compatibility alias
export const initializeTreeStore = (
  folders: Folder[],
  documents: Document[]
) => {
  initializeDocumentChatSystemStore({ folders, documents })
}

// Store reset utility
export const resetDocumentChatSystemStore = () => {
  const store = useDocumentChatSystemStore.getState()
  store._resetStore()
}

// Store snapshot utility
export const getStoreSnapshot = () => {
  const store = useDocumentChatSystemStore.getState()
  return store._getStoreSnapshot()
}

// Selective subscriptions for performance
export const useTreeState = () => {
  return useDocumentChatSystemStore((state) => state.documents)
}

export const useUserState = () => {
  return useDocumentChatSystemStore((state) => state.user)
}

export const useOrganizationState = () => {
  return useDocumentChatSystemStore((state) => state.organization)
}

// =============================================
// TYPE EXPORTS
// =============================================

export type { DocumentChatSystemStore, DocumentsSlice, DocumentsState }

// =============================================
// BACKWARD COMPATIBILITY
// =============================================

// Primary export - modern naming
export const useDocumentChatStore = useDocumentChatSystemStore

// =============================================
// DEVELOPMENT UTILITIES
// =============================================

// Debug helper for development
if (process.env.NODE_ENV === 'development') {
  ;(globalThis as any).__DOCUMENT_CHAT_STORE__ = useDocumentChatSystemStore
}
