'use client'
import { useMounted } from '@/hooks/use-mounted';
import { normalizeError } from '@/lib/errors/normalize-error';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'
import { AppLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useSoundEffects, SoundEffect } from '@/lib/sound-effects'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Search,
  Upload,
  MoreHorizontal,
  Grid3X3,
  List,
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  File,
  X,
  Edit3,
  Move,
  Trash2,
  Download,
  Share,
  Eye,
  HardDrive,
  Calendar,
  FolderPlus,
  Image,
  Video,
  Music,
  Archive,
  Code,
  FileImage,
  FileVideo,
  FileAudio,
  Info,
  Filter,
  SlidersHorizontal,
  Plus,
  Save,
  ExternalLink,
  Loader2,
  Brain
} from 'lucide-react'
import { AuthenticatedImage } from '@/components/ui/authenticated-image'
import { TreeUtils } from '@/lib/utils/tree-utils'
import {
  FolderCard,
  DocumentCard,
  BreadcrumbNavigation,
  DocumentsToolbar,
  DocumentModal,
  CreateDocumentModal,
  getFileTypeBadgeClass,
  formatDateOnly,
  getFileTypeFromMimeType,
  formatFileSize
} from '@/components/documents'
import { DeleteConfirmationModal } from './delete-confirmation-modal'
import { FolderDeleteConfirmationModal } from './folder-delete-confirmation-modal'
import { FolderDeleteInfoModal } from './folder-delete-info-modal'
import { useTree, useTreeNavigation, useFolderOperations, useDocumentOperations, useDocumentChatStore } from '@/stores/document-chat-store'
import { useFileManager, FileManagerProvider } from '@/lib/providers/file-manager-provider'
import { useNotify } from '@/contexts/notification-context'
import type { Document, Folder as FolderData } from '@/types/documents'
import { captureTreeState, logTreeStateChange } from '@/lib/utils/tree-state-utils'
import { TREE_OPERATIONS, UI_CONSTANTS, DOCUMENT_TYPES } from '@/lib/constants'
import { ResponsiveCanvasPreview } from './responsive-canvas-preview'
import { CanvasPreviewWithFetch } from './canvas-preview-with-fetch'
import { triggerDocumentAnalysis, cancelDocumentProcessing, canCancelProcessing } from '@/lib/document-analysis'
import { ProcessingStatus } from '@/components/ui/processing-status'

// No longer needed - using ResponsiveCanvasPreview instead

// Custom hook for search functionality
const useSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const { searchDocuments, setSearchQuery: setStoreSearchQuery, setSearchResults, clearSearch: clearStoreSearch } = useDocumentOperations();

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchDocuments(searchQuery);
  }, [searchQuery, searchDocuments]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(!!query.trim());

    // Update store state separately, not during render
    if (query.trim()) {
      const results = searchDocuments(query);
      setStoreSearchQuery(query);
      setSearchResults(results);
    } else {
      clearStoreSearch();
    }
  }, [searchDocuments, setStoreSearchQuery, setSearchResults, clearStoreSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearching(false);
    clearStoreSearch();
  }, [clearStoreSearch]);

  return {
    searchQuery,
    isSearching,
    searchResults,
    handleSearchChange,
    clearSearch
  };
};

