'use client'

import React, { useCallback, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  File as FileIcon,
  Download,
  Eye,
  Code,
  FileImage,
  FileVideo,
  FileAudio,
  Image,
  Video,
  Music,
  Archive
} from 'lucide-react'
import { ResponsiveCanvasPreview } from './responsive-canvas-preview'
import { TextViewer } from './viewers/text-viewer'
import { MarkdownViewer } from './viewers/markdown-viewer'
import { OfficeViewer } from './viewers/office-viewer'
import { AuthenticatedImage } from '../ui/authenticated-image'
import { formatFileSize } from './file-type-utils'

interface FilePreviewProps {
  document: {
    id: string
    name: string
    type: string
    size: string | number
    mimeType?: string
    filePath?: string // Add filePath to interface
    originalFile?: File
  }
  className?: string
  videoFit?: 'cover' | 'contain'
}

// Utility function to get original filename from filePath (for preview stability)
const getOriginalFileName = (docData: any): string => {
  try {
    if (!docData) {
      console.warn('getOriginalFileName: docData is null/undefined');
      return 'unknown-file';
    }

    // Try to extract filename from filePath first (most reliable for stored files)
    if (docData.filePath && typeof docData.filePath === 'string') {
      const pathParts = docData.filePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      if (fileName && fileName !== 'unknown-file') {
        return fileName;
      }
    }

    // Fallback to docData.name
    if (docData.name && typeof docData.name === 'string') {
      return docData.name;
    }

    console.warn('getOriginalFileName: No valid filename found', {
      filePath: docData.filePath,
      name: docData.name,
      id: docData.id
    });
    return 'unknown-file';
  } catch (error) {
    console.error('getOriginalFileName error:', error);
    return 'unknown-file';
  }
}

