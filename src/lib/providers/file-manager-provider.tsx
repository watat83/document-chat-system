'use client';

import React, { createContext, useContext, useCallback, useState } from 'react';
import { validateFile, getEffectiveMimeType, createCorrectedFile } from '@/lib/file-validation';
import { extractExifData, EditableExifData, createFileWithUpdatedMetadata } from '@/lib/exif-utils';

interface FileOperations {
  validateFile: (file: File, maxSize?: number) => ReturnType<typeof validateFile>;
  getEffectiveMimeType: (validation: ReturnType<typeof validateFile>) => string;
  createCorrectedFile: (file: File, correctedMimeType: string) => File;
  extractExifData: (file: File) => ReturnType<typeof extractExifData>;
  createFileWithUpdatedMetadata: (file: File, metadata: EditableExifData) => File;
}

interface FolderOperations {
  canDeleteFolder: (folderId: string, folders: any[], documents: any[]) => { canDelete: boolean; reason?: string };
  getFolderChildren: (folderId: string | null, folders: any[]) => any[];
  getFolderDocuments: (folderId: string | null, documents: any[]) => any[];
  getFolderPath: (folderId: string | null, folders: any[]) => any[];
  validateFolderName: (name: string, parentId: string | null, folders: any[], excludeId?: string) => { isValid: boolean; error?: string };
}

interface StorageOperations {
  uploadFile: (file: File, organizationId: string, folderId?: string | null) => Promise<{ success: boolean; data?: any; error?: string }>;
  deleteFile: (fileId: string) => Promise<{ success: boolean; error?: string }>;
  moveFile: (fileId: string, targetFolderId: string | null) => Promise<{ success: boolean; error?: string }>;
  downloadFile: (fileId: string) => Promise<{ success: boolean; url?: string; error?: string }>;
}

interface FileManagerContextType {
  // Operations
  fileOps: FileOperations;
  folderOps: FolderOperations;
  storageOps: StorageOperations;

  // State
  isUploading: boolean;
  uploadProgress: number;

  // Utilities
  formatFileSize: (bytes: number) => string;
  getFileIcon: (type: string) => React.ReactNode;
  getFileTypeBadge: (type: string) => React.ReactNode;
}

const FileManagerContext = createContext<FileManagerContextType | undefined>(undefined);

export const useFileManager = () => {
  const context = useContext(FileManagerContext);
  if (context === undefined) {
    throw new Error('useFileManager must be used within a FileManagerProvider');
  }
  return context;
};

interface FileManagerProviderProps {
  children: React.ReactNode;
}