// Main Component
const DocumentsPage = () => {
  // Force remount when auth state changes to avoid hooks order issues
  const { userId, isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()

  // Use a key to force component remount if auth state changes significantly
  const componentKey = `${userId}-${isSignedIn}-${authLoaded}-${userLoaded}`

  return (
    <FileManagerProvider>
      <DocumentsPageContent key={componentKey} />
    </FileManagerProvider>
  )
}

const DocumentsPageContent = () => {
  // Prevent hydration mismatches
  const mounted = useMounted();

  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { userId, isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const notify = useNotify()
  const { fileOps, storageOps, isUploading, uploadProgress } = useFileManager()

  // Tree state and operations - MOVED UP: Must be called before conditional returns
  const { state, createDocument } = useTree()
  const store = useDocumentChatStore()
  const { currentFolderId, currentFolder, folderPath, navigateToFolder: storeNavigateToFolder, navigateToRoot } = useTreeNavigation()
  const { createFolder, updateFolder, deleteFolder, moveFolder, getFolderChildren, findFolder } = useFolderOperations()
  const { updateDocument, moveDocument, deleteDocument, getFolderDocuments, findDocument, searchDocuments } = useDocumentOperations()

  // Store setter functions for data loading
  const setFolders = useDocumentChatStore((state) => state.documents.setFolders)
  const setDocuments = useDocumentChatStore((state) => state.documents.setDocuments)
  const setLoading = useDocumentChatStore((state) => state.documents.setLoading)
  const setError = useDocumentChatStore((state) => state.documents.setError)

  // Sound effects
  const { play: playSound } = useSoundEffects()

  // Search functionality
  const {
    searchQuery,
    isSearching,
    searchResults,
    handleSearchChange,
    clearSearch
  } = useSearch();

  // All useState hooks
  const [viewMode, setViewMode] = useState('grid');
  const [showRecursive, setShowRecursive] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#6b7280');
  const [editingFolder, setEditingFolder] = useState<FolderData | null>(null);
  const [showEditFolderDialog, setShowEditFolderDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showCreateDocumentModal, setShowCreateDocumentModal] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [draggedFileForModal, setDraggedFileForModal] = useState<File | null>(null);
  const [draggedDocument, setDraggedDocument] = useState<Document | null>(null);
  const [draggedFolder, setDraggedFolder] = useState<FolderData | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderData | null>(null);
  const [showFolderDeleteModal, setShowFolderDeleteModal] = useState(false);
  const [showFolderInfoModal, setShowFolderInfoModal] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [isSystemDragOver, setIsSystemDragOver] = useState(false);
  const [dragTargetFolder, setDragTargetFolder] = useState<string | null>(null);
  const [isDragOverSpecificFolder, setIsDragOverSpecificFolder] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editedFileName, setEditedFileName] = useState('');
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [uploadCounter, setUploadCounter] = useState(0);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isBulkActionMode, setIsBulkActionMode] = useState(false);
  const [sortBy, setSortBy] = useState<string>(UI_CONSTANTS.SORT_NEWEST);
  const [filterType, setFilterType] = useState<string>(UI_CONSTANTS.ALL_FILTER);
  const [filterSize, setFilterSize] = useState<string>(UI_CONSTANTS.ALL_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilterPanel, setActiveFilterPanel] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<{ documentId: string; beforeLastModified: string; originalName: string; originalTags: string[]; beforeState: ReturnType<typeof captureTreeState> } | null>(null);
  const [userOrganizationId, setUserOrganizationId] = useState<string | null>(null);

  // useRef hooks
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ALL useCallback hooks - MUST be called before any early returns
  const toggleBulkActionMode = useCallback(() => {
    setIsBulkActionMode(!isBulkActionMode);
    setSelectedDocuments(new Set());
  }, [isBulkActionMode]);

  const toggleDocumentSelection = useCallback((documentId: string) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(documentId)) {
      newSelection.delete(documentId);
    } else {
      newSelection.add(documentId);
    }
    setSelectedDocuments(newSelection);
  }, [selectedDocuments]);

  const clearSelection = useCallback(() => {
    setSelectedDocuments(new Set());
  }, []);

  // Simplified folder navigation - just update state, no routing
  const navigateToFolder = useCallback((folderId: string | null) => {
    console.log('🗂️ [NAVIGATION] SIMPLE NAVIGATION - Updating state only:', {
      from: currentFolderId,
      to: folderId
    })

    // Only update store state - keep it simple
    storeNavigateToFolder(folderId)

    console.log('🗂️ [NAVIGATION] State updated. Current folder should now be:', folderId)
  }, [storeNavigateToFolder, currentFolderId])

  // Set mounted state to prevent hydration mismatches


  // Initialize folder navigation from URL parameters
  useEffect(() => {
    if (mounted && searchParams) {
      const urlFolderId = searchParams.get('folderId')
      if (urlFolderId && urlFolderId !== currentFolderId) {
        console.log('🔄 [URL INIT] Initializing folder from URL:', urlFolderId)
        storeNavigateToFolder(urlFolderId)
      }
    }
  }, [mounted, searchParams, currentFolderId, storeNavigateToFolder])

  // Debug: Log when currentFolderId changes
  useEffect(() => {
    console.log('📁 [FOLDER STATE] currentFolderId changed to:', currentFolderId)
  }, [currentFolderId])

  // Fetch organization ID from profile API if not available from Clerk
  useEffect(() => {
    const fetchUserOrganization = async () => {
      // Fall back to profile API only once
      try {
        const response = await fetch('/api/v1/profile')
        if (response.ok) {
          const profileData = await response.json()
          if (profileData.success && profileData.data?.organizationId) {
            setUserOrganizationId(profileData.data.organizationId)
          }
        }
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error('Failed to fetch user organization:', error)
      }
    }

    // Only fetch if signed in and we don't have an organization ID yet
    // FIXED: Removed problematic dependencies that caused loops
    if (isSignedIn && !userOrganizationId && authLoaded && userLoaded) {
      fetchUserOrganization()
    }
  }, [isSignedIn, userOrganizationId, authLoaded, userLoaded]); // Fixed: removed user dependency

  // Get organization ID from user - will be set up properly with hooks above
  // Simple organization ID resolution without fallback
  const organizationId = userOrganizationId;

  // Load documents and folders data when organization ID becomes available
  const hasLoadedDataRef = useRef(false)

  useEffect(() => {
    const loadDocumentsData = async () => {
      // Prevent multiple loads
      if (!organizationId || hasLoadedDataRef.current) {
        return;
      }

      // Skip if we already have data
      if (state.documents?.length > 0 || state.folders?.length > 0) {
        return;
      }

      console.log('🔄 Loading documents and folders data for org:', organizationId);
      hasLoadedDataRef.current = true; // Mark as loading to prevent duplicates
      setLoading(true);

      try {
        // Fetch folders and documents in parallel
        const [foldersResponse, documentsResponse] = await Promise.all([
          fetch('/api/v1/folders', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          }),
          fetch('/api/v1/documents', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          })
        ]);

        let folders = [];
        let documents = [];

        if (foldersResponse.ok) {
          const foldersData = await foldersResponse.json();
          if (foldersData.success && foldersData.folders) {
            folders = foldersData.folders;
            console.log('✅ Folders loaded:', folders.length);
          } else {
            console.warn('⚠️ Folders data structure:', foldersData);
          }
        } else {
          console.warn('⚠️ Folders API failed:', foldersResponse.status, foldersResponse.statusText);
        }

        if (documentsResponse.ok) {
          const documentsData = await documentsResponse.json();
          if (documentsData.success && documentsData.documents) {
            documents = documentsData.documents;
            console.log('✅ Documents loaded:', documents.length);
          } else {
            console.warn('⚠️ Documents data structure:', documentsData);
          }
        } else {
          console.warn('⚠️ Documents API failed:', documentsResponse.status, documentsResponse.statusText);
        }

        // Initialize the store with the loaded data
        console.log('🔄 Setting store data - folders:', folders.length, 'documents:', documents.length);

        setFolders(folders);
        setDocuments(documents);
        setLoading(false);

        console.log('📊 After loading - store state:', {
          'state.loading': false, // We just set this
          'folders': folders.length,
          'documents': documents.length,
          'organizationId': organizationId
        });

      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error('❌ Failed to load documents data:', error);
        setError(`Failed to load documents: ${error.message}`);
        setLoading(false);
        hasLoadedDataRef.current = false; // Reset on error so it can retry
      }
    };

    loadDocumentsData();
  }, [organizationId]); // Only depend on organizationId

  // For debugging: Log when documents are loaded
  React.useEffect(() => {
    if ((state.documents || []).length > 0) {
      const imageCount = (state.documents || []).filter(d => d.mimeType?.startsWith('image/')).length;
      console.log(`📄 Documents loaded: ${(state.documents || []).length} total, ${imageCount} images`);
    }
  }, [(state.documents || []).length])

  // Debug: Monitor store state changes
  useEffect(() => {
    console.log('📊 Store state changed:', {
      foldersCount: state.folders.length,
      documentsCount: (state.documents || []).length,
      currentFolderId: state.currentFolderId,
      loading: state.loading,
      error: state.error,
      timestamp: new Date().toISOString()
    })
  }, [state.folders.length, (state.documents || []).length, state.currentFolderId, state.loading, state.error])

  // Debug: Test functions directly
  useEffect(() => {
    if (state.folders.length > 0) {
      console.log('🧪 Testing functions directly:', {
        'getFolderChildren(null)': getFolderChildren(null),
        'getFolderDocuments(null)': getFolderDocuments(null),
        'state.folders sample': state.folders.slice(0, 2),
        'state.documents sample': (state.documents || []).slice(0, 2)
      });
    }
  }, [state.folders.length, (state.documents || []).length, getFolderChildren, getFolderDocuments])

  console.log('🏢 Organization ID Debug:', {
    userId,
    isSignedIn,
    authLoaded,
    userLoaded,
    user: !!user,
    memberships: user?.organizationMemberships?.length || 0,
    orgId: organizationId,
    userMetadata: user?.publicMetadata
  })

  // Skip early returns to avoid hooks order issues - render loading states in JSX instead
  const isLoading = !authLoaded || !userLoaded
  const isNotSignedIn = !isSignedIn
  const isMissingUser = !user
  const isOrgIdMissing = !organizationId

  // Add timeout for auth loading - if it takes too long, proceed anyway if we have data
  const [authTimeout, setAuthTimeout] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthTimeout(true);
    }, 3000); // 3 second timeout

    if (authLoaded && userLoaded) {
      clearTimeout(timer);
    }

    return () => clearTimeout(timer);
  }, [authLoaded, userLoaded]);

  // If we have data available or auth has timed out, bypass auth loading
  const hasDataOrTimeout = (state.documents?.length > 0 || state.folders?.length > 0) || authTimeout;

  // Computed data using store selectors
  const currentFolders = useMemo(() => {
    const result = getFolderChildren(currentFolderId);
    console.log('🔍 Computing currentFolders:', {
      currentFolderId,
      result: result,
      resultLength: result?.length || 0,
      allFolders: state.folders,
      allFoldersLength: state.folders?.length || 0,
      firstFolder: state.folders?.[0]?.name || 'none',
      sampleFolderParentId: state.folders?.[0]?.parentId || 'none'
    });

    return result;
  }, [getFolderChildren, currentFolderId, state.folders]);

  // Get all documents recursively if showRecursive is true
  const getAllDocumentsRecursively = useCallback(function getAllDocumentsRecursively(folderId: string | null): Document[] {
    let allDocs: Document[] = [];

    // Get documents in current folder - use state directly
    const currentDocs = (state.documents || []).filter(doc => doc.folderId === folderId);
    allDocs = [...currentDocs];

    // Get all subfolders and their documents recursively
    const subfolders = getFolderChildren(folderId);
    subfolders.forEach(subfolder => {
      const subfolderDocs = getAllDocumentsRecursively(subfolder.id);
      allDocs = [...allDocs, ...subfolderDocs];
    });

    return allDocs;
  }, [state.documents, getFolderChildren]);

  // Utility function to get document URL for display/download
  const getDocumentUrl = useCallback((document: Document) => {
    // For newly uploaded files, use the original file object
    if (document.originalFile && isValidFile(document.originalFile)) {
      return URL.createObjectURL(document.originalFile);
    }
    // For persisted files from database, use the download API
    if (document.id) {
      return `/api/v1/documents/${document.id}/download`;
    }
    return null;
  }, []);

  // Create authenticated blob URLs for images (to fix authentication issue)
  const getAuthenticatedImageUrl = useCallback(async (document: Document) => {
    try {
      const response = await fetch(`/api/v1/documents/${document.id}/download`);
      if (response.ok) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
      console.error('Failed to fetch authenticated image:', response.statusText);
      return null;
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Error fetching authenticated image:', error);
      return null;
    }
  }, []);

  // Get folder stats (similar to useDocumentStore implementation)
  const getFolderStats = useCallback((folderId: string) => {
    const directDocuments = getFolderDocuments(folderId)
    const directFolders = getFolderChildren(folderId)

    // Recursive counting
    const getAllDescendantStats = (currentFolderId: string) => {
      const childFolders = getFolderChildren(currentFolderId)
      let totalDocs = getFolderDocuments(currentFolderId).length
      let totalFolders = childFolders.length

      childFolders.forEach(childFolder => {
        const childStats = getAllDescendantStats(childFolder.id)
        totalDocs += childStats.documents
        totalFolders += childStats.folders
      })

      return { documents: totalDocs, folders: totalFolders }
    }

    const recursiveStats = getAllDescendantStats(folderId)

    return {
      directDocuments: directDocuments.length,
      directFolders: directFolders.length,
      totalDocuments: recursiveStats.documents,
      totalFolders: recursiveStats.folders
    }
  }, [getFolderDocuments, getFolderChildren])

  const currentDocuments = useMemo(() => {
    console.log('🔍 [DOCUMENTS FILTER] Computing currentDocuments:', {
      currentFolderId,
      showRecursive,
      allDocuments: state.documents,
      allDocumentsLength: state.documents?.length || 0,
      firstDocument: state.documents?.[0]?.name || 'none',
      timestamp: new Date().toISOString()
    });

    let documents;

    if (showRecursive) {
      // Get all documents recursively from current folder and all subfolders
      documents = getAllDocumentsRecursively(currentFolderId);

      // Add folder path information for context
      documents = documents.map(doc => {
        if (doc.folderId && doc.folderId !== currentFolderId) {
          const path = state.folders.filter(f => {
            // Build path manually using TreeUtils logic
            let currentId = doc.folderId;
            const pathIds = [];
            while (currentId) {
              const folder = state.folders.find(f => f.id === currentId);
              if (folder) {
                pathIds.unshift(folder.id);
                currentId = folder.parentId;
              } else {
                break;
              }
            }
            return pathIds.includes(f.id);
          });
          const pathFromCurrent = path.slice(path.findIndex(p => p.id === currentFolderId) + 1);
          return {
            ...doc,
            folderPath: pathFromCurrent.length > 0 ? pathFromCurrent.map(p => p.name).join(' > ') : null
          };
        }
        return { ...doc, folderPath: null };
      });
    } else {
      // Only get documents in current folder - use state.documents for proper reactivity
      documents = (state.documents || []).filter(doc => doc.folderId === currentFolderId);
      console.log('🔍 [DOCUMENTS FILTER] Filtered documents:', {
        currentFolderId,
        totalDocs: (state.documents || []).length,
        filteredDocs: documents.length,
        documents: documents.map(d => ({ id: d.id, name: d.name, folderId: d.folderId }))
      });
    }

    console.log('🔍 Computing currentDocuments (DEPENDENCY TRIGGERED):', {
      currentFolderId,
      showRecursive,
      allDocuments: state.documents || [],
      allDocumentsLength: (state.documents || []).length,
      firstDocument: (state.documents || [])[0]?.name || 'none',
      result: documents,
      resultLength: documents.length,
      timestamp: new Date().toISOString()
    });

    // Apply filters
    if (filterType !== UI_CONSTANTS.ALL_FILTER) {
      documents = documents.filter(doc => doc.type === filterType);
    }

    if (filterSize !== UI_CONSTANTS.ALL_FILTER) {
      documents = documents.filter(doc => {
        const sizeInBytes = doc.size || 0;

        switch (filterSize) {
          case 'small': return sizeInBytes < 1024 * 1024; // < 1MB
          case 'medium': return sizeInBytes >= 1024 * 1024 && sizeInBytes < 10 * 1024 * 1024; // 1MB - 10MB
          case 'large': return sizeInBytes >= 10 * 1024 * 1024; // > 10MB
          default: return true;
        }
      });
    }

    // Apply sorting
    documents = [...documents].sort((a, b) => {
      switch (sortBy) {
        case UI_CONSTANTS.SORT_NEWEST:
          return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
        case UI_CONSTANTS.SORT_OLDEST:
          return new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
        case UI_CONSTANTS.SORT_NAME_ASC:
          return a.name.localeCompare(b.name);
        case UI_CONSTANTS.SORT_NAME_DESC:
          return b.name.localeCompare(a.name);
        case UI_CONSTANTS.SORT_SIZE_ASC:
          const sizeA = a.size || 0;
          const sizeB = b.size || 0;
          return sizeA - sizeB;
        case UI_CONSTANTS.SORT_SIZE_DESC:
          const sizeA2 = a.size || 0;
          const sizeB2 = b.size || 0;
          return sizeB2 - sizeA2;
        case UI_CONSTANTS.SORT_TYPE:
          return a.type.localeCompare(b.type);
        default:
          return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
      }
    });

    console.log('🔍 currentDocuments result:', {
      documentsLength: documents?.length || 0,
      firstDocument: documents?.[0]?.name || 'none'
    });

    return documents;
  }, [currentFolderId, showRecursive, getAllDocumentsRecursively, getFolderDocuments, filterType, filterSize, sortBy, state.documents, (state.documents || []).length, uploadCounter]);

  // Helper function to check if document is ready for AI analysis
  const isDocumentReadyForAnalysis = useCallback((document: any) => {
    const processingStatus = (document.processing as any)?.currentStatus;
    return processingStatus === 'COMPLETED' && document.analysis?.content?.extractedText;
  }, []);

  // Select all processed documents - only documents ready for AI analysis
  const selectAllDocuments = useCallback(() => {
    const processedDocumentIds = new Set(
      currentDocuments
        .filter(doc => isDocumentReadyForAnalysis(doc))
        .map(doc => doc.id)
    );
    setSelectedDocuments(processedDocumentIds);
  }, [currentDocuments, isDocumentReadyForAnalysis]);

  // Handle bulk AI analysis
  const handleBulkAIAnalysis = useCallback(async () => {
    if (selectedDocuments.size === 0) {
      notify.info('No Selection', 'Please select documents to analyze');
      return;
    }

    const selectedDocs = currentDocuments.filter(doc => selectedDocuments.has(doc.id));
    const processedDocs = selectedDocs.filter(doc => {
      const processingStatus = (doc.processing as any)?.status;
      return processingStatus === 'COMPLETED' && doc.extractedText;
    });
    const unprocessedDocs = selectedDocs.filter(doc => {
      const processingStatus = (doc.processing as any)?.status;
      return processingStatus !== 'COMPLETED' || !doc.extractedText;
    });

    if (processedDocs.length === 0) {
      notify.warning('Documents Not Ready',
        `None of the selected documents are ready for analysis. Documents must be fully processed first.\n` +
        `${unprocessedDocs.length} documents are still processing or failed.`
      );
      return;
    }

    if (unprocessedDocs.length > 0) {
      notify.info('Partial Analysis',
        `Only ${processedDocs.length} of ${selectedDocs.length} documents are ready for analysis. ` +
        `${unprocessedDocs.length} documents are still processing.`
      );
    }

    notify.info('Processing', `Queuing ${processedDocs.length} documents for AI analysis...`);

    playSound(SoundEffect.NOTIFICATION);
    setIsAnalyzing(true);

    try {
      // Call the batch scoring API (uses Clerk session-based auth)
      const response = await fetch('/api/v1/documents/batch-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentIds: processedDocs.map(doc => doc.id),
          organizationId,
          options: {
            performScoring: true,
            performAnalysis: true,
            priority: 'normal',
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Batch analysis API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });

        let errorMessage = `Failed to queue documents for analysis: ${response.status} ${response.statusText}`;

        // Try to parse error details
        try {
          const errorJson = JSON.parse(errorData);
          if (errorJson.details) {
            errorMessage = errorJson.details;
          }
        } catch (e) {
          // Fallback to generic error
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      notify.success('Analysis Queued', `Successfully queued ${processedDocs.length} documents. Batch ID: ${result.batchId}`);

      // Clear selection and exit bulk mode
      clearSelection();
      setIsBulkActionMode(false);

      // Optionally, show tracking info
      console.log('Batch processing started:', result);

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Failed to queue bulk analysis:', error);
      notify.error('Analysis Failed', 'Failed to queue documents for analysis. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedDocuments, currentDocuments, notify, playSound, clearSelection, organizationId]);

  // Count processed documents in selection
  const processedSelectedCount = useMemo(() => {
    if (selectedDocuments.size === 0) return 0;
    const selectedDocs = currentDocuments.filter(doc => selectedDocuments.has(doc.id));
    return selectedDocs.filter(doc => {
      const processingStatus = (doc.processing as any)?.status;
      return processingStatus === 'COMPLETED' && doc.extractedText;
    }).length;
  }, [selectedDocuments, currentDocuments]);

  // Keyboard shortcuts - defined after all functions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + A to select all (when in bulk mode)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && isBulkActionMode) {
        e.preventDefault();
        selectAllDocuments();
      }
      // Escape to exit bulk mode or clear selection
      if (e.key === 'Escape') {
        if (selectedDocuments.size > 0) {
          clearSelection();
        } else if (isBulkActionMode) {
          setIsBulkActionMode(false);
        }
      }
      // Cmd/Ctrl + Shift + A to analyze selected (when documents are selected)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a' && selectedDocuments.size > 0) {
        e.preventDefault();
        handleBulkAIAnalysis();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBulkActionMode, selectedDocuments.size, selectAllDocuments, clearSelection, handleBulkAIAnalysis]);

  // Calculate stats from state
  const stats = useMemo(() => {
    const totalBytes = (state.documents || []).reduce((total, document) => total + document.size, 0);

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    };

    return {
      totalDocuments: (state.documents || []).length,
      totalFolders: state.folders.length,
      totalSize: formatBytes(totalBytes)
    };
  }, [state.documents, state.folders]);

  // Add debugging for state (after currentFolders and currentDocuments are defined)
  useEffect(() => {
    console.log('📄 Documents Page State:', {
      timestamp: new Date().toISOString(),
      trigger: 'useEffect dependency change',
      state,
      loading: state.loading,
      foldersCount: state.folders?.length || 0,
      documentsCount: state.documents?.length || 0,
      currentFolderId,
      currentFolder: currentFolder?.name,
      currentFoldersCount: currentFolders?.length || 0,
      currentDocumentsCount: currentDocuments?.length || 0,
      // Add document IDs for comparison
      lastFiveDocumentIds: state.documents?.map(d => d.id).slice(-5) || []
    })
  }, [state, currentFolderId, currentFolder, currentFolders, currentDocuments])

  // Replace the useEffect that uses logTreeStructureJSON
  React.useEffect(() => {
    // Capture initial state
    const initialState = captureTreeState(state.folders, state.documents || [], currentFolderId);

    // Log initial tree structure on component mount
    logTreeStateChange(
      TREE_OPERATIONS.COMPONENT_MOUNT,
      initialState,
      initialState, // Same state for initial mount
      {
        initialLoad: true,
        componentInitialized: new Date().toISOString()
      }
    );
  }, [state.folders, state.documents, currentFolderId]);

  // Check if originalFile is a valid File object by checking for File-specific properties
  const isValidFile = useCallback((file: File) => {
    return file &&
           typeof file === 'object' &&
           'size' in file &&
           'type' in file &&
           'name' in file &&
           typeof file.size === 'number' &&
           typeof file.type === 'string' &&
           typeof file.name === 'string';
  }, []);

  // Predefined folder colors
  const folderColors = [
    { name: 'Gray', value: '#6b7280' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Orange', value: '#f97316' }
  ];

  // Event handlers
  const handleCreateFolder = useCallback(() => {
    if (!newFolderName.trim()) return;

    createFolder(newFolderName, currentFolderId, newFolderDescription, newFolderColor);
    setNewFolderName('');
    setNewFolderDescription('');
    setNewFolderColor('#6b7280');
    setShowNewFolderDialog(false);
  }, [newFolderName, newFolderDescription, newFolderColor, currentFolderId, createFolder]);

  const handleEditFolder = useCallback((folder: FolderData) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setNewFolderDescription(folder.description || '');
    setNewFolderColor(folder.color || '#6b7280');
    setShowEditFolderDialog(true);
  }, []);

  const handleUpdateFolder = useCallback(() => {
    if (!editingFolder || !newFolderName.trim()) return;

    updateFolder(editingFolder.id, {
      name: newFolderName,
      description: newFolderDescription,
      color: newFolderColor
    });

    setEditingFolder(null);
    setNewFolderName('');
    setNewFolderDescription('');
    setNewFolderColor('#6b7280');
    setShowEditFolderDialog(false);
  }, [editingFolder, newFolderName, newFolderDescription, newFolderColor, updateFolder]);

  // File upload handler with future Supabase support
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🚀 handleFileUpload called!')
    const uploadedFiles = Array.from(event.target.files ?? [])
    console.log('📁 Files selected:', uploadedFiles.length, uploadedFiles.map(f => f.name))

    // Feature flag - set to true when Supabase is configured
    const ENABLE_REAL_UPLOADS = true
    console.log('⚙️ ENABLE_REAL_UPLOADS:', ENABLE_REAL_UPLOADS)

    for (const file of uploadedFiles) {
      try {
        console.log(`🔄 Processing file: ${file.name} (${file.size} bytes)`)

        // Debug: Log current folder info
        console.log('🔍 Upload Debug:', {
          currentFolderId,
          currentFolder: currentFolder?.name || 'Root',
          folderPath: folderPath.map(f => f.name).join(' > ') || 'Root',
          organizationId
        })

        // Capture BEFORE state
        const beforeState = captureTreeState(state.folders, state.documents || [], currentFolderId)

        // Validate file using FileManagerProvider
        const validation = fileOps.validateFile(file)
        console.log('🔍 File validation result:', validation)
        if (!validation.isValid) {
          console.error('❌ File validation failed:', validation.error)
          notify.error('Upload Failed', validation.error || 'Invalid file')
          continue
        }

        // Show upload progress
        notify.info('Uploading...', `Uploading ${file.name}...`)

        // Upload file to storage (when Supabase is ready)
        let uploadResult = null
        if (ENABLE_REAL_UPLOADS) {
          console.log('📤 Starting real upload via storageOps.uploadFile...')
          console.log('📤 Upload parameters:', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            organizationId,
            folderId: currentFolderId
          })

          // Real upload to Supabase storage
          uploadResult = await storageOps.uploadFile(file, organizationId!, currentFolderId ?? undefined)
          console.log('📤 Upload result:', uploadResult)

          if (!uploadResult.success) {
            console.error('❌ Upload failed:', uploadResult.error)
            console.error('❌ Full upload result:', uploadResult)
            notify.error('Upload Failed', uploadResult.error || 'Failed to upload file')
            continue
          }

          console.log('✅ File uploaded to storage:', uploadResult.data)
        } else {
          console.log('🔧 Using mock upload...')
          // Mock upload with simulated delay for development
          await new Promise(resolve => setTimeout(resolve, 500)) // Simulate upload time
          uploadResult = { success: true, data: { filePath: `/mock/${file.name}` } }
          console.log('Mock upload success - Supabase not configured yet')
        }

        // Wait for upload to complete, then update tree state
        console.log('✅ Upload completed, now updating tree state...')

        // Use the REAL document data from upload API response
        const apiDocument = uploadResult.data
        console.log('📋 API returned document data:', apiDocument)
        console.log('📋 Upload result structure:', JSON.stringify(uploadResult, null, 2))

        const realDocument: Document = apiDocument.document;
        if (!realDocument?.id) throw new Error('Upload response is missing the document');

        // Add the document to the store immediately
        // Use Zustand's immer-style update for proper reactivity
        useDocumentChatStore.setState((state) => {
          state.documents.documents.push(realDocument)
        })

        console.log('✅ Document added to store immediately')

        // Force component re-render by incrementing counter
        setUploadCounter(prev => prev + 1)

        console.log('✅ Real document added to store:', realDocument.id)
        console.log('📋 Full realDocument structure:', realDocument)

        // Debug: Check what's actually in the store after adding
        setTimeout(() => {
          const currentStore = useDocumentChatStore.getState()
          const lastDoc = currentStore.documents.documents[currentStore.documents.documents.length - 1]
          console.log('🔍 Store state after upload:', {
            documentsCount: currentStore.documents.documents.length,
            lastDocument: lastDoc,
            lastDocumentFilePath: lastDoc?.filePath,
            lastDocumentHasAllFields: {
              id: !!lastDoc?.id,
              name: !!lastDoc?.name,
              filePath: !!lastDoc?.filePath,
              isEditable: lastDoc?.isEditable !== undefined,
              analysis: !!lastDoc?.analysis
            }
          })

          // Also check what the UI component sees
          console.log('🎯 What component state sees:', {
            stateDocuments: (state.documents || []).length,
            stateLastDoc: (state.documents || [])[(state.documents || []).length - 1]
          })
        }, 500)

        // Success notification
        notify.success('Upload Successful', `${file.name} has been uploaded successfully`)

        // Play file drop sound effect for successful upload
        playSound(SoundEffect.FILE_DROP)

        // Capture AFTER state and log the change
        // Create updated documents array with the new document to avoid timing issues
        const updatedDocuments = [...(state.documents || []), realDocument]
        const afterState = captureTreeState(state.folders, updatedDocuments, currentFolderId)

        // Log the tree state change
        const stateChangeLog = logTreeStateChange(
          TREE_OPERATIONS.UPLOAD_FILE,
          beforeState,
          afterState,
          {
            uploadedFile: file.name,
            fileSize: file.size,
            fileType: file.type,
            targetFolderId: currentFolderId,
            organizationId,
            uploadResult: uploadResult.data,
            documentId: realDocument.id
          }
        );

        // You can also access the state change data programmatically
        console.log('🌳 Tree State After File Upload:', {
          newDocument: realDocument,
          stateChange: stateChangeLog,
          currentFolderStats: afterState.currentFolder,
          overallStats: afterState.stats,
          // Add debugging to verify the fix for state timing issue
          debugCounts: {
            captureTreeStateCount: afterState.stats.totalDocuments,
            componentStateCount: (state.documents || []).length,
            afterStateDocuments: afterState.documents.length,
            updatedDocumentsCount: updatedDocuments.length,
            newDocumentId: realDocument.id,
            stateIncludesNewDoc: (state.documents || []).some(d => d.id === realDocument.id),
            // Note: componentStateCount may be lower due to React async state updates
            explanation: 'Tree state uses updatedDocuments array, component state updates asynchronously'
          }
        })

        // Additional logging for database persistence (optional)
        console.log('📁 File Upload Complete:', {
          uploadedFile: file.name,
          fileSize: file.size,
          fileType: file.type,
          targetFolderId: currentFolderId,
          organizationId,
          uploadResult: uploadResult.data,
          documentId: realDocument.id,
          beforeState: {
            folderCount: beforeState.folders.length,
            documentCount: beforeState.documents.length
          },
          afterState: {
            folderCount: afterState.folders.length,
            documentCount: afterState.documents.length
          }
        })

        // Schedule a refresh to get the processed document data (extractedText, etc.)
        // The upload endpoint does immediate processing, but we need to fetch the updated data
        console.log('⏰ Scheduling document refresh after processing...')
        setTimeout(async () => {
          try {
            console.log(`🔄 Refreshing document data for ${realDocument.id} after processing...`)

            // Fetch the updated document data from the API
            const response = await fetch(`/api/v1/documents/${realDocument.id}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
            })

            if (response.ok) {
              const updatedDocumentData = await response.json()
              console.log('✅ Got updated document data:', updatedDocumentData)

              // Update the document in the store with the processed data
              useDocumentChatStore.setState((state) => {
                const docIndex = state.documents.documents.findIndex(d => d.id === realDocument.id)
                if (docIndex !== -1) {
                  // Merge the processed data while keeping the UI structure
                  state.documents.documents[docIndex] = {
                    ...state.documents.documents[docIndex],
                    extractedText: updatedDocumentData.extractedText,
                    content: updatedDocumentData.content || {},
                    processing: updatedDocumentData.processing || state.documents.documents[docIndex].processing,
                    analysis: updatedDocumentData.analysis || {},
                    entities: updatedDocumentData.entities || {},
                    embeddings: updatedDocumentData.embeddings || {}
                  }
                  console.log('✅ Updated document in store with processed data')
                }
              })

              // Force a re-render to update the preview
              setUploadCounter(prev => prev + 1)

            } else {
              console.warn('⚠️ Failed to fetch updated document data:', response.status)
            }
          } catch (caughtError) {
      const error = normalizeError(caughtError);
            console.error('❌ Error refreshing document data:', error)
          }
        }, 3000) // Wait 3 seconds for processing to complete

      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error('❌ Upload error in handleFileUpload:', error)
        console.error('❌ Error details:', {
          message: error.message,
          stack: error.stack,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type
        })
        notify.error('Upload Error', `Failed to upload ${file.name}: ${error.message || 'Unknown error'}`)
      }
    }

    // Clear the input
    event.target.value = ''

    // Force a re-render by updating a dummy state
    // This ensures the UI reflects the new documents immediately
    if (uploadedFiles.length > 0) {
      console.log('✅ Upload complete, store should be updated')
      // The store is already updated by the code above, but we can verify
      const currentStore = useDocumentChatStore.getState()
      console.log('📊 Current store state after upload:', {
        documentsCount: currentStore.documents.documents.length,
        lastDocument: currentStore.documents.documents[currentStore.documents.documents.length - 1]
      })
    }
  }, [currentFolderId, organizationId, fileOps, storageOps, createDocument, state, notify, playSound, setUploadCounter])

  // File drop upload handler - now opens New Document modal
  const handleFileDropUpload = useCallback(async (files: FileList, targetFolderId: string | null) => {
    const uploadedFiles = Array.from(files);

    console.log('📁 Processing dropped files:', {
      fileCount: uploadedFiles.length,
      targetFolderId,
      fileNames: uploadedFiles.map(f => f.name)
    });

    if (uploadedFiles.length === 1) {
      // Single file - open modal with file pre-loaded
      const file = uploadedFiles[0];

      // Basic validation
      const validation = fileOps.validateFile(file);
      if (!validation.isValid) {
        notify.error('Invalid File', validation.error || 'File type not supported');
        return;
      }

      // Set the dragged file and open modal
      setDraggedFileForModal(file);
      setShowCreateDocumentModal(true);

      console.log('📄 Opening New Document modal with file:', file.name);

    } else if (uploadedFiles.length > 1) {
      // Multiple files - show notification and open modal for first file
      notify.info('Multiple Files', `${uploadedFiles.length} files dropped. Processing first file. Upload others individually.`);

      const firstFile = uploadedFiles[0];
      const validation = fileOps.validateFile(firstFile);
      if (!validation.isValid) {
        notify.error('Invalid File', validation.error || 'File type not supported');
        return;
      }

      setDraggedFileForModal(firstFile);
      setShowCreateDocumentModal(true);
    }
  }, [fileOps, notify]);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleSearchChange(e.target.value);
  }, [handleSearchChange]);


  const openDocumentModal = useCallback((document: Document) => {
    console.log('🔍 openDocumentModal called with:', document);
    setSelectedDocument(document);
    setShowDocumentModal(true);
    // Initialize metadata editing state
    setIsEditingMetadata(false);
    setEditedFileName(document.name);
    // setEditedCustomMetadataFields([]); // Custom fields not supported in current interface
    setEditedTags(document.tags || []);
    console.log('📄 Modal state updated:', { showDocumentModal: true, selectedDocument: document?.name });
  }, []);

  const closeDocumentModal = useCallback(() => {
    setSelectedDocument(null);
    setShowDocumentModal(false);
    setIsEditingMetadata(false);
    setEditedFileName('');
    // setEditedCustomMetadataFields([]);
    setEditedTags([]);
    setNewTagInput('');
    // setIsAddingMetadata(false);
    // setNewMetadataKey('');
    // setNewMetadataValue('');
    // setEditingMetadataIndex(null);
    // setEditingMetadataKey('');
    // setEditingMetadataValue('');
  }, []);

  // Metadata editing functions
  const startEditingMetadata = useCallback(() => {
    setIsEditingMetadata(true);
  }, []);

  const cancelEditingMetadataMain = useCallback(() => {
    setIsEditingMetadata(false);
    setEditedFileName(selectedDocument?.name ?? '');
    // setEditedCustomMetadataFields([]); // Custom fields not supported in current interface
    setEditedTags(selectedDocument?.tags || []);
    setNewTagInput('');
    // setIsAddingMetadata(false);
    // setNewMetadataKey('');
    // setNewMetadataValue('');
    // setEditingMetadataIndex(null);
    // setEditingMetadataKey('');
    // setEditingMetadataValue('');
  }, [selectedDocument]);

  // Add this effect to watch for state changes after updates
  useEffect(() => {
    if (pendingUpdate && (state.documents || []).length > 0) {
      const updatedDoc = (state.documents || []).find(d => d.id === pendingUpdate.documentId);
      if (updatedDoc && updatedDoc.lastModified !== pendingUpdate.beforeLastModified) {
        console.log('✅ State has updated - Document found:', updatedDoc)
        console.log('📝 Name changed:', pendingUpdate.originalName !== updatedDoc.name)
        console.log('📝 Tags changed:', JSON.stringify(pendingUpdate.originalTags) !== JSON.stringify(updatedDoc.tags))

        // Capture AFTER state
        const afterState = captureTreeState(state.folders, state.documents || [], currentFolderId)

        console.log('🌳 Tree State Before:', pendingUpdate.beforeState)
        console.log('🌳 Tree State After:', afterState)

        // Log the tree state change with detailed information
        const stateChangeLog = logTreeStateChange(
          TREE_OPERATIONS.UPDATE_DOCUMENT_METADATA,
          pendingUpdate.beforeState,
          afterState,
          {
            updatedDocumentId: pendingUpdate.documentId,
            documentName: updatedDoc.name,
            originalData: {
              name: pendingUpdate.originalName,
              tags: pendingUpdate.originalTags
            },
            newData: updatedDoc,
            changesSummary: {
              nameChanged: pendingUpdate.originalName !== updatedDoc.name,
              // Note: tags and metadata no longer exist in document structure
            }
          }
        );

        console.log('🔄 State change log:', stateChangeLog)

        // Clear the pending update
        setPendingUpdate(null)
      }
    }
  }, [state.documents, pendingUpdate, currentFolderId])

  // Real-time polling for processing documents
  useEffect(() => {
    const processingDocuments = (state.documents || []).filter(doc => {
      const processingStatus = (doc.processing as any)?.status;
      return processingStatus === 'PROCESSING' || processingStatus === 'QUEUED';
    });

    if (processingDocuments.length === 0) {
      return; // No polling needed
    }

    console.log('📊 Starting polling for', processingDocuments.length, 'processing documents');

    const pollInterval = setInterval(async () => {
      try {
        // Poll status for each processing document
        await Promise.all(
          processingDocuments.map(async (doc: Document) => {
            try {
              const response = await fetch(`/api/v1/documents/${doc.id}/status`);
              if (response.ok) {
                const statusData = await response.json();

                // Update the document status in the store if it changed
                const currentProcessingStatus = (doc.processing as any)?.currentStatus;
                if (statusData.status !== currentProcessingStatus) {
                  console.log(`📊 Status update for ${doc.name}: ${currentProcessingStatus} -> ${statusData.status}`);

                  // Trigger store refresh to get updated documents
                  // This will cause the component to re-render with new status
                  if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
                    // Refresh documents when processing completes
                    console.log('🔄 Refreshing documents due to status change');
                    // Force refresh by updating a dependency
                    setUploadCounter(prev => prev + 1);

                    // Show toast notification
                    if (statusData.status === 'COMPLETED') {
                      notify.success('Processing Complete', `"${doc.name}" has been processed successfully`);
                      playSound(SoundEffect.SUCCESS);
                    } else if (statusData.status === 'FAILED') {
                      notify.error('Processing Failed', `"${doc.name}" processing failed`);
                      playSound(SoundEffect.ERROR);
                    }
                  }
                }
              }
            } catch (caughtError) {
      const error = normalizeError(caughtError);
              console.error(`Error polling status for document ${doc.id}:`, error);
            }
          })
        );
      } catch (caughtError) {
      const error = normalizeError(caughtError);
        console.error('Error in polling loop:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      console.log('📊 Stopping polling for processing documents');
      clearInterval(pollInterval);
    };
  }, [state.documents, notify, playSound, setUploadCounter]);

  const saveMetadata = useCallback(async () => {
    if (selectedDocument) {
      console.log('🔄 Starting metadata update...')
      console.log('📋 Before update - Document:', selectedDocument)

      // Capture BEFORE state
      const beforeState = captureTreeState(state.folders, state.documents || [], currentFolderId)

      const updates = {
        name: editedFileName,
        tags: editedTags
      }

      console.log('📝 Updates to apply:', updates)
      console.log('📝 Original name:', selectedDocument.name)
      console.log('📝 New name:', updates.name)
      console.log('📝 Names are different:', selectedDocument.name !== updates.name)

      // Set pending update to track when state changes
      setPendingUpdate({
        documentId: selectedDocument.id,
        beforeLastModified: selectedDocument.lastModified,
        originalName: selectedDocument.name,
        originalTags: selectedDocument.tags,
        beforeState
      })

      // Use the new updateDocument method
      console.log('🔄 Calling updateDocument...')
      const updateResult = await updateDocument(selectedDocument.id, updates)

      console.log('📋 Update result:', updateResult)

      if (updateResult.success) {
        console.log('✅ Update successful')

        // Create the updated document object with all current data
        const updatedDocumentData = {
          ...selectedDocument,
          name: editedFileName,
          tags: editedTags,
          lastModified: new Date().toISOString()
        }

        setSelectedDocument(updatedDocumentData)
        setIsEditingMetadata(false)
      } else {
        console.error('❌ Update failed:', updateResult.error)
        setPendingUpdate(null) // Clear pending update on failure
      }
    }
  }, [selectedDocument, editedFileName, editedTags, updateDocument, state, currentFolderId])


  // Tag editing functions
  const addTag = useCallback(() => {
    if (newTagInput.trim() && !editedTags.includes(newTagInput.trim())) {
      setEditedTags(prev => [...prev, newTagInput.trim()]);
      setNewTagInput('');
    }
  }, [newTagInput, editedTags]);

  const removeTag = useCallback((tagToRemove: string) => {
    setEditedTags(prev => prev.filter(tag => tag !== tagToRemove));
  }, []);

  const handleTagInputKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }, [addTag]);

  const handleModalBackdropClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) {
      closeDocumentModal();
    }
  }, [closeDocumentModal]);

  const handleMoveDocument = useCallback((docId: string, targetFolderId: string | null) => {
    const actualTargetId = targetFolderId === UI_CONSTANTS.ROOT_FOLDER_ID ? null : targetFolderId;
    moveDocument(docId, actualTargetId);
    closeDocumentModal();
  }, [moveDocument, closeDocumentModal]);

  const handleDeleteDocument = useCallback((docId: string) => {
    deleteDocument(docId);
    closeDocumentModal();
  }, [deleteDocument, closeDocumentModal]);

  const handleAnalyzeDocument = useCallback(async (document: Document) => {
    try {
      notify.info('AI Analysis', `Starting full AI analysis for "${document.name}"...`);

      const result = await triggerDocumentAnalysis(document.id, {
        includeSecurityAnalysis: true,
        includeEntityExtraction: true,
        includeQualityScoring: true,
        priority: 'normal'
      });

      if (result.success) {
        notify.success('AI Analysis', `Analysis started for "${document.name}". You'll be notified when complete.`);
        playSound(SoundEffect.SUCCESS);
      } else {
        notify.error('AI Analysis', result.message || 'Failed to start analysis');
        playSound(SoundEffect.ERROR);
      }
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Error triggering document analysis:', error);
      notify.error('AI Analysis', 'Failed to start analysis. Please try again.');
      playSound(SoundEffect.ERROR);
    }
  }, [notify, playSound]);

  const openDeleteModal = useCallback((document: Document) => {
    console.log('🗑️ openDeleteModal called with:', document);
    setDocumentToDelete(document);
    setShowDeleteModal(true);
    console.log('🗑️ Delete modal state updated:', { showDeleteModal: true, documentToDelete: document?.name });
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDocumentToDelete(null);
    setShowDeleteModal(false);
    setIsDeleting(false);
  }, []);

  const handleCreateDocument = useCallback(async (data: Parameters<React.ComponentProps<typeof CreateDocumentModal>['onSubmit']>[0]) => {
    try {
      // Check if organization ID is available
      if (!organizationId) {
        console.warn('Organization ID not available, retrying...');
        notify.warning('Please wait', 'Organization data is still loading. Please try again in a moment.');
        return;
      }

      console.log('Creating document with data:', data);

      // Set loading state
      setIsCreatingDocument(true);

      // Show loading notification
      notify.info('Creating Document', `Creating "${data.title}"...`);

      let newDocumentId;

      if (data.file) {
        // Handle file upload
        console.log('📄 Creating document from file upload:', data.file.name);

        // Upload file to Supabase storage first
        const formData = new FormData();
        formData.append('file', data.file);
        formData.append('organizationId', organizationId);
        const targetFolderId = data.selectedFolderId || currentFolderId;
        if (targetFolderId) {
          formData.append('folderId', targetFolderId);
        }
        // Include tags and document type
        formData.append('tags', JSON.stringify(data.tags || []));
        formData.append('documentType', data.type.toUpperCase());

        const uploadResponse = await fetch('/api/v1/documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'File upload failed');
        }

        const uploadResult = await uploadResponse.json();
        console.log('✅ File upload successful:', uploadResult);
        newDocumentId = uploadResult.id;

        const newDocument: Document = uploadResult.document;
        if (!newDocument?.id) throw new Error('The server did not return a document');

        // Add to store immediately using proper Immer methods
        useDocumentChatStore.setState((state) => {
          state.documents.documents.push(newDocument);
        });

        // Force component re-render
        setUploadCounter(prev => prev + 1);

        console.log('📄 Added file upload document to store:', newDocument);

      } else {
        // Handle text-based document creation
        console.log('📝 Creating text-based document');

        // Validate required fields before sending request
        if (!organizationId) {
          throw new Error('Organization ID is required but not found. Please refresh the page and try again.');
        }

        const targetFolderId = data.selectedFolderId || currentFolderId;
        const requestData = {
          name: data.title,
          type: data.type.toUpperCase(), // API now expects uppercase values to match DocumentCreationRequest
          content: data.content || '',
          organizationId,
          folderId: targetFolderId,
          templateId: data.templateId,
          // Direct fields (no metadata wrapper)
          tags: data.tags || [],
          urgencyLevel: data.urgencyLevel || 'medium',
          complexityScore: data.complexityScore || 5
        };

        console.log('📝 Request data:', requestData);

        const createResponse = await fetch('/api/v1/documents/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData),
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          console.error('❌ API Error Details:', error);
          console.error('❌ Full Error Object:', JSON.stringify(error, null, 2));
          throw new Error(`${error.error || 'Document creation failed'}. Details: ${JSON.stringify(error.details || {})}`);
        }

        const createResult = await createResponse.json();
        console.log('✅ Document creation successful:', createResult);
        newDocumentId = createResult.id;

        const newDocument: Document = createResult.document;
        if (!newDocument?.id) throw new Error('The server did not return a document');

        // Add to store immediately using proper Immer methods
        useDocumentChatStore.setState((state) => {
          state.documents.documents.push(newDocument);
        });

        // Force component re-render
        setUploadCounter(prev => prev + 1);

        console.log('📝 Added text document to store:', newDocument);
      }

      // Success notification
      notify.success('Document Created', `"${data.title}" has been created successfully!`);

      // Close modal
      setShowCreateDocumentModal(false);

    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Error creating document:', error);
      notify.error('Error', error.message || 'Failed to create document. Please try again.');
    } finally {
      // Always clear loading state
      setIsCreatingDocument(false);
    }
  }, [currentFolderId, organizationId, notify]);

  const confirmDelete = useCallback(async () => {
    if (!documentToDelete) return;

    setIsDeleting(true);
    try {
      await deleteDocument(documentToDelete.id);
      closeDeleteModal();
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Failed to delete document:', error);
      setIsDeleting(false);
    }
  }, [documentToDelete, deleteDocument, closeDeleteModal]);

  // Folder deletion handlers
  const openFolderDeleteModal = useCallback((folder: FolderData) => {
    setFolderToDelete(folder);

    // Count documents and subfolders in this folder
    const folderDocuments = getFolderDocuments(folder.id);
    const folderChildren = getFolderChildren(folder.id);

    // If folder has contents, show info modal, otherwise show confirmation modal
    if (folderDocuments.length > 0 || folderChildren.length > 0) {
      setShowFolderInfoModal(true);
    } else {
      setShowFolderDeleteModal(true);
    }
  }, [getFolderDocuments, getFolderChildren]);

  const closeFolderDeleteModal = useCallback(() => {
    setFolderToDelete(null);
    setShowFolderDeleteModal(false);
    setIsDeletingFolder(false);
  }, []);

  const closeFolderInfoModal = useCallback(() => {
    setFolderToDelete(null);
    setShowFolderInfoModal(false);
  }, []);

  const confirmFolderDelete = useCallback(async () => {
    if (!folderToDelete) return;

    setIsDeletingFolder(true);
    try {
      const result = await deleteFolder(folderToDelete.id);
      if (result.success) {
        // Play folder delete sound effect
        playSound(SoundEffect.FOLDER_DELETE);
        closeFolderDeleteModal();
      } else {
        console.error('Failed to delete folder:', result.error);
        setIsDeletingFolder(false);
      }
    } catch (caughtError) {
      const error = normalizeError(caughtError);
      console.error('Failed to delete folder:', error);
      setIsDeletingFolder(false);
    }
  }, [folderToDelete, deleteFolder, closeFolderDeleteModal, playSound]);

  // System-to-UI drag and drop handlers
  const handleSystemDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    // Only handle file drags from system (not internal document moves)
    const hasFiles = e.dataTransfer.types.includes('Files');
    if (hasFiles) {
      e.dataTransfer.dropEffect = 'copy';
      setIsSystemDragOver(true);

      const target = e.target as HTMLElement;

      // Check if dragging over a specific folder
      // Look for folder card container (has both 'group' and 'relative' classes)
      const folderCard = target.closest('.group.relative[data-folder-id]');
      const specificFolderId = folderCard?.getAttribute('data-folder-id');

      if (specificFolderId && specificFolderId !== UI_CONSTANTS.ROOT_FOLDER_ID) {
        // Dragging over a specific folder
        setIsDragOverSpecificFolder(true);
        setDragTargetFolder(specificFolderId);
        setDragOverFolder(specificFolderId); // Highlight the specific folder

        console.log('🎯 Dragging over specific folder:', {
          folderId: specificFolderId,
          folderName: findFolder(specificFolderId)?.name || 'Unknown'
        });
      } else {
        // Dragging over empty area - target current folder
        setIsDragOverSpecificFolder(false);
        setDragTargetFolder(currentFolderId || UI_CONSTANTS.ROOT_FOLDER_ID);
        setDragOverFolder(null); // Clear specific folder highlight

        console.log('🎯 Dragging over empty area, targeting:', {
          currentFolderId: currentFolderId || 'root',
          currentFolderName: currentFolderId ? findFolder(currentFolderId)?.name : 'Root'
        });
      }
    }
  }, [currentFolderId, findFolder]);

  const handleSystemDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    // Only reset if leaving the main container (not child elements)
    const relatedTarget = e.relatedTarget as HTMLElement;
    const mainContainer = e.currentTarget;

    if (!mainContainer.contains(relatedTarget)) {
      setIsSystemDragOver(false);
      setDragTargetFolder(null);
      setDragOverFolder(null);
      setIsDragOverSpecificFolder(false);
    }
  }, []);

  const handleSystemDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsSystemDragOver(false);
    setDragTargetFolder(null);
    setDragOverFolder(null);
    setIsDragOverSpecificFolder(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Determine target folder - use the dragTargetFolder we already determined in dragOver
      const targetFolderId = dragTargetFolder || currentFolderId || UI_CONSTANTS.ROOT_FOLDER_ID;

      console.log('🎯 System file drop detected:', {
        fileCount: files.length,
        targetFolderId,
        dragTargetFolder,
        currentFolderId,
        files: Array.from(files).map(f => f.name)
      });

      // Use existing file drop upload logic
      handleFileDropUpload(files, targetFolderId);
    }
  }, [dragTargetFolder, currentFolderId, handleFileDropUpload]);

  const navigateToDocumentLocation = useCallback((document: Document) => {
    if (document.folderId) {
      navigateToFolder(document.folderId);
    } else {
      navigateToRoot();
    }
    clearSearch();
  }, [navigateToFolder, navigateToRoot, clearSearch]);

  // Create a custom drag image for better visual feedback
  const createDragImage = useCallback((itemName: string, itemType: string, itemIcon = '📄') => {
    const dragElement = document.createElement('div');
    dragElement.style.cssText = `
      position: absolute;
      top: -1000px;
      left: -1000px;
      padding: 8px 12px;
      background: rgba(59, 130, 246, 0.95);
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
      z-index: 9999;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      backdrop-filter: blur(8px);
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    dragElement.innerHTML = `${itemIcon} ${itemName}`;
    document.body.appendChild(dragElement);

    return dragElement;
  }, []);

  // Drag and drop handlers
  const handleDocumentDragStart = useCallback((e: React.DragEvent<HTMLElement>, doc: Document) => {
    setDraggedDocument(doc);
    e.dataTransfer.effectAllowed = UI_CONSTANTS.DRAG_EFFECT_MOVE;

    // Create custom drag image with document icon
    const fileIcon = doc.type === 'image' ? '🖼️' :
                    doc.type === 'video' ? '🎥' :
                    doc.type === 'audio' ? '🎵' :
                    doc.name.endsWith('.pdf') ? '📄' :
                    doc.name.endsWith('.doc') || doc.name.endsWith('.docx') ? '📝' :
                    doc.name.endsWith('.xls') || doc.name.endsWith('.xlsx') ? '📊' : '📄';

    const dragImage = createDragImage(doc.name, 'document', fileIcon);
    e.dataTransfer.setDragImage(dragImage, 20, 20);

    // Clean up drag image after drag starts
    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage);
      }
    }, 0);
  }, [createDragImage]);

  const handleFolderDragStart = useCallback((e: React.DragEvent<HTMLElement>, folder: FolderData) => {
    setDraggedFolder(folder);
    e.dataTransfer.effectAllowed = UI_CONSTANTS.DRAG_EFFECT_MOVE;

    // Create custom drag image with folder icon
    const folderIcon = folder.isProtected ? '🔒' : '📁';
    const dragImage = createDragImage(folder.name, 'folder', folderIcon);
    e.dataTransfer.setDragImage(dragImage, 20, 20);

    // Clean up drag image after drag starts
    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage);
      }
    }, 0);
  }, [createDragImage]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>, folderId: string | null) => {
    e.preventDefault();

    // Check if files are being dragged (for upload) vs internal drag (for move)
    const hasFiles = e.dataTransfer.types.includes('Files');

    if (hasFiles) {
      // File upload drag
      e.dataTransfer.dropEffect = 'copy';
      e.currentTarget.style.cursor = 'copy';
    } else {
      // Document/folder move drag
      e.dataTransfer.dropEffect = UI_CONSTANTS.DRAG_EFFECT_MOVE;
      e.currentTarget.style.cursor = 'move';

      // Add visual feedback for valid drop zones
      if (draggedDocument || draggedFolder) {
        // Check if this is a valid drop target
        const isDraggedItem = (draggedDocument?.folderId === folderId) || (draggedFolder?.id === folderId);
        const isParentToSelf = draggedFolder && folderId === draggedFolder.parentId;

        if (!isDraggedItem && !isParentToSelf) {
          // Valid drop target - enhance existing blue background
          const currentBg = e.currentTarget.style.background;
          if (!currentBg.includes('rgba(59, 130, 246')) {
            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'; // Green for valid
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.5)';
          }
        } else {
          // Invalid drop target
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; // Red for invalid
          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
          e.dataTransfer.dropEffect = 'none';
        }
      }
    }

    setDragOverFolder(folderId);
  }, [draggedDocument, draggedFolder]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    setDragOverFolder(null);
    e.currentTarget.style.cursor = 'default';
    // Reset drag over styles
    e.currentTarget.style.background = '';
    e.currentTarget.style.borderColor = '';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedDocument(null);
    setDraggedFolder(null);
    setDragOverFolder(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLElement>, targetFolderId: string | null) => {
    const beforeState = captureTreeState(state.folders, state.documents || [], currentFolderId);
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to parent elements
    setDragOverFolder(null);
    e.currentTarget.style.borderColor = '';
    e.currentTarget.style.backgroundColor = '';

    // Check if files are being dropped from external source
    const hasFiles = e.dataTransfer.files && e.dataTransfer.files.length > 0;

    if (hasFiles) {
      // Handle external file drop
      handleFileDropUpload(e.dataTransfer.files, targetFolderId);
      return;
    }

    if (draggedDocument) {
      const actualTargetId = targetFolderId === UI_CONSTANTS.ROOT_FOLDER_ID ? null : targetFolderId;
      const targetFolderName = actualTargetId ? findFolder(actualTargetId)?.name : 'Root';

      if (draggedDocument.folderId !== actualTargetId) {
        moveDocument(draggedDocument.id, actualTargetId);

        // Play file drop sound effect
        playSound(SoundEffect.FILE_DROP);

        // Remove the setTimeout logging - it's causing confusion
        // The document store will log the state change automatically
      }
    } else if (draggedFolder) {
      const actualTargetId = targetFolderId === UI_CONSTANTS.ROOT_FOLDER_ID ? null : targetFolderId;
      const targetFolderName = actualTargetId ? findFolder(actualTargetId)?.name : 'Root';

      if (draggedFolder.id !== actualTargetId && !draggedFolder.isProtected) {
        const isDescendant = (folderId: string | null, potentialAncestorId: string): boolean => {
          if (!folderId) return false;
          const folder = findFolder(folderId);
          if (!folder) return false;
          if (folder.parentId === potentialAncestorId) return true;
          return isDescendant(folder.parentId, potentialAncestorId);
        };

        if (!isDescendant(actualTargetId, draggedFolder.id)) {
          moveFolder(draggedFolder.id, actualTargetId);

          // Play file drop sound effect for folder movement too
          playSound(SoundEffect.FILE_DROP);

          // Remove the setTimeout logging - it's causing confusion
          // The document store will log the state change automatically
        } else {
          // Only log blocked operations
          logTreeStateChange(
            TREE_OPERATIONS.DRAG_DROP_BLOCKED,
            beforeState,
            beforeState,
            {
              operationType: 'folder-drag-drop-blocked',
              reason: 'target-is-descendant',
              draggedItem: {
                type: 'folder',
                id: draggedFolder.id,
                name: draggedFolder.name
              },
              target: {
                parentId: actualTargetId,
                parentName: targetFolderName
              },
              success: false
            }
          );
        }
      } else {
        const reason = draggedFolder.isProtected ? 'folder-is-protected' : 'cannot-drop-into-self';
        logTreeStateChange(
          TREE_OPERATIONS.DRAG_DROP_BLOCKED,
          beforeState,
          beforeState,
          {
            operationType: 'folder-drag-drop-blocked',
            reason,
            draggedItem: {
              type: 'folder',
              id: draggedFolder.id,
              name: draggedFolder.name,
              isProtected: draggedFolder.isProtected
            },
            target: {
              parentId: actualTargetId,
              parentName: targetFolderName
            },
            success: false
          }
        );
      }
      setDraggedFolder(null);
    }
  }, [draggedDocument, draggedFolder, moveDocument, moveFolder, state, currentFolderId, findFolder, playSound, handleFileDropUpload]);

  // Utility functions
  const buildFolderHierarchy = useCallback(function buildFolderHierarchy(folders: FolderData[], parentId: string | null = null, level = 0): Array<FolderData & { level: number }> {
    const result: Array<FolderData & { level: number }> = [];
    const children = folders.filter(f => f.parentId === parentId);

    children.forEach(folder => {
      result.push({ ...folder, level });
      const subFolders = buildFolderHierarchy(folders, folder.id, level + 1);
      result.push(...subFolders);
    });

    return result;
  }, []);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getDocumentIcon = useCallback((type: string) => {
    switch (type) {
      case 'pdf': return <File size={16} className="text-red-500" />;
      case 'word': return <FileText size={16} className="text-blue-500" />;
      case 'excel': return <File size={16} className="text-green-500" />;
      case 'powerpoint': return <File size={16} className="text-orange-500" />;
      case 'image': return <FileImage size={16} className="text-purple-500" />;
      case 'video': return <FileVideo size={16} className="text-indigo-500" />;
      case 'audio': return <FileAudio size={16} className="text-pink-500" />;
      case 'archive': return <Archive size={16} className="text-yellow-600" />;
      case 'code': return <Code size={16} className="text-cyan-500" />;
      case 'text': return <FileText size={16} className="text-gray-600" />;
      default: return <File size={16} className="text-gray-500" />;
    }
  }, []);

  const getFileTypeBadge = useCallback((type: string) => {
    switch (type) {
      case DOCUMENT_TYPES.PDF:
        return <Badge className="text-xs bg-red-500 hover:bg-red-600">PDF</Badge>;
      case DOCUMENT_TYPES.WORD:
        return <Badge className="text-xs bg-blue-500 hover:bg-blue-600">WORD</Badge>;
      case DOCUMENT_TYPES.EXCEL:
        return <Badge className="text-xs bg-green-500 hover:bg-green-600">EXCEL</Badge>;
      case DOCUMENT_TYPES.POWERPOINT:
        return <Badge className="text-xs bg-orange-500 hover:bg-orange-600">PPT</Badge>;
      case DOCUMENT_TYPES.IMAGE:
        return <Badge className="text-xs bg-purple-500 hover:bg-purple-600">IMAGE</Badge>;
      case DOCUMENT_TYPES.VIDEO:
        return <Badge className="text-xs bg-indigo-500 hover:bg-indigo-600">VIDEO</Badge>;
      case DOCUMENT_TYPES.AUDIO:
        return <Badge className="text-xs bg-pink-500 hover:bg-pink-600">AUDIO</Badge>;
      case DOCUMENT_TYPES.ARCHIVE:
        return <Badge className="text-xs bg-yellow-600 hover:bg-yellow-700">ARCHIVE</Badge>;
      case DOCUMENT_TYPES.CODE:
        return <Badge className="text-xs bg-cyan-500 hover:bg-cyan-600">CODE</Badge>;
      case DOCUMENT_TYPES.TEXT:
        return <Badge className="text-xs bg-gray-500 hover:bg-gray-600">TEXT</Badge>;
      case DOCUMENT_TYPES.MARKDOWN:
        return <Badge className="text-xs bg-violet-500 hover:bg-violet-600">MARKDOWN</Badge>;
      default:
        return <Badge className="text-xs bg-slate-500 hover:bg-slate-600">{type.toUpperCase()}</Badge>;
    }
  }, []);

  const renderBreadcrumbs = useCallback(() => {
    const breadcrumbItems = [];

    breadcrumbItems.push(
      <button
        key={UI_CONSTANTS.ROOT_FOLDER_ID}
        onClick={() => navigateToFolder(null)}
        onDragOver={(e) => handleDragOver(e, UI_CONSTANTS.ROOT_FOLDER_ID)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, UI_CONSTANTS.ROOT_FOLDER_ID)}
        className={`text-sm px-2 py-1 rounded transition-colors ${
          folderPath.length === 0
            ? 'text-foreground'
            : 'text-blue-600 hover:text-blue-800 cursor-pointer hover:bg-blue-50'
        } ${
          dragOverFolder === UI_CONSTANTS.ROOT_FOLDER_ID ? 'bg-blue-100 text-blue-800' : ''
        }`}
      >
        Documents
      </button>
    );

    folderPath.forEach((pathItem, index) => {
      breadcrumbItems.push(
        <ChevronRight key={`arrow-${pathItem.id}`} size={16} className="text-muted-foreground" />
      );
      breadcrumbItems.push(
        <button
          key={`button-${pathItem.id}`}
          onClick={() => navigateToFolder(pathItem.id)}
          onDragOver={(e) => handleDragOver(e, pathItem.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, pathItem.id)}
          className={`text-sm px-2 py-1 rounded transition-colors ${
            index === folderPath.length - 1
              ? 'text-foreground'
              : 'text-blue-600 hover:text-blue-800 cursor-pointer hover:bg-blue-50'
          } ${
            dragOverFolder === pathItem.id ? 'bg-blue-100 text-blue-800' : ''
          }`}
        >
          {pathItem.name}
        </button>
      );
    });

    return breadcrumbItems;
  }, [folderPath, navigateToFolder, handleDragOver, handleDragLeave, handleDrop, dragOverFolder]);

  const renderFilePreview = useCallback((doc: Document) => {
    // Check if this is a created document (no actual file)
    const isCreatedDocument = doc.filePath?.startsWith('/documents/') ||
      (!doc.originalFile && doc.filePath && !doc.filePath.includes('/api/v1/documents/') && !doc.filePath.includes('supabase'));

    // Debug logging for created document detection
    console.log('renderFilePreview - Created document check:', {
      id: doc.id,
      name: doc.name,
      filePath: doc.filePath,
      hasOriginalFile: !!doc.originalFile,
      isCreatedDocument
    });

    // If it's a created document, show "No file" message
    if (isCreatedDocument) {
      return (
        <div className="flex flex-col items-center justify-center text-muted-foreground">
          <div className="text-6xl mb-4">
            {getDocumentIcon('document')}
          </div>
          <p className="text-sm">No file</p>
          <p className="text-xs mt-1">Created Document</p>
          <p className="text-xs mt-1">{doc.name}</p>
        </div>
      );
    }

    // Create object URL for uploaded files or use placeholder for demo files
    const getFileUrl = (doc: Document) => {
      if (doc.originalFile && isValidFile(doc.originalFile)) {
        return URL.createObjectURL(doc.originalFile);
      }
      return null; // No preview for demo files
    };

    // Enhanced function to get document URL for both new and persisted documents (same as main grid)
    const getDocumentUrlForPreview = (document: Document) => {
      // For newly uploaded files, use the original file object
      if (document.originalFile && isValidFile(document.originalFile)) {
        return URL.createObjectURL(document.originalFile);
      }
      // For persisted files from database, use the download API
      if (document.id) {
        return `/api/v1/documents/${document.id}/download`;
      }
      return null;
    };

    const createPlaceholder = (text: string) => {
      return `data:image/svg+xml;base64,${btoa(`
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#f3f4f6"/>
          <text x="50%" y="50%" font-family="system-ui" font-size="16" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">
            ${text}
          </text>
        </svg>
      `)}`;
    };

    switch (doc.type) {
      case 'image':
        const imageUrl = getFileUrl(doc);

        const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
          const img = e.currentTarget;
          const aspectRatio = img.naturalWidth / img.naturalHeight;

          // Determine object-fit based on aspect ratio
          // If image is square-ish (0.8-1.2) or vertical (< 0.8), use cover
          // If image is horizontal (> 1.2), use contain to show full image
          if (aspectRatio <= 1.2) {
            img.style.objectFit = 'cover';
          } else {
            img.style.objectFit = 'contain';
          }
        };

        return (
          <div className="w-full h-full bg-black relative">
            <AuthenticatedImage
              document={doc}
              alt={doc.name}
              className="w-full h-full object-contain"
              onLoad={handleImageLoad}
            />
          </div>
        );

      case 'video':
        const videoUrl = getDocumentUrlForPreview(doc);
        return (
          <div className="w-full h-full relative bg-black">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                className="w-full h-full object-contain"
                preload="metadata"
                onError={(e) => {
                  const target = e.target as HTMLVideoElement;
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (target && fallback) {
                    target.style.display = 'none';
                    fallback.style.display = 'flex';
                  }
                }}
              >
                <source src={videoUrl} type={doc.mimeType} />
                Your browser does not support the video tag.
              </video>
            ) : null}
            <div className={`${videoUrl ? 'hidden' : 'flex'} absolute inset-0 flex-col items-center justify-center text-white`}>
              <FileVideo size={64} className="mb-4" />
              <p className="text-sm">Video preview</p>
              <p className="text-xs mt-1">{doc.name}</p>
              <p className="text-xs mt-2">Upload a video to preview</p>
            </div>
          </div>
        );

      case 'audio':
        const audioUrl = getDocumentUrlForPreview(doc);
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <FileAudio size={64} className="mb-4 text-pink-500" />
            {audioUrl ? (
              <audio
                controls
                className="mb-4"
                onError={(e) => {
                  const target = e.target as HTMLAudioElement;
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (target && fallback) {
                    target.style.display = 'none';
                    fallback.style.display = 'block';
                  }
                }}
              >
                <source src={audioUrl} type={doc.mimeType} />
                Your browser does not support the audio tag.
              </audio>
            ) : null}
            <p className={`text-sm text-center ${audioUrl ? 'hidden' : 'block'}`}>Audio preview unavailable</p>
            <p className="text-sm text-center">{doc.name}</p>
          </div>
        );

      case 'pdf':
        const pdfUrl = getDocumentUrlForPreview(doc);
        return (
          <div className="w-full h-full flex flex-col p-4">
            <div className="w-full h-full border border-border rounded-lg bg-card shadow-lg flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <File size={20} className="text-red-500" />
                  <span className="text-sm font-medium">PDF Document</span>
                </div>
                <div className="flex gap-2">
                  {pdfUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(pdfUrl, '_blank')}
                    >
                      <Eye size={16} className="mr-2" />
                      Open in New Tab
                    </Button>
                  )}
                  {pdfUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = pdfUrl;
                        link.download = doc.name;
                        link.click();
                      }}
                    >
                      <Download size={16} className="mr-2" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full"
                    title={doc.name}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <File size={64} className="mx-auto mb-4 text-red-500" />
                      <p className="text-sm font-medium">{doc.name}</p>
                      <p className="text-xs mt-2">{formatFileSize(doc.size)}</p>
                      <p className="text-xs mt-4">PDF not available for preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'text':
        const textUrl = getFileUrl(doc);
        return (
          <div className="w-full h-full flex flex-col p-4">
            <div className="flex items-center gap-2 mb-4">
              <FileText size={20} className="text-gray-600" />
              <span className="text-sm font-medium">Text Document</span>
            </div>
            <div className="flex-1 bg-card border border-border rounded-lg p-4 overflow-auto shadow-inner">
              <div className="text-center text-muted-foreground py-8">
                <FileText size={48} className="mx-auto mb-4 text-gray-600" />
                <p className="text-sm font-medium">{doc.name}</p>
                <p className="text-xs mt-2">{formatFileSize(doc.size)}</p>
                {textUrl ? (
                  <div className="mt-4">
                    <p className="text-xs mb-3">Text file ready for download</p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = textUrl;
                        link.download = doc.name;
                        link.click();
                      }}
                      className="bg-gray-600 hover:bg-gray-700"
                    >
                      <Download size={16} className="mr-2" />
                      Download Text
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs mt-4">Demo text file</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'code':
        const codeUrl = getFileUrl(doc);
        return (
          <div className="w-full h-full flex flex-col p-4">
            <div className="flex items-center gap-2 mb-4">
              <Code size={20} className="text-cyan-500" />
              <span className="text-sm font-medium">Code File</span>
            </div>
            <div className="flex-1 bg-gray-900 border rounded-lg p-4 overflow-auto shadow-inner">
              <div className="text-center text-gray-300 py-8">
                <Code size={48} className="mx-auto mb-4 text-cyan-500" />
                <p className="text-sm font-medium">{doc.name}</p>
                <p className="text-xs mt-2">{formatFileSize(doc.size)}</p>
                {codeUrl ? (
                  <div className="mt-4">
                    <p className="text-xs mb-3">Code file ready for download</p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = codeUrl;
                        link.download = doc.name;
                        link.click();
                      }}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      <Download size={16} className="mr-2" />
                      Download Code
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs mt-4">Demo code file</p>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <div className="text-6xl mb-4">
              {getDocumentIcon(doc.type)}
            </div>
            <p className="text-sm">Preview not available</p>
            <p className="text-xs mt-1">{doc.type.toUpperCase()} File</p>
            <p className="text-xs mt-1">{doc.name}</p>
          </div>
        );
    }
  }, [getDocumentIcon, isValidFile]);

  // Check for loading conditions (this now runs only on client after hydration)
  // If we have data in state but no org ID, try to proceed anyway (development fallback)
  const hasDataButNoOrgId = !organizationId && (state.documents?.length > 0 || state.folders?.length > 0);

  console.log('📋 Loading Check Debug:', {
    'mounted': mounted,
    'state.loading': state.loading,
    'isOrgIdMissing': isOrgIdMissing,
    'organizationId': organizationId,
    'authLoaded': authLoaded,
    'userLoaded': userLoaded,
    'authTimeout': authTimeout,
    'hasDataOrTimeout': hasDataOrTimeout,
    'hasDataButNoOrgId': hasDataButNoOrgId,
    'shouldShowLoading': !mounted || (state.loading && !hasDataButNoOrgId && !(state.documents?.length > 0 || state.folders?.length > 0)),
    'stateKeys': Object.keys(state),
    'documentsLength': state.documents?.length,
    'foldersLength': state.folders?.length
  });

  // Show loading only if we're actually loading AND don't have data to display AND component is mounted
  if (!mounted || (state.loading && !hasDataButNoOrgId && !(state.documents?.length > 0 || state.folders?.length > 0))) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Folder className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading...</h2>
          <p className="text-gray-600">Please wait while we set up your workspace.</p>
        </div>
      </div>
    );
  }

  // Render loading/error states without early returns
  if (isLoading && !hasDataOrTimeout) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Folder className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading...</h2>
        <p className="text-gray-600">Please wait while we set up your workspace.</p>
      </div>
    </div>
  }

  if (isNotSignedIn) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-xl font-semibold mb-4">Authentication Required</p>
        <p className="text-sm text-muted-foreground">Please sign in to access this page.</p>
      </div>
    </div>
  }

  if (isMissingUser) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-xl font-semibold mb-4">User Data Missing</p>
        <p className="text-sm text-muted-foreground">Unable to load user information. Please try refreshing the page.</p>
      </div>
    </div>
  }

  // All hooks have been moved to the top to prevent React Hooks order violations

  return (
    <AppLayout>
      <div
        className={`relative h-full transition-all duration-200 ${
          isSystemDragOver ? 'bg-primary/5' : ''
        }`}
        onDragOver={handleSystemDragOver}
        onDragLeave={handleSystemDragLeave}
        onDrop={handleSystemDrop}
        data-folder-id={currentFolderId || UI_CONSTANTS.ROOT_FOLDER_ID}
      >
      {/* System Drag and Drop Overlay - Conditional display based on drag target */}
      {isSystemDragOver && !isDragOverSpecificFolder && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="mx-4 border-2 border-dashed border-primary rounded-lg p-8 bg-background/95 shadow-2xl max-w-md">
            <div className="text-center">
              <Upload className="h-20 w-20 mx-auto mb-6 text-primary" />
              <p className="text-2xl font-medium text-foreground mb-3">Drop files here to upload</p>
              <p className="text-base text-muted-foreground mb-4">
                {dragTargetFolder && dragTargetFolder !== UI_CONSTANTS.ROOT_FOLDER_ID
                  ? `Files will be uploaded to: ${findFolder(dragTargetFolder)?.name || 'Unknown Folder'}`
                  : 'Files will be uploaded to the current folder'
                }
              </p>
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <span>Supports:</span>
                <span className="bg-muted px-3 py-1.5 rounded-full">Documents</span>
                <span className="bg-muted px-3 py-1.5 rounded-full">Images</span>
                <span className="bg-muted px-3 py-1.5 rounded-full">Videos</span>
                <span className="bg-muted px-3 py-1.5 rounded-full">More</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Specific Folder Drop Indicator - Only show when dragging over a specific folder */}
      {isSystemDragOver && isDragOverSpecificFolder && dragTargetFolder && dragTargetFolder !== UI_CONSTANTS.ROOT_FOLDER_ID && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-40 pointer-events-none">
          <div className="mx-4 bg-background/95 border border-primary/50 rounded-lg p-6 shadow-xl max-w-sm">
            <div className="text-center">
              <div className="flex items-center justify-center mb-4">
                <div
                  className="p-3 rounded-lg mr-3"
                  style={{ backgroundColor: `${findFolder(dragTargetFolder)?.color || '#6b7280'}20`, border: `2px solid ${findFolder(dragTargetFolder)?.color || '#6b7280'}` }}
                >
                  <Folder className="h-8 w-8" style={{ color: findFolder(dragTargetFolder)?.color || '#6b7280' }} />
                </div>
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <p className="text-lg font-medium text-foreground mb-2">
                Drop in &quot;{findFolder(dragTargetFolder)?.name || 'Unknown Folder'}&quot;
              </p>
              <p className="text-sm text-muted-foreground">
                Files will be uploaded to this folder
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
          {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Documents</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Organize and manage your documents with AI-powered analysis
              {!isBulkActionMode && currentDocuments.length > 0 && (
                <span className="ml-2 text-xs md:text-sm">• {currentDocuments.length} {currentDocuments.length === 1 ? 'document' : 'documents'}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
              <div className="w-2 h-2 md:w-3 md:h-3 bg-green-500 rounded-full"></div>
              <span>{stats.totalSize}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewFolderDialog(true)}
              className="h-8 w-8 md:h-9 md:w-9 p-0"
            >
              <FolderPlus size={16} className="md:w-[18px] md:h-[18px]" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCreateDocumentModal(true);
                playSound(SoundEffect.NOTIFICATION);
              }}
              className="h-8 md:h-9 px-2 md:px-3"
            >
              <Plus size={16} className="md:w-[18px] md:h-[18px]" />
              <span className="hidden sm:inline ml-1">New Document</span>
            </Button>

          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {renderBreadcrumbs()}
            </div>
          </div>

          {/* Desktop controls - hidden on mobile */}
          <div className="hidden md:flex items-center gap-4">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={handleSearchInput}
                className="pl-10 pr-10 w-80"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X size={16} />
                </Button>
              )}
            </div>

            {/* Sort Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <span className="text-sm">
                    {sortBy === UI_CONSTANTS.SORT_NEWEST && 'Modified: Newest First'}
                    {sortBy === UI_CONSTANTS.SORT_OLDEST && 'Modified: Oldest First'}
                    {sortBy === UI_CONSTANTS.SORT_NAME_ASC && 'Name: A to Z'}
                    {sortBy === UI_CONSTANTS.SORT_NAME_DESC && 'Name: Z to A'}
                    {sortBy === UI_CONSTANTS.SORT_SIZE_ASC && 'Size: Smallest'}
                    {sortBy === UI_CONSTANTS.SORT_SIZE_DESC && 'Size: Largest'}
                    {sortBy === UI_CONSTANTS.SORT_TYPE && 'Type'}
                  </span>
                  <ChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Sort Documents</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_NEWEST)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_NEWEST ? 'font-semibold' : ''}>Modified: Newest First</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_OLDEST)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_OLDEST ? 'font-semibold' : ''}>Modified: Oldest First</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_NAME_ASC)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_NAME_ASC ? 'font-semibold' : ''}>Name: A to Z</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_NAME_DESC)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_NAME_DESC ? 'font-semibold' : ''}>Name: Z to A</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_SIZE_ASC)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_SIZE_ASC ? 'font-semibold' : ''}>Size: Smallest</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_SIZE_DESC)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_SIZE_DESC ? 'font-semibold' : ''}>Size: Largest</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortBy(UI_CONSTANTS.SORT_TYPE)}>
                  <span className={sortBy === UI_CONSTANTS.SORT_TYPE ? 'font-semibold' : ''}>Type</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Filter Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={(filterType !== 'all' || filterSize !== 'all') ? 'default' : 'outline'}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {(filterType !== 'all' || filterSize !== 'all') && (
                    <span className="ml-1 bg-white text-blue-600 text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold">
                      {(filterType !== 'all' ? 1 : 0) + (filterSize !== 'all' ? 1 : 0)}
                    </span>
                  )}
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter Documents</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* File Type Filter */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FileText size={16} className="mr-2" />
                    File Type
                    {filterType !== 'all' && (
                      <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-xs">
                        {filterType}
                      </Badge>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setFilterType('all')}>
                      <span className={filterType === 'all' ? 'font-semibold' : ''}>All Types</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setFilterType('image')}>
                      <FileImage size={14} className="mr-2" />
                      <span className={filterType === 'image' ? 'font-semibold' : ''}>Images</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('video')}>
                      <FileVideo size={14} className="mr-2" />
                      <span className={filterType === 'video' ? 'font-semibold' : ''}>Videos</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('audio')}>
                      <FileAudio size={14} className="mr-2" />
                      <span className={filterType === 'audio' ? 'font-semibold' : ''}>Audio</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('pdf')}>
                      <FileText size={14} className="mr-2" />
                      <span className={filterType === 'pdf' ? 'font-semibold' : ''}>PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('word')}>
                      <FileText size={14} className="mr-2" />
                      <span className={filterType === 'word' ? 'font-semibold' : ''}>Word</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('code')}>
                      <Code size={14} className="mr-2" />
                      <span className={filterType === 'code' ? 'font-semibold' : ''}>Code</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterType('archive')}>
                      <Archive size={14} className="mr-2" />
                      <span className={filterType === 'archive' ? 'font-semibold' : ''}>Archives</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* File Size Filter */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <HardDrive size={16} className="mr-2" />
                    File Size
                    {filterSize !== 'all' && (
                      <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-xs">
                        {filterSize}
                      </Badge>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => setFilterSize('all')}>
                      <span className={filterSize === 'all' ? 'font-semibold' : ''}>All Sizes</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setFilterSize('small')}>
                      <span className={filterSize === 'small' ? 'font-semibold' : ''}>Small (&lt; 1 MB)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterSize('medium')}>
                      <span className={filterSize === 'medium' ? 'font-semibold' : ''}>Medium (1-10 MB)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterSize('large')}>
                      <span className={filterSize === 'large' ? 'font-semibold' : ''}>Large (&gt; 10 MB)</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Quick Filters */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Filter size={16} className="mr-2" />
                    Quick Filters
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => {
                      setSortBy(UI_CONSTANTS.SORT_NEWEST);
                      setFilterType(UI_CONSTANTS.ALL_FILTER);
                      setFilterSize(UI_CONSTANTS.ALL_FILTER);
                    }}>
                      <Calendar size={14} className="mr-2" />
                      Recent Files
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setFilterType(DOCUMENT_TYPES.IMAGE);
                      setSortBy(UI_CONSTANTS.SORT_NEWEST);
                    }}>
                      <Image size={14} className="mr-2" />
                      Recent Images
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setFilterSize('large');
                      setSortBy(UI_CONSTANTS.SORT_SIZE_DESC);
                    }}>
                      <HardDrive size={14} className="mr-2" />
                      Large Files
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Clear Filters */}
                <DropdownMenuItem
                  onClick={() => {
                    setFilterType('all');
                    setFilterSize('all');
                  }}
                  className="text-destructive"
                >
                  <X size={14} className="mr-2" />
                  Clear All Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2">
              <Button
                variant={showRecursive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowRecursive(!showRecursive)}
                className="text-xs"
              >
                {showRecursive ? 'All Files' : 'Current Only'}
              </Button>

              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid3X3 size={18} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  <List size={18} />
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile controls button - only visible on mobile */}
          <div className="md:hidden flex-shrink-0">
            <Sheet open={mobileControlsOpen} onOpenChange={setMobileControlsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                  <SlidersHorizontal size={16} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[320px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle>Search & Controls</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  {/* Search */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search Documents</label>
                    <div className="relative">
                      <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={handleSearchInput}
                        className="pl-10 pr-10"
                      />
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSearch}
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* View Mode */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">View Mode</label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setViewMode('grid')
                          setMobileControlsOpen(false)
                        }}
                        className="flex-1"
                      >
                        <Grid3X3 size={16} className="mr-2" />
                        Grid
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setViewMode('list')
                          setMobileControlsOpen(false)
                        }}
                        className="flex-1"
                      >
                        <List size={16} className="mr-2" />
                        List
                      </Button>
                    </div>
                  </div>

                  {/* Sort Options */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sort By</label>
                    <div className="space-y-1">
                      <Button
                        variant={sortBy === UI_CONSTANTS.SORT_NEWEST ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSortBy(UI_CONSTANTS.SORT_NEWEST)
                          setMobileControlsOpen(false)
                        }}
                        className="w-full justify-start"
                      >
                        Modified: Newest First
                      </Button>
                      <Button
                        variant={sortBy === UI_CONSTANTS.SORT_OLDEST ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSortBy(UI_CONSTANTS.SORT_OLDEST)
                          setMobileControlsOpen(false)
                        }}
                        className="w-full justify-start"
                      >
                        Modified: Oldest First
                      </Button>
                      <Button
                        variant={sortBy === UI_CONSTANTS.SORT_NAME_ASC ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSortBy(UI_CONSTANTS.SORT_NAME_ASC)
                          setMobileControlsOpen(false)
                        }}
                        className="w-full justify-start"
                      >
                        Name: A to Z
                      </Button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filters</label>
                    <div className="space-y-1">
                      <Button
                        variant={filterType === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setFilterType('all')
                        }}
                        className="w-full justify-start"
                      >
                        All Types
                      </Button>
                      <Button
                        variant={filterType === DOCUMENT_TYPES.PDF ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setFilterType(DOCUMENT_TYPES.PDF)
                        }}
                        className="w-full justify-start"
                      >
                        <FileText size={14} className="mr-2" />
                        PDF Documents
                      </Button>
                      <Button
                        variant={filterType === DOCUMENT_TYPES.IMAGE ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setFilterType(DOCUMENT_TYPES.IMAGE)
                        }}
                        className="w-full justify-start"
                      >
                        <FileImage size={14} className="mr-2" />
                        Images
                      </Button>
                    </div>
                  </div>

                  {/* Recursive Toggle */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">View Files From</label>
                    <Button
                      variant={showRecursive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowRecursive(!showRecursive)}
                      className="w-full"
                    >
                      {showRecursive ? 'All Subfolders' : 'Current Folder Only'}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>


        {/* Content */}
        <div>
          {/* Search Results */}
          {isSearching && searchQuery && (
            <div className="mb-8">
              <h2 className="text-lg font-medium mb-4">
                Search Results for &quot;{searchQuery}&quot; ({searchResults.length} found)
              </h2>

              {searchResults.length === 0 ? (
                <div className="text-center py-12 animate-in fade-in duration-300">
                  <Search size={48} className="mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No documents found matching &quot;{searchQuery}&quot;</p>
                  <p className="text-sm text-muted-foreground mt-2">Try a different search term</p>
                  <div className="flex gap-2 justify-center mt-4">
                    <Button onClick={() => handleSearchChange('')} variant="outline" size="sm">
                      Clear Search
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {searchResults.map(document => (
                    <div
                      key={`${document.id}-${document.folderId || UI_CONSTANTS.ROOT_FOLDER_ID}`}
                      className={`bg-card border rounded-lg p-4 hover:shadow-md transition-shadow ${
                        selectedDocuments.has(document.id) ? 'ring-2 ring-primary' : ''
                      } ${
                        isBulkActionMode && !isDocumentReadyForAnalysis(document) ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Selection Checkbox for search results */}
                        {isBulkActionMode && isDocumentReadyForAnalysis(document) && (
                          <div className="flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedDocuments.has(document.id)}
                              onChange={() => toggleDocumentSelection(document.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                            />
                          </div>
                        )}
                        <Link
                          href={`/documents/${document.id}`}
                          className="flex items-center gap-4 flex-1 cursor-pointer"
                          onClick={(e) => {
                            if (isBulkActionMode) {
                              e.preventDefault();
                              toggleDocumentSelection(document.id);
                            }
                          }}
                        >
                          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {document.mimeType?.startsWith('image/') && getDocumentUrl(document) ? (
                              <AuthenticatedImage
                                document={document}
                                alt={document.name}
                                className="w-full h-full object-cover"
                              />
                            ) : document.mimeType?.startsWith('video/') && getDocumentUrl(document) ? (
                              <video
                                className="w-full h-full object-cover"
                                controls
                                preload="metadata"
                                onClick={(e) => e.stopPropagation()}
                                onError={(e) => {
                                  const target = e.target as HTMLVideoElement;
                                  const fallback = target.nextElementSibling as HTMLElement;
                                  if (target && fallback) {
                                    target.style.display = 'none';
                                    fallback.style.display = 'flex';
                                  }
                                }}
                              >
                                <source src={getDocumentUrl(document) ?? undefined} type={document.mimeType} />
                              </video>
                            ) : document.mimeType?.startsWith('audio/') && getDocumentUrl(document) ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-pink-50 p-3">
                                <FileAudio size={24} className="text-pink-500 mb-2" />
                                <audio
                                  controls
                                  className="w-full max-w-xs"
                                  preload="metadata"
                                  onClick={(e) => e.stopPropagation()}
                                  onError={(e) => {
                                    const target = e.target as HTMLAudioElement;
                                    const fallback = target.nextElementSibling as HTMLElement;
                                    if (target && fallback) {
                                      target.style.display = 'none';
                                      fallback.style.display = 'flex';
                                    }
                                  }}
                                >
                                  <source src={getDocumentUrl(document) ?? undefined} type={document.mimeType} />
                                </audio>
                              </div>
                            ) : null}
                            <div className={`${((document.mimeType?.startsWith('image/') || document.mimeType?.startsWith('video/') || document.mimeType?.startsWith('audio/')) && getDocumentUrl(document)) ? 'hidden' : 'flex'} w-full h-full items-center justify-center`}>
                              {getDocumentIcon(document.type)}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium truncate">{document.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{formatFileSize(document.size)}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Folder size={12} className="text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{document.folderPath}</span>
                            </div>
                            <div className="flex gap-1 mt-2">
                              {!document.filePath?.startsWith('/documents/') && getFileTypeBadge(document.type)}
                              {document.tags?.slice(0, 2).map((tag, index) => (
                                <Badge key={`${document.id}-${tag}-${index}`} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </Link>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToDocumentLocation(document);
                            }}
                          >
                            Go to Location
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDocumentModal(document);
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Regular folder/document view - only show when not searching */}
          {!isSearching && (
            <>
              {/* Folders Grid */}
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mb-8">
                {currentFolders.map(folder => {
                  const stats = getFolderStats(folder.id);
                  return (
                    <div
                      key={folder.id}
                      className="group relative"
                      data-folder-id={folder.id}
                      onDragOver={(e) => handleDragOver(e, folder.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, folder.id)}
                    >
                      <div
                        onClick={() => navigateToFolder(folder.id)}
                        draggable={!folder.isProtected}
                        onDragStart={(e) => {
                          if (folder.isProtected) {
                            e.preventDefault();
                            return;
                          }
                          e.stopPropagation();
                          handleFolderDragStart(e, folder);
                        }}
                        onDragEnd={handleDragEnd}
                        className={`bg-muted rounded-lg p-4 hover:bg-muted/80 transition-all duration-200 cursor-pointer border-l-4 ${
                          dragOverFolder === folder.id ? 'bg-blue-100 border-2 border-blue-300' : ''
                        } ${
                          draggedFolder?.id === folder.id
                            ? 'opacity-50 scale-95 shadow-lg ring-2 ring-blue-500'
                            : ''
                        }`}
                        style={{
                          borderLeftColor: folder.color || '#6b7280',
                          cursor: folder.isProtected ? 'pointer' : (draggedFolder?.id === folder.id ? 'grabbing' : 'grab')
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Folder size={20} style={{ color: folder.color || '#6b7280' }} />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                              >
                                <MoreHorizontal size={16} className="text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom" className="w-48">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditFolder(folder);
                                }}
                              >
                                <Edit3 size={14} className="mr-2" />
                                {folder.isProtected ? 'Edit Folder Settings' : 'Edit Folder'}
                              </DropdownMenuItem>

                              {!folder.isProtected && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <Move size={14} className="mr-2" />
                                    Move to Folder
                                  </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      moveFolder(folder.id, null);
                                    }}
                                    disabled={!folder.parentId}
                                  >
                                    <HardDrive size={14} className="mr-2" />
                                    Root
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {buildFolderHierarchy(
                                    state.folders.filter(f => f.id !== folder.id && f.parentId !== folder.id)
                                  ).map(targetFolder => (
                                      <DropdownMenuItem
                                        key={targetFolder.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveFolder(folder.id, targetFolder.id);
                                        }}
                                        disabled={targetFolder.id === folder.parentId}
                                        className="relative"
                                      >
                                        <div
                                          className="flex items-center w-full"
                                          style={{ paddingLeft: `${targetFolder.level * 16}px` }}
                                        >
                                          {targetFolder.level > 0 && (
                                            <div className="flex items-center mr-1">
                                              <div
                                                className="w-3 h-3 border-l-2 border-b-2 border-gray-300 mr-1"
                                                style={{
                                                  borderBottomLeftRadius: '3px',
                                                  marginTop: '-6px',
                                                  marginBottom: '6px'
                                                }}
                                              />
                                            </div>
                                          )}
                                          <Folder
                                            size={14}
                                            className="mr-2 flex-shrink-0"
                                            style={{ color: targetFolder.color || '#6b7280' }}
                                          />
                                          <span className="truncate">{targetFolder.name}</span>
                                        </div>
                                      </DropdownMenuItem>
                                    ))
                                  }
                                </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}

                              {!folder.isProtected && <DropdownMenuSeparator />}

                              {!folder.isProtected && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openFolderDeleteModal(folder);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 size={14} className="mr-2" />
                                    Delete Folder
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-sm font-medium truncate">{folder.name}</p>
                        {folder.description && (
                          <p className="text-xs text-muted-foreground truncate mb-1">{folder.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {stats.totalDocuments} doc{stats.totalDocuments !== 1 ? 's' : ''} • {stats.totalFolders} folder{stats.totalFolders !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Add New Folder Button */}
                <div className="group relative">
                  <Button
                    variant="outline"
                    onClick={() => setShowNewFolderDialog(true)}
                    className="w-full h-full bg-background border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50 transition-colors cursor-pointer min-h-[100px]"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <FolderPlus size={20} className="text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">New Folder</p>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Documents Section */}
              <div className="mb-4">
                <h2 className="text-lg font-medium mb-4">
                  {showRecursive
                    ? (currentFolderId ? `All documents in ${currentFolder?.name} and subfolders` : 'All documents')
                    : (currentFolderId ? 'Documents in this folder' : 'Documents')
                  }
                </h2>

                {currentDocuments.length === 0 ? (
                  <div className="text-center py-12 animate-in fade-in duration-500">
                    <Folder size={48} className="mx-auto text-muted-foreground mb-4 animate-bounce" />
                    <p className="text-muted-foreground">
                      {currentFolderId ? 'No documents in this folder yet' : 'No documents uploaded yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Click &quot;Create Document&quot; to add documents or drag & drop files here
                    </p>
                    <div className="flex gap-3 justify-center mt-6">
                      <Button onClick={() => setShowCreateDocumentModal(true)} className="hover:scale-105 transition-transform">
                        <Plus className="mr-2 h-4 w-4" />
                        Create Document
                      </Button>
                      {!currentFolderId && (
                        <Button variant="outline" onClick={() => setShowNewFolderDialog(true)} className="hover:scale-105 transition-transform">
                          <FolderPlus className="mr-2 h-4 w-4" />
                          Create Folder
                        </Button>
                      )}
                    </div>
                    <div className="mt-6 text-xs text-gray-500">
                      <p>💡 Tip: Use keyboard shortcuts for faster navigation</p>
                      <p className="mt-1"><kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Cmd+A</kbd> to select all documents in bulk mode</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                        {currentDocuments.map(document => (
                          <div
                            key={document.id}
                            className={`group relative bg-card rounded-lg overflow-hidden shadow-sm border hover:shadow-lg hover:border-primary/20 transition-all duration-200 ${
                              draggedDocument?.id === document.id
                                ? 'opacity-50 scale-95 shadow-lg ring-2 ring-blue-500'
                                : ''
                            } ${
                              selectedDocuments.has(document.id) ? 'ring-2 ring-primary shadow-primary/25' : ''
                            } ${
                              isBulkActionMode && !isDocumentReadyForAnalysis(document) ? 'opacity-40' : ''
                            }`}
                            draggable={!isBulkActionMode}
                            onDragStart={(e) => !isBulkActionMode && handleDocumentDragStart(e, document)}
                            onDragEnd={handleDragEnd}
                            style={{ cursor: isBulkActionMode ? 'pointer' : (draggedDocument?.id === document.id ? 'grabbing' : 'grab') }}
                          >
                            {/* Selection Checkbox */}
                            {isBulkActionMode && isDocumentReadyForAnalysis(document) && (
                              <div className="absolute top-2 left-2 z-10">
                                <input
                                  type="checkbox"
                                  checked={selectedDocuments.has(document.id)}
                                  onChange={() => toggleDocumentSelection(document.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                />
                              </div>
                            )}
                            <Link
                              href={`/documents/${document.id}`}
                              className="block cursor-pointer"
                              onClick={(e) => {
                                if (isBulkActionMode) {
                                  e.preventDefault();
                                  if (isDocumentReadyForAnalysis(document)) {
                                    toggleDocumentSelection(document.id);
                                  }
                                }
                              }}
                            >
                              <div className="aspect-video bg-muted relative flex items-center justify-center overflow-hidden">
                                {document.mimeType?.startsWith('image/') ? (
                                  <AuthenticatedImage
                                    document={document}
                                    alt={document.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : document.mimeType?.startsWith('video/') && getDocumentUrl(document) ? (
                                  <video
                                    className="w-full h-full object-cover"
                                    controls
                                    preload="metadata"
                                    onClick={(e) => e.stopPropagation()}
                                    onError={(e) => {
                                      const target = e.target as HTMLVideoElement;
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (target && fallback) {
                                        target.style.display = 'none';
                                        fallback.style.display = 'flex';
                                      }
                                    }}
                                  >
                                    <source src={getDocumentUrl(document) ?? undefined} type={document.mimeType} />
                                  </video>
                                ) : document.mimeType?.startsWith('audio/') && getDocumentUrl(document) ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center bg-pink-50 p-4">
                                    <FileAudio size={40} className="text-pink-500 mb-3" />
                                    <audio
                                      controls
                                      className="w-full max-w-xs"
                                      preload="metadata"
                                      onClick={(e) => e.stopPropagation()}
                                      onError={(e) => {
                                        const target = e.target as HTMLAudioElement;
                                        const fallback = target.nextElementSibling as HTMLElement;
                                        if (target && fallback) {
                                          target.style.display = 'none';
                                          fallback.style.display = 'flex';
                                        }
                                      }}
                                    >
                                      <source src={getDocumentUrl(document) ?? undefined} type={document.mimeType} />
                                    </audio>
                                  </div>
                                ) : (document.name.toLowerCase().endsWith('.csv') ||
                                     document.name.toLowerCase().endsWith('.txt') ||
                                     document.name.toLowerCase().endsWith('.pdf') ||
                                     document.name.toLowerCase().endsWith('.doc') ||
                                     document.name.toLowerCase().endsWith('.docx')) &&
                                     !document.filePath?.startsWith('/documents/') ? (
                                  <CanvasPreviewWithFetch document={document} className="w-full h-full" />
                                ) : null}
                                <div className={`${((document.mimeType?.startsWith('image/') || document.mimeType?.startsWith('video/') || document.mimeType?.startsWith('audio/')) && getDocumentUrl(document)) || ((document.name.toLowerCase().endsWith('.csv') || document.name.toLowerCase().endsWith('.txt') || document.name.toLowerCase().endsWith('.pdf') || document.name.toLowerCase().endsWith('.doc') || document.name.toLowerCase().endsWith('.docx')) && !document.filePath?.startsWith('/documents/')) ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-4xl`}>
                                  {document.filePath?.startsWith('/documents/') ? (
                                    <div className="flex flex-col items-center gap-2">
                                      {getDocumentIcon(document.type)}
                                      <span className="text-xs text-muted-foreground">No file</span>
                                    </div>
                                  ) : (
                                    getDocumentIcon(document.type)
                                  )}
                                </div>
                              </div>
                              <div className="p-3">
                                <p className="text-sm font-medium truncate">{document.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-xs text-muted-foreground">{formatFileSize(document.size)}</p>
                                  {!document.filePath?.startsWith('/documents/') && getFileTypeBadge(document.type)}
                                  {document.folderPath && (
                                    <span className="text-xs text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                                      {document.folderPath}
                                    </span>
                                  )}
                                </div>

                                {/* Processing Status */}
                                {(() => {
                                  const processingStatus = (document.processing as any)?.currentStatus;
                                  return processingStatus && processingStatus !== 'COMPLETED' && (
                                    <div className="mt-2">
                                      <ProcessingStatus
                                        status={processingStatus}
                                        variant="compact"
                                        showProgress={false}
                                        className="max-w-fit"
                                      />
                                    </div>
                                  );
                                })()}

                              </div>
                            </Link>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background rounded-full p-1 shadow h-6 w-6 inline-flex items-center justify-center hover:bg-accent"
                                >
                                  <MoreHorizontal size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom">
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/documents/${document.id}`}
                                    className="flex items-center gap-2"
                                  >
                                    <ExternalLink size={16} />
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDocumentModal(document);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Eye size={16} />
                                  Quick Preview
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                                    <Move size={16} />
                                    Move to Folder
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveDocument(document.id, UI_CONSTANTS.ROOT_FOLDER_ID);
                                      }}
                                      disabled={!document.folderId}
                                    >
                                      <HardDrive size={14} className="mr-2" />
                                      Documents (Root)
                                    </DropdownMenuItem>
                                    {buildFolderHierarchy(state.folders).map(folder => (
                                      <DropdownMenuItem
                                        key={folder.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveDocument(document.id, folder.id);
                                        }}
                                        disabled={folder.id === document.folderId}
                                        className="relative"
                                      >
                                        <div
                                          className="flex items-center w-full"
                                          style={{ paddingLeft: `${folder.level * 16}px` }}
                                        >
                                          {folder.level > 0 && (
                                            <div className="flex items-center mr-1">
                                              <div
                                                className="w-3 h-3 border-l-2 border-b-2 border-gray-300 mr-1"
                                                style={{
                                                  borderBottomLeftRadius: '3px',
                                                  marginTop: '-6px',
                                                  marginBottom: '6px'
                                                }}
                                              />
                                            </div>
                                          )}
                                          <Folder size={14} className="mr-2 flex-shrink-0" style={{ color: folder.color || '#6b7280' }} />
                                          <span className="truncate">{folder.name}</span>
                                        </div>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Add download functionality
                                    const url = getDocumentUrl(document);
                                    if (url) {
                                      const link = window.document.createElement('a');
                                      link.href = url;
                                      link.download = document.name;
                                      link.click();
                                      URL.revokeObjectURL(url);
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Download size={16} />
                                  Download
                                </DropdownMenuItem>
                                {((document.processing as any)?.currentStatus !== 'PROCESSING') && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAnalyzeDocument(document);
                                      }}
                                      className="flex items-center gap-2"
                                    >
                                      <Brain size={16} />
                                      AI Analysis
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {canCancelProcessing(document) && (
                                  <DropdownMenuItem
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        notify.info('Cancelling', `Cancelling processing for "${document.name}"...`)

                                        const result = await cancelDocumentProcessing(document.id)

                                        if (result.success) {
                                          notify.success('Processing Cancelled', result.message)
                                          playSound(SoundEffect.SUCCESS)
                                          // Refresh documents
                                          window.location.reload()
                                        } else {
                                          notify.error('Cancel Failed', result.message || 'Failed to cancel processing')
                                          playSound(SoundEffect.ERROR)
                                        }
                                      } catch (caughtError) {
      const error = normalizeError(caughtError);
                                        console.error('Error cancelling document processing:', error)
                                        notify.error('Cancel Failed', 'Failed to cancel processing. Please try again.')
                                        playSound(SoundEffect.ERROR)
                                      }
                                    }}
                                    className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <X size={16} />
                                    Cancel Processing
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteModal(document);
                                  }}
                                  className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 size={16} />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-card rounded-lg border">
                        {currentDocuments.map((document, index) => (
                          <div
                            key={document.id}
                            className={`group relative transition-all duration-200 ${
                              index !== currentDocuments.length - 1 ? 'border-b' : ''
                            } ${
                              draggedDocument?.id === document.id
                                ? 'opacity-50 bg-blue-50 border-blue-200'
                                : ''
                            } ${
                              selectedDocuments.has(document.id) ? 'bg-primary/5' : ''
                            } ${
                              isBulkActionMode && !isDocumentReadyForAnalysis(document) ? 'opacity-40' : ''
                            }`}
                            draggable={!isBulkActionMode}
                            onDragStart={(e) => !isBulkActionMode && handleDocumentDragStart(e, document)}
                            onDragEnd={handleDragEnd}
                            style={{ cursor: isBulkActionMode ? 'pointer' : (draggedDocument?.id === document.id ? 'grabbing' : 'grab') }}
                          >
                            <Link
                              href={`/documents/${document.id}`}
                              className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer"
                              onClick={(e) => {
                                if (isBulkActionMode) {
                                  e.preventDefault();
                                  if (isDocumentReadyForAnalysis(document)) {
                                    toggleDocumentSelection(document.id);
                                  }
                                }
                              }}
                            >
                              {/* Selection Checkbox */}
                              {isBulkActionMode && isDocumentReadyForAnalysis(document) && (
                                <div className="flex-shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedDocuments.has(document.id)}
                                    onChange={() => toggleDocumentSelection(document.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                  />
                                </div>
                              )}
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center overflow-hidden">
                                {document.mimeType?.startsWith('image/') ? (
                                  <AuthenticatedImage
                                    document={document}
                                    alt={document.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : document.mimeType?.startsWith('video/') && getDocumentUrl(document) ? (
                                  <video
                                    className="w-full h-12 object-cover"
                                    controls
                                    preload="metadata"
                                    onClick={(e) => e.stopPropagation()}
                                    onError={(e) => {
                                      const target = e.target as HTMLVideoElement;
                                      const fallback = target.nextElementSibling as HTMLElement;
                                      if (target && fallback) {
                                        target.style.display = 'none';
                                        fallback.style.display = 'flex';
                                      }
                                    }}
                                  >
                                    <source src={getDocumentUrl(document) ?? undefined} type={document.mimeType} />
                                  </video>
                                ) : document.mimeType?.startsWith('audio/') && getDocumentUrl(document) ? (
                                  <div className="w-12 h-12 bg-pink-50 rounded flex items-center justify-center">
                                    <FileAudio size={20} className="text-pink-500" />
                                  </div>
                                ) : (document.name.toLowerCase().endsWith('.csv') || document.name.toLowerCase().endsWith('.txt')) && document.originalFile && !document.filePath?.startsWith('/documents/') ? (
                                  <div className="w-12 h-12 rounded overflow-hidden">
                                    <ResponsiveCanvasPreview file={document.originalFile} fileName={document.name} className="w-full h-full" />
                                  </div>
                                ) : null}
                                <div className={`${((document.mimeType?.startsWith('image/') || document.mimeType?.startsWith('video/') || document.mimeType?.startsWith('audio/')) && getDocumentUrl(document)) || ((document.name.toLowerCase().endsWith('.csv') || document.name.toLowerCase().endsWith('.txt')) && document.originalFile && !document.filePath?.startsWith('/documents/')) ? 'hidden' : 'flex'} w-full h-full items-center justify-center`}>
                                  {document.filePath?.startsWith('/documents/') ? (
                                    <div className="flex flex-col items-center gap-1">
                                      {getDocumentIcon(document.type)}
                                      <span className="text-xs text-muted-foreground">No file</span>
                                    </div>
                                  ) : (
                                    getDocumentIcon(document.type)
                                  )}
                                </div>
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{document.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-xs text-muted-foreground">{formatFileSize(document.size)}</p>
                                  {!document.filePath?.startsWith('/documents/') && getFileTypeBadge(document.type)}
                                  {document.folderPath && (
                                    <span className="text-xs text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                                      {document.folderPath}
                                    </span>
                                  )}
                                  {document.tags?.slice(0, 2).map((tag, tagIndex) => (
                                    <Badge key={`${document.id}-${tag}-${tagIndex}`} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </Link>

                            {/* Audio Player for List View */}
                            {document.mimeType?.startsWith('audio/') && getDocumentUrl(document) && (
                              <div className="px-4 pb-3 -mt-1">
                                <audio
                                  controls
                                  className="w-full max-w-sm h-8"
                                  preload="metadata"
                                  onClick={(e) => e.stopPropagation()}
                                  onError={(e) => {
                                    const target = e.target as HTMLAudioElement;
                                    if (target) {
                                      target.style.display = 'none';
                                    }
                                  }}
                                  style={{ height: '32px' }}
                                >
                                  <source src={getDocumentUrl(document) ?? undefined} type={document.mimeType} />
                                </audio>
                              </div>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal size={16} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom">
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/documents/${document.id}`}
                                    className="flex items-center gap-2"
                                  >
                                    <ExternalLink size={16} />
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDocumentModal(document);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Eye size={16} />
                                  Quick Preview
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger className="flex items-center gap-2">
                                    <Move size={16} />
                                    Move to Folder
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveDocument(document.id, UI_CONSTANTS.ROOT_FOLDER_ID);
                                      }}
                                      disabled={!document.folderId}
                                    >
                                      <HardDrive size={14} className="mr-2" />
                                      Documents (Root)
                                    </DropdownMenuItem>
                                    {buildFolderHierarchy(state.folders).map(folder => (
                                      <DropdownMenuItem
                                        key={folder.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMoveDocument(document.id, folder.id);
                                        }}
                                        disabled={folder.id === document.folderId}
                                        className="relative"
                                      >
                                        <div
                                          className="flex items-center w-full"
                                          style={{ paddingLeft: `${folder.level * 16}px` }}
                                        >
                                          {folder.level > 0 && (
                                            <div className="flex items-center mr-1">
                                              <div
                                                className="w-3 h-3 border-l-2 border-b-2 border-gray-300 mr-1"
                                                style={{
                                                  borderBottomLeftRadius: '3px',
                                                  marginTop: '-6px',
                                                  marginBottom: '6px'
                                                }}
                                              />
                                            </div>
                                          )}
                                          <Folder size={14} className="mr-2 flex-shrink-0" style={{ color: folder.color || '#6b7280' }} />
                                          <span className="truncate">{folder.name}</span>
                                        </div>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Add download functionality
                                    const url = getDocumentUrl(document);
                                    if (url) {
                                      const link = window.document.createElement('a');
                                      link.href = url;
                                      link.download = document.name;
                                      link.click();
                                      URL.revokeObjectURL(url);
                                    }
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Download size={16} />
                                  Download
                                </DropdownMenuItem>
                                {((document.processing as any)?.currentStatus !== 'PROCESSING') && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAnalyzeDocument(document);
                                      }}
                                      className="flex items-center gap-2"
                                    >
                                      <Brain size={16} />
                                      AI Analysis
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {canCancelProcessing(document) && (
                                  <DropdownMenuItem
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        notify.info('Cancelling', `Cancelling processing for "${document.name}"...`)

                                        const result = await cancelDocumentProcessing(document.id)

                                        if (result.success) {
                                          notify.success('Processing Cancelled', result.message)
                                          playSound(SoundEffect.SUCCESS)
                                          // Refresh documents
                                          window.location.reload()
                                        } else {
                                          notify.error('Cancel Failed', result.message || 'Failed to cancel processing')
                                          playSound(SoundEffect.ERROR)
                                        }
                                      } catch (caughtError) {
      const error = normalizeError(caughtError);
                                        console.error('Error cancelling document processing:', error)
                                        notify.error('Cancel Failed', 'Failed to cancel processing. Please try again.')
                                        playSound(SoundEffect.ERROR)
                                      }
                                    }}
                                    className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <X size={16} />
                                    Cancel Processing
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDeleteModal(document);
                                  }}
                                  className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 size={16} />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept="*/*"
      />

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">
              Create New Folder
              {currentFolderId && (
                <span className="text-sm font-normal text-muted-foreground block">
                  in {currentFolder?.name || 'Documents'}
                </span>
              )}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <Input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Description (optional)</label>
                <Input
                  type="text"
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  placeholder="Folder description"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Color</label>
                <div className="grid grid-cols-5 gap-2">
                  {folderColors.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewFolderColor(color.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newFolderColor === color.value ? 'border-black scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1"
              >
                Create
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName('');
                  setNewFolderDescription('');
                  setNewFolderColor('#6b7280');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Folder Dialog */}
      {showEditFolderDialog && editingFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">
              Edit Folder
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                {editingFolder?.isProtected ? (
                  <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
                    {newFolderName} <span className="text-xs">(System folder - name cannot be changed)</span>
                  </div>
                ) : (
                  <Input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    onKeyPress={(e) => e.key === 'Enter' && handleUpdateFolder()}
                    autoFocus
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Description (optional)</label>
                <Input
                  type="text"
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  placeholder="Folder description"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Color</label>
                <div className="grid grid-cols-5 gap-2">
                  {folderColors.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewFolderColor(color.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        newFolderColor === color.value ? 'border-black scale-110' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleUpdateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1"
              >
                Update
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditFolderDialog(false);
                  setEditingFolder(null);
                  setNewFolderName('');
                  setNewFolderDescription('');
                  setNewFolderColor('#6b7280');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Document Details Modal */}
      {showDocumentModal && selectedDocument && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={handleModalBackdropClick}
        >
          <div className="bg-background rounded-lg overflow-hidden flex flex-col md:flex-row max-w-4xl h-[80vh] w-full">
            {/* Document Preview */}
            <div className="flex-1 bg-muted flex items-center justify-center min-w-0 min-h-[200px] md:min-h-0">
              {renderFilePreview(selectedDocument)}
            </div>

            {/* Details Panel */}
            <div className="w-full md:w-96 flex flex-col border-t md:border-t-0 md:border-l">
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between shrink-0">
                <h3 className="text-lg font-semibold truncate mr-2">
                  {selectedDocument.name}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeDocumentModal}
                >
                  <X size={20} />
                </Button>
              </div>

              {/* Document Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Document Location as Subtitle */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Folder size={14} />
                  <span>
                    {folderPath.length > 0
                      ? 'Documents' + folderPath.map(p => ' > ' + p.name).join('')
                      : 'Documents (Root)'}
                  </span>
                </div>

                {/* File Stats - Horizontal Layout */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/20 rounded-lg">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Size</div>
                    <div className="text-lg font-bold">{formatFileSize(selectedDocument.size)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">File Type</div>
                    <div className="flex justify-center">{!selectedDocument.filePath?.startsWith('/documents/') ? getFileTypeBadge(selectedDocument.type) : <span className="text-xs text-muted-foreground">No file</span>}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">Uploaded</div>
                    <div className="text-lg font-bold whitespace-nowrap">{new Date(selectedDocument.uploadDate).toLocaleDateString('en-US', {
                      year: '2-digit',
                      month: 'short',
                      day: 'numeric'
                    })}</div>
                  </div>
                </div>

                {/* Editable Document Name */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">File Name</label>
                  {isEditingMetadata ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editedFileName ? editedFileName.replace(/\.[^/.]+$/, '') : ''}
                        onChange={(e) => {
                          const extension = selectedDocument.name.match(/\.[^/.]+$/);
                          setEditedFileName(e.target.value + (extension ? extension[0] : ''));
                        }}
                        className="text-sm flex-1"
                        placeholder="Enter file name..."
                      />
                      {(() => {
                        const extension = selectedDocument.name.match(/\.[^/.]+$/);
                        return extension ? (
                          <span className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                            {extension[0]}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between group">
                      <p className="text-sm break-words flex-1">{selectedDocument.name}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={startEditingMetadata}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                      >
                        <Edit3 size={14} />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Editable Tags */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide mb-3 block">Tags</label>

                  {isEditingMetadata ? (
                    <div className="space-y-3">
                      {/* New tag input */}
                      <div className="flex gap-2">
                        <Input
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyPress={handleTagInputKeyPress}
                          placeholder="Type tag name and press Enter..."
                          className="text-sm flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addTag}
                          disabled={!newTagInput.trim() || editedTags.includes(newTagInput.trim())}
                          className="px-3"
                        >
                          Add
                        </Button>
                      </div>

                      {/* Existing tags as badges */}
                      <div className="flex flex-wrap gap-2">
                        {editedTags.map((tag, index) => (
                          <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-xs">
                            <span>{tag}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTag(tag)}
                              className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive"
                            >
                              <X size={10} />
                            </Button>
                          </div>
                        ))}

                        {editedTags.length === 0 && (
                          <span className="text-sm text-muted-foreground italic">No tags yet. Type above to add tags.</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="group">
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedDocument.tags?.length > 0 ? (
                          selectedDocument.tags.map((tag, index) => (
                            <Badge key={`${selectedDocument.id}-${tag}-${index}`} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No tags</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={startEditingMetadata}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8"
                      >
                        <Edit3 size={14} className="mr-2" />
                        Edit Details
                      </Button>
                    </div>
                  )}
                </div>

                {/* Document Metadata - Uses new Document interface */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide mb-3 block">Document Information</label>
                  <div className="space-y-3">
                    {selectedDocument.documentType && (
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Document Type</label>
                        <Badge variant="outline" className="text-xs">
                          {selectedDocument.documentType}
                        </Badge>
                      </div>
                    )}

                    {selectedDocument.securityClassification && (
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Security Classification</label>
                        <Badge variant="outline" className="text-xs">
                          {selectedDocument.securityClassification}
                        </Badge>
                      </div>
                    )}

                    {selectedDocument.workflowStatus && (
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Workflow Status</label>
                        <Badge variant="outline" className="text-xs">
                          {selectedDocument.workflowStatus}
                        </Badge>
                      </div>
                    )}

                    {selectedDocument.description && (
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">Description</label>
                        <p className="text-sm break-words">{selectedDocument.description}</p>
                      </div>
                    )}

                    {selectedDocument.entities.entities.some(entity => entity.type === 'NAICS_CODE') && (
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wide">NAICS Codes</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedDocument.entities.entities.filter(entity => entity.type === 'NAICS_CODE').map(entity => (
                            <Badge key={entity.id} variant="outline" className="text-xs">
                              {entity.text}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions - Fixed at bottom */}
              <div className="border-t p-4 space-y-3 shrink-0">
                {isEditingMetadata ? (
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      onClick={saveMetadata}
                      className="flex-1"
                    >
                      <Save size={14} className="mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={cancelEditingMetadataMain}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Move to Folder Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                        >
                          <Move size={16} className="mr-2" />
                          Move to Folder
                          <ChevronDown size={14} className="ml-auto" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem
                          onClick={() => handleMoveDocument(selectedDocument.id, UI_CONSTANTS.ROOT_FOLDER_ID)}
                          disabled={!currentFolderId}
                        >
                          <HardDrive size={14} className="mr-2" />
                          Root
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {buildFolderHierarchy(state.folders).map(folder => (
                          <DropdownMenuItem
                            key={folder.id}
                            onClick={() => handleMoveDocument(selectedDocument.id, folder.id)}
                            disabled={folder.id === currentFolderId}
                            className="relative"
                          >
                            <div
                              className="flex items-center w-full"
                              style={{ paddingLeft: `${folder.level * 20}px` }}
                            >
                              {folder.level > 0 && (
                                <div className="flex items-center mr-1">
                                  <div
                                    className="w-4 h-4 border-l-2 border-b-2 border-gray-300 mr-1"
                                    style={{
                                      borderBottomLeftRadius: '4px',
                                      marginTop: '-8px',
                                      marginBottom: '8px'
                                    }}
                                  />
                                </div>
                              )}
                              <Folder
                                size={14}
                                className="mr-2 flex-shrink-0"
                                style={{ color: folder.color || '#6b7280' }}
                              />
                              <span className="truncate">{folder.name}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Download size={16} className="mr-2" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Share size={16} className="mr-2" />
                        Share
                      </Button>
                    </div>

                    <Button
                      variant="destructive"
                      onClick={() => {
                        closeDocumentModal();
                        openDeleteModal(selectedDocument);
                      }}
                      className="w-full justify-start"
                    >
                      <Trash2 size={16} className="mr-2" />
                      Delete Document
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        document={documentToDelete}
        isDeleting={isDeleting}
      />

      {/* Folder Delete Confirmation Modal */}
      <FolderDeleteConfirmationModal
        isOpen={showFolderDeleteModal}
        onClose={closeFolderDeleteModal}
        onConfirm={confirmFolderDelete}
        folder={folderToDelete}
        isDeleting={isDeletingFolder}
        documentCount={folderToDelete ? getFolderDocuments(folderToDelete.id).length : 0}
        subfolderCount={folderToDelete ? getFolderChildren(folderToDelete.id).length : 0}
      />

      {/* Folder Delete Info Modal */}
      <FolderDeleteInfoModal
        isOpen={showFolderInfoModal}
        onClose={closeFolderInfoModal}
        folder={folderToDelete}
        documentCount={folderToDelete ? getFolderDocuments(folderToDelete.id).length : 0}
        subfolderCount={folderToDelete ? getFolderChildren(folderToDelete.id).length : 0}
      />

      {/* Create Document Modal */}
      <CreateDocumentModal
        isOpen={showCreateDocumentModal}
        onClose={() => {
          setShowCreateDocumentModal(false);
          setDraggedFileForModal(null); // Clear dragged file when modal closes
        }}
        onSubmit={handleCreateDocument}
        currentFolderId={currentFolderId ?? undefined}
        isCreating={isCreatingDocument}
        initialFile={draggedFileForModal ?? undefined}
        disabled={!organizationId}
      />

      </div>
    </AppLayout>
  );
};

export default DocumentsPage;