// Component for handling canvas preview with fetched file content
const CanvasPreviewWithFetch: React.FC<{ document: any; className?: string }> = ({ document: doc, className = '' }) => {
  const [fetchedFile, setFetchedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch file content when component mounts or document ID changes
  useEffect(() => {
    // If we already have the original file, use it
    if (doc.originalFile) {
      setFetchedFile(doc.originalFile);
      setIsLoading(false);
      return;
    }

    // Otherwise fetch from API
    const fetchFile = async () => {
      if (!doc.id) {
        setError('No document ID available');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/documents/${doc.id}/download`);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const blob = await response.blob();
        const file = new File([blob], getOriginalFileName(doc), {
          type: doc.mimeType || 'application/octet-stream'
        });

        setFetchedFile(file);
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching file for preview:', err);
        setError(err instanceof Error ? err.message : 'Failed to load file');
        setIsLoading(false);
      }
    };

    fetchFile();
    // Only re-fetch when document ID changes (prevents infinite loops)
  }, [doc.id]);

  // Show loading state
  if (isLoading) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-xs text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-xs text-red-500">Error</div>
      </div>
    );
  }

  // Show canvas preview if we have a fetched file
  if (fetchedFile) {
    return (
      <div className={`w-full h-full ${className}`}>
        <ResponsiveCanvasPreview
          file={fetchedFile}
          fileName={doc.name}
        />
      </div>
    );
  }

  // Fallback - no file available
  return (
    <div className={`w-full h-full flex items-center justify-center bg-gray-50 ${className}`}>
      <div className="text-xs text-muted-foreground">No preview</div>
    </div>
  );
};

export const FilePreview: React.FC<FilePreviewProps> = ({ document: doc, className = '', videoFit = 'contain' }) => {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  // Get original filename for all operations (prevents preview breaking on title edits)
  const originalFileName = getOriginalFileName(doc)

  // Check if this is a created document (no actual file)
  const isCreatedDocument = doc.filePath?.startsWith('/documents/') ||
    (!doc.originalFile && doc.filePath && !doc.filePath.includes('/api/v1/documents/') && !doc.filePath.includes('supabase'));

  // Debug logging for created document detection (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('FilePreview - Created document check:', {
      id: doc.id,
      name: doc.name,
      filePath: doc.filePath,
      hasOriginalFile: !!doc.originalFile,
      startsWithDocuments: doc.filePath?.startsWith('/documents/'),
      includesApiPath: doc.filePath?.includes('/api/v1/documents/'),
      includesSupabase: doc.filePath?.includes('supabase'),
      isCreatedDocument
    });
  }

  // Removed debug logging to prevent continuous re-render logs

  // Check if file is valid (using duck typing only - no instanceof)
  const isValidFile = useCallback((file: any): file is File => {
    // Simple duck typing check - avoid instanceof completely
    return file &&
           typeof file.name === 'string' &&
           typeof file.size === 'number' &&
           (typeof file.type === 'string' || file.type === undefined) &&
           typeof file.lastModified === 'number';
  }, []);

  // Handle iframe load events
  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIframeLoading(false);
    setIframeError(true);
  }, []);

  // Reset iframe states when document changes
  useEffect(() => {
    setIframeLoading(true);
    setIframeError(false);
  }, [doc.id]);

  // Get document icon based on type
  const getDocumentIcon = useCallback((type: string) => {
    switch (type) {
      case 'pdf':
      case 'text':
        return <FileText size={20} />;
      case 'code':
        return <Code size={20} />;
      case 'image':
        return <FileImage size={20} />;
      case 'video':
        return <FileVideo size={20} />;
      case 'audio':
        return <FileAudio size={20} />;
      case 'archive':
        return <Archive size={20} />;
      default:
        return <FileIcon size={20} />;
    }
  }, []);

  // Create object URL for uploaded files or use API endpoint for persisted files
  const getFileUrl = (doc: any) => {
    if (doc.originalFile && isValidFile(doc.originalFile)) {
      return URL.createObjectURL(doc.originalFile);
    }
    return null; // No preview for demo files
  };

  // Enhanced function to get document URL for both new and persisted documents
  const getDocumentUrl = useCallback((document: any) => {
    // For newly uploaded files, use the original file object
    if (document.originalFile && isValidFile(document.originalFile)) {
      return URL.createObjectURL(document.originalFile);
    }
    // For persisted files from database, use the download API
    if (document.id) {
      return `/api/v1/documents/${document.id}/download`;
    }
    return null;
  }, [isValidFile]);


  const createPlaceholder = (text: string) => {
    const svgContent = '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="100%" height="100%" fill="#f3f4f6"/>' +
      '<text x="50%" y="50%" font-family="system-ui" font-size="16" fill="#6b7280" text-anchor="middle" dominant-baseline="middle">' +
      text.replace(/[<>&"']/g, '') +
      '</text></svg>';
    return `data:image/svg+xml;base64,${btoa(svgContent)}`;
  };

  // Handle image types (both 'image' and specific formats like 'jpeg', 'png', etc.)
  const isImageType = doc.type === 'image' ||
                     doc.mimeType?.startsWith('image/') ||
                     ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(doc.type.toLowerCase());

  if (isImageType) {
      const imageUrl = getFileUrl(doc);

      // For persisted images (no originalFile), use AuthenticatedImage
      if (!doc.originalFile) {
        return (
          <div className="w-full h-full bg-black relative">
            <AuthenticatedImage
              document={doc}
              alt={getOriginalFileName(doc)}
              className="w-full h-full object-contain"
              style={{ backgroundColor: 'black' }}
            />
          </div>
        );
      }

      // For newly uploaded images with originalFile, use existing logic
      const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.target as HTMLImageElement;
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
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={getOriginalFileName(doc)}
                className="w-full h-full object-cover opacity-0"
                onLoad={(e) => {
                  handleImageLoad(e);
                  (e.target as HTMLImageElement).style.opacity = '1';
                }}
                onError={(e) => {
                  const fallback = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                  if (fallback) {
                    (e.target as HTMLElement).style.display = 'none';
                    fallback.style.display = 'flex';
                  }
                }}
                style={{ transition: 'opacity 0.3s ease-in-out' }}
              />
              <div className="hidden flex-col items-center justify-center h-full bg-gray-100 text-gray-600">
                <Image size={64} className="mb-4" />
                <p className="text-sm">Failed to load image</p>
                <p className="text-xs mt-1">{getOriginalFileName(doc)}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-gray-100 text-gray-600">
              <Image size={64} className="mb-4" />
              <p className="text-sm">Image preview unavailable</p>
              <p className="text-xs mt-1">{originalFileName}</p>
              <p className="text-xs mt-2 text-center px-4">File was uploaded successfully. Preview available during session - not after page refresh.</p>
            </div>
          )}
        </div>
      );
  }

  // Handle video types
  const isVideoType = doc.type === 'video' ||
                     doc.mimeType?.startsWith('video/') ||
                     ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(doc.type.toLowerCase());

  // Debug video type detection (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('FilePreview - Video type check:', {
      docName: doc.name,
      originalFileName: originalFileName,
      docType: doc.type,
      mimeType: doc.mimeType,
      isVideoType: isVideoType,
      typeCheck: doc.type === 'video',
      mimeCheck: doc.mimeType?.startsWith('video/'),
      extensionCheck: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(doc.type.toLowerCase())
    });
  }

  if (isVideoType) {
      const videoUrl = getDocumentUrl(doc);

      // Debug logging for video URL generation
      console.log('FilePreview - Video debug:', {
        docId: doc.id,
        docName: doc.name,
        originalFileName: originalFileName,
        hasOriginalFile: !!doc.originalFile,
        videoUrl: videoUrl,
        mimeType: doc.mimeType,
        hasValidUrl: !!videoUrl
      });

      // Only render video if we have a valid URL (same as main documents page)
      if (!videoUrl) {
        console.log('FilePreview - No video URL available, falling through to default');
        // Fall through to default handling
      } else {
        return (
        <div className="w-full h-full relative bg-black">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className={`w-full h-full object-${videoFit}`}
              preload="metadata"
              onLoadStart={() => {
                console.log('FilePreview - Video load started:', originalFileName);
              }}
              onLoadedMetadata={() => {
                console.log('FilePreview - Video metadata loaded:', originalFileName);
              }}
              onError={(e) => {
                console.error('FilePreview - Video error:', originalFileName, e);
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
            <p className="text-sm">Video preview unavailable</p>
            <p className="text-xs mt-1">{getOriginalFileName(doc)}</p>
            <p className="text-xs mt-2 text-center px-4">No video content available</p>
          </div>
        </div>
        );
      }
  }

  // Handle audio types
  const isAudioType = doc.type === 'audio' ||
                     doc.mimeType?.startsWith('audio/') ||
                     ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(doc.type.toLowerCase());

  // Debug audio type detection (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('FilePreview - Audio type check:', {
      docName: doc.name,
      originalFileName: originalFileName,
      docType: doc.type,
      mimeType: doc.mimeType,
      isAudioType: isAudioType,
      typeCheck: doc.type === 'audio',
      mimeCheck: doc.mimeType?.startsWith('audio/'),
      extensionCheck: ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(doc.type.toLowerCase())
    });
  }

  if (isAudioType) {
      const audioUrl = getDocumentUrl(doc);

      // Only render audio if we have a valid URL (same as main documents page)
      if (!audioUrl) {
        console.log('FilePreview - No audio URL available, falling through to default');
        // Fall through to default handling
      } else {
        return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100">
          <FileAudio size={64} className="mb-4 text-pink-500" />
          {audioUrl ? (
            <audio
              controls
              className="mb-4 max-w-full"
              preload="metadata"
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
          <p className="text-sm text-center text-pink-700 font-medium">{getOriginalFileName(doc)}</p>
        </div>
        );
      }
  }

  // If it's a created document, show "No file" message or hide preview
  if (isCreatedDocument) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
        <div className="text-4xl mb-3">
          <FileText />
        </div>
        <p className="text-sm">No file</p>
        <p className="text-xs mt-1">Created Document</p>
      </div>
    );
  }

  // Handle PDF files
  const isPdfType = doc.type === 'pdf' || doc.mimeType === 'application/pdf';

  if (isPdfType) {
      // Use CanvasPreviewWithFetch for all PDFs (works with or without originalFile)
      return (
        <div className={`w-full h-full ${className}`}>
          <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
        </div>
      );
  }

  // Handle text files
  const isTextType = doc.type === 'text' ||
                    doc.type === 'plain' || // Handle legacy 'plain' type files
                    doc.mimeType?.startsWith('text/') ||
                    ['txt', 'md', 'csv'].includes(doc.type.toLowerCase());

  if (isTextType) {
      // Check if it's a markdown file using multiple sources (filename, filePath, name)
      const isMarkdown = originalFileName.toLowerCase().endsWith('.md') ||
                        doc.name?.toLowerCase().endsWith('.md') ||
                        doc.filePath?.toLowerCase().endsWith('.md') ||
                        doc.mimeType === 'text/markdown';

      // Debug logging for markdown detection
      console.log('FilePreview - Markdown detection:', {
        docId: doc.id,
        docName: doc.name,
        docFilePath: doc.filePath,
        originalFileName,
        docType: doc.type,
        mimeType: doc.mimeType,
        isMarkdown,
        checks: {
          originalFileNameEndsMd: originalFileName.toLowerCase().endsWith('.md'),
          docNameEndsMd: doc.name?.toLowerCase().endsWith('.md'),
          filePathEndsMd: doc.filePath?.toLowerCase().endsWith('.md'),
          mimeTypeMarkdown: doc.mimeType === 'text/markdown'
        }
      });

      if (isMarkdown) {
        // Use MarkdownViewer for .md files if we have originalFile
        if (doc.originalFile && isValidFile(doc.originalFile)) {
          return (
            <div className={`w-full h-full ${className}`}>
              <MarkdownViewer
                file={doc.originalFile}
                fileName={originalFileName}
                onDownload={() => {
                  const url = getFileUrl(doc);
                  if (url) {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = originalFileName;
                    link.click();
                  }
                }}
              />
            </div>
          );
        } else {
          // Use CanvasPreviewWithFetch for .md files when no originalFile (uploaded/stored files)
          return (
            <div className={`w-full h-full ${className}`}>
              <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
            </div>
          );
        }
      } else {
        // Use CanvasPreviewWithFetch for .txt/.csv files (works with or without originalFile)
        return (
          <div className={`w-full h-full ${className}`}>
            <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
          </div>
        );
      }

      // Fallback for demo files or when FileReader fails
      const textUrl = getFileUrl(doc);
      return (
        <div className="w-full h-full flex flex-col p-4">
          <div className="w-full h-full border border-border rounded-lg bg-card shadow-lg flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-gray-600" />
                <span className="text-sm font-medium">Text Document</span>
                <span className="text-xs text-gray-500">({originalFileName})</span>
              </div>
              <div className="flex gap-2">
                {textUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement('a');
                      if (!textUrl) return;
                      link.href = textUrl;
                      link.download = originalFileName;
                      link.click();
                    }}
                  >
                    <Download size={16} className="mr-2" />
                    Download
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <FileText size={64} className="mb-4 text-gray-600" />
                <p className="text-sm font-medium">{originalFileName}</p>
                <p className="text-xs mt-2">{formatFileSize(doc.size)}</p>
                <p className="text-xs mt-4">Demo text file - upload a text file to see inline preview</p>
              </div>
            </div>
          </div>
        </div>
      );
  }

  // Handle code files
  const isCodeType = doc.type === 'code' ||
                    ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(doc.type.toLowerCase());

  if (isCodeType) {
      const codeUrl = getFileUrl(doc);
      return (
        <div className="w-full h-full flex flex-col p-4">
          <div className="w-full h-full border rounded-lg bg-gray-900 shadow-lg flex flex-col">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code size={20} className="text-cyan-500" />
                <span className="text-sm font-medium text-white">Code File</span>
                <span className="text-xs text-gray-400">({originalFileName})</span>
              </div>
              <div className="flex gap-2">
                {codeUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = codeUrl;
                      link.download = originalFileName;
                      link.click();
                    }}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600"
                  >
                    <Download size={16} className="mr-2" />
                    Download
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 relative">
              {codeUrl ? (
                <iframe
                  src={codeUrl}
                  className="w-full h-full border-0 rounded-b-lg bg-gray-800"
                  title={`Code Preview: ${originalFileName}`}
                  style={{ fontFamily: 'monospace', color: '#e5e7eb' }}
                  onError={(e) => {
                    const target = e.target as HTMLIFrameElement;
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (target && fallback) {
                      target.style.display = 'none';
                      fallback.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div className={`${codeUrl ? 'hidden' : 'flex'} absolute inset-0 flex-col items-center justify-center text-gray-300`}>
                <Code size={64} className="mb-4 text-cyan-500" />
                <p className="text-sm font-medium">{originalFileName}</p>
                <p className="text-xs mt-2">{formatFileSize(doc.size)}</p>
                {codeUrl ? (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs">Failed to load code preview</p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = codeUrl;
                        link.download = originalFileName;
                        link.click();
                      }}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      <Download size={16} className="mr-2" />
                      Download Code
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs mt-4">Demo code file - upload a code file to see inline preview</p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
  }

  // Handle Microsoft Word documents
  const isWordType = doc.type === 'word' ||
                    doc.mimeType?.includes('word') ||
                    doc.mimeType?.includes('document') ||
                    ['doc', 'docx'].includes(doc.type.toLowerCase());

  if (isWordType) {
      // Use CanvasPreviewWithFetch for all Word documents (works with or without originalFile)
      return (
        <div className={`w-full h-full ${className}`}>
          <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
        </div>
      );
  }

  // Handle Microsoft Excel documents
  const isExcelType = doc.type === 'excel' ||
                     doc.mimeType?.includes('sheet') ||
                     doc.mimeType?.includes('excel') ||
                     ['xls', 'xlsx'].includes(doc.type.toLowerCase());

  if (isExcelType) {
      // Use CanvasPreviewWithFetch for all Excel documents (works with or without originalFile)
      return (
        <div className={`w-full h-full ${className}`}>
          <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
        </div>
      );
  }

  // Handle Microsoft PowerPoint documents
  const isPowerPointType = doc.type === 'powerpoint' ||
                          doc.mimeType?.includes('presentation') ||
                          doc.mimeType?.includes('powerpoint') ||
                          ['ppt', 'pptx'].includes(doc.type.toLowerCase());

  if (isPowerPointType) {
      // Use CanvasPreviewWithFetch for all PowerPoint documents (works with or without originalFile)
      return (
        <div className={`w-full h-full ${className}`}>
          <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
        </div>
      );
  }

  // Default fallback - use CanvasPreviewWithFetch for any other file types
  // This ensures all file types get some kind of preview

  return (
    <div className={`w-full h-full ${className}`}>
      <CanvasPreviewWithFetch document={doc} className="w-full h-full" />
    </div>
  );
}
