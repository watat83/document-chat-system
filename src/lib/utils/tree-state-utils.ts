import type { Document, Folder } from '@/types/documents'

export interface TreeStateSnapshot {
  folders: Folder[]
  documents: Document[]
  stats: {
    totalFolders: number
    totalDocuments: number
    protectedFolders: number
    rootFolders: number
    rootDocuments: number
    documentsByType: Record<string, number>
    documentsBySize: {
      small: number // < 1MB
      medium: number // 1MB - 10MB
      large: number // > 10MB
    }
  }
  currentFolder: {
    id: string | null
    path: Folder[]
    documents: Document[]
    subfolders: Folder[]
  }
  timestamp: string
}

export function captureTreeState(
  folders: Folder[],
  documents: Document[],
  currentFolderId: string | null
): TreeStateSnapshot {
  // Calculate document statistics
  const documentsByType = documents.reduce(
    (acc, doc) => {
      const type = doc.documentType || 'unknown'
      acc[type] = (acc[type] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const documentsBySize = documents.reduce(
    (acc, doc) => {
      const sizeInBytes = doc.size || 0

      if (sizeInBytes < 1024 * 1024) acc.small++
      else if (sizeInBytes < 10 * 1024 * 1024) acc.medium++
      else acc.large++

      return acc
    },
    { small: 0, medium: 0, large: 0 }
  )

  // Get current folder path
  const getFolderPath = (folderId: string | null): Folder[] => {
    if (!folderId) return []

    const path: Folder[] = []
    let currentId: string | null = folderId

    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const folder = folders.find((f) => f.id === currentId)
      if (folder) {
        path.unshift(folder)
        currentId = folder.parentId || null
      } else {
        break
      }
    }

    return path
  }

  // Get current folder documents and subfolders
  const currentFolderDocuments = documents.filter(
    (doc) => doc.folderId === currentFolderId
  )
  const currentFolderSubfolders = folders.filter(
    (folder) => folder.parentId === currentFolderId
  )

  return {
    folders,
    documents,
    stats: {
      totalFolders: folders.length,
      totalDocuments: documents.length,
      protectedFolders: folders.filter((f) => f.isProtected).length,
      rootFolders: folders.filter((f) => f.parentId === null).length,
      rootDocuments: documents.filter((d) => d.folderId === null).length,
      documentsByType,
      documentsBySize,
    },
    currentFolder: {
      id: currentFolderId,
      path: getFolderPath(currentFolderId),
      documents: currentFolderDocuments,
      subfolders: currentFolderSubfolders,
    },
    timestamp: new Date().toISOString(),
  }
}

export function logTreeStateChange(
  action:
    | string
    | (typeof import('../constants').TREE_OPERATIONS)[keyof typeof import('../constants').TREE_OPERATIONS],
  beforeState: TreeStateSnapshot,
  afterState: TreeStateSnapshot,
  additionalData: Record<string, any> = {}
) {
  // Only log if there are actual changes
  const hasChanges =
    beforeState.stats.totalDocuments !== afterState.stats.totalDocuments ||
    beforeState.stats.totalFolders !== afterState.stats.totalFolders ||
    JSON.stringify(beforeState.documents.map((d) => d.id).sort()) !==
      JSON.stringify(afterState.documents.map((d) => d.id).sort()) ||
    JSON.stringify(beforeState.folders.map((f) => f.id).sort()) !==
      JSON.stringify(afterState.folders.map((f) => f.id).sort())

  if (!hasChanges) {
    return {
      beforeState,
      afterState,
      changes: { noChanges: true },
      timestamp: new Date().toISOString(),
    }
  }

  console.group(` Tree State Change: ${action}`)

  console.log('📋 Operation Details:', {
    action,
    timestamp: new Date().toISOString(),
    ...additionalData,
  })

  // Only show key differences instead of full state
  console.log('📊 Document Count Change:', {
    before: beforeState.stats.totalDocuments,
    after: afterState.stats.totalDocuments,
    difference:
      afterState.stats.totalDocuments - beforeState.stats.totalDocuments,
  })

  // Calculate changes
  const changes = {
    foldersAdded: afterState.folders.filter(
      (f) => !beforeState.folders.some((bf) => bf.id === f.id)
    ),
    foldersRemoved: beforeState.folders.filter(
      (f) => !afterState.folders.some((af) => af.id === f.id)
    ),
    documentsAdded: afterState.documents.filter(
      (d) => !beforeState.documents.some((bd) => bd.id === d.id)
    ),
    documentsRemoved: beforeState.documents.filter(
      (d) => !afterState.documents.some((ad) => ad.id === d.id)
    ),
    statsChange: {
      folders: afterState.stats.totalFolders - beforeState.stats.totalFolders,
      documents:
        afterState.stats.totalDocuments - beforeState.stats.totalDocuments,
    },
  }

  console.log(' Changes Summary:', changes)
  console.groupEnd()

  return {
    beforeState,
    afterState,
    changes,
    timestamp: new Date().toISOString(),
  }
}