export const FileManagerProvider: React.FC<FileManagerProviderProps> = ({ children }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // File Operations
  const fileOps: FileOperations = {
    validateFile: (file: File, maxSize?: number) => validateFile(file, maxSize),
    getEffectiveMimeType: (validation) => getEffectiveMimeType(validation),
    createCorrectedFile: (file, correctedMimeType) => createCorrectedFile(file, correctedMimeType),
    extractExifData: (file) => extractExifData(file),
    createFileWithUpdatedMetadata: (file, metadata) => createFileWithUpdatedMetadata(file, metadata)
  };

  // Folder Operations
  const folderOps: FolderOperations = {
    canDeleteFolder: useCallback((folderId: string, folders: any[], documents: any[]) => {
      // Check if folder has subfolders
      const hasSubfolders = folders.some(folder => folder.parentId === folderId);
      if (hasSubfolders) {
        return {
          canDelete: false,
          reason: 'Cannot delete folder that contains subfolders. Please delete or move all subfolders first.'
        };
      }

      // Check if folder has documents
      const hasDocuments = documents.some(doc => doc.folderId === folderId);
      if (hasDocuments) {
        return {
          canDelete: false,
          reason: 'Cannot delete folder that contains files. Please delete or move all files first.'
        };
      }

      return { canDelete: true };
    }, []),

    getFolderChildren: useCallback((folderId: string | null, folders: any[]) => {
      return folders.filter(folder => folder.parentId === folderId);
    }, []),

    getFolderDocuments: useCallback((folderId: string | null, documents: any[]) => {
      return documents.filter(doc => doc.folderId === folderId);
    }, []),

    getFolderPath: useCallback((folderId: string | null, folders: any[]) => {
      if (!folderId) return [];

      const path = [];
      let currentId = folderId;

      while (currentId) {
        const folder = folders.find(f => f.id === currentId);
        if (folder) {
          path.unshift(folder);
          currentId = folder.parentId;
        } else {
          break;
        }
      }

      return path;
    }, []),

    validateFolderName: useCallback((name: string, parentId: string | null, folders: any[], excludeId?: string) => {
      if (!name.trim()) {
        return { isValid: false, error: 'Folder name cannot be empty' };
      }

      if (name.length > 100) {
        return { isValid: false, error: 'Folder name too long (max 100 characters)' };
      }

      // Check for invalid characters
      const invalidChars = /[<>:"/\\|?*]/;
      if (invalidChars.test(name)) {
        return { isValid: false, error: 'Folder name contains invalid characters' };
      }

      // Check for duplicate names in the same parent folder
      const siblingFolders = folders.filter(f =>
        f.parentId === parentId &&
        f.id !== excludeId
      );

      if (siblingFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        return { isValid: false, error: 'A folder with this name already exists in this location' };
      }

      return { isValid: true };
    }, [])
  };

  // Storage Operations (mock implementations - replace with actual API calls)
  const storageOps: StorageOperations = {
    uploadFile: useCallback(async (file: File, organizationId: string, folderId?: string | null) => {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Validate file first
        const validation = fileOps.validateFile(file);
        if (!validation.isValid) {
          return { success: false, error: validation.error };
        }

        // Simulate upload progress
        for (let i = 0; i <= 100; i += 10) {
          setUploadProgress(i);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // TODO: Replace with actual API call
        const formData = new FormData();
        formData.append('file', file);
        formData.append('organizationId', organizationId);
        if (folderId) formData.append('folderId', folderId);

        const response = await fetch('/api/v1/documents/upload', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          return { success: false, error: result.error || 'Upload failed' };
        }

        return { success: true, data: result };
      } catch (error) {
        console.error('Upload error:', error);
        return { success: false, error: 'Upload failed' };
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    }, [fileOps]),

    deleteFile: useCallback(async (fileId: string) => {
      try {
        // TODO: Replace with actual API call
        const response = await fetch(`/api/v1/documents/${fileId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const result = await response.json();
          return { success: false, error: result.error || 'Delete failed' };
        }

        return { success: true };
      } catch (error) {
        console.error('Delete error:', error);
        return { success: false, error: 'Delete failed' };
      }
    }, []),

    moveFile: useCallback(async (fileId: string, targetFolderId: string | null) => {
      try {
        // TODO: Replace with actual API call
        const response = await fetch(`/api/v1/documents/${fileId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: targetFolderId })
        });

        if (!response.ok) {
          const result = await response.json();
          return { success: false, error: result.error || 'Move failed' };
        }

        return { success: true };
      } catch (error) {
        console.error('Move error:', error);
        return { success: false, error: 'Move failed' };
      }
    }, []),

    downloadFile: useCallback(async (fileId: string) => {
      try {
        // TODO: Replace with actual API call
        const response = await fetch(`/api/v1/documents/${fileId}/download`);

        if (!response.ok) {
          const result = await response.json();
          return { success: false, error: result.error || 'Download failed' };
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        return { success: true, url };
      } catch (error) {
        console.error('Download error:', error);
        return { success: false, error: 'Download failed' };
      }
    }, [])
  };

  // Utility Functions
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getFileIcon = useCallback((type: string) => {
    // This would return appropriate icons based on file type
    // For now, returning null - implement based on your icon system
    return null;
  }, []);

  const getFileTypeBadge = useCallback((type: string) => {
    // This would return appropriate badges based on file type
    // For now, returning null - implement based on your badge system
    return null;
  }, []);

  const value: FileManagerContextType = {
    fileOps,
    folderOps,
    storageOps,
    isUploading,
    uploadProgress,
    formatFileSize,
    getFileIcon,
    getFileTypeBadge
  };

  return (
    <FileManagerContext.Provider value={value}>
      {children}
    </FileManagerContext.Provider>
  );
};

export default FileManagerProvider;
