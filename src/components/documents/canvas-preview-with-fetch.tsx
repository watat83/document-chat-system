'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ResponsiveCanvasPreview } from './responsive-canvas-preview'

interface CanvasPreviewWithFetchProps {
  document: {
    id: string
    name: string
    mimeType?: string
    originalFile?: File
  }
  className?: string
}

// Component for handling canvas preview with fetched file content
export const CanvasPreviewWithFetch: React.FC<CanvasPreviewWithFetchProps> = ({
  document: doc,
  className = ''
}) => {
  const [fetchedFile, setFetchedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Circuit breaker state to prevent infinite retries
  const [isFailed, setIsFailed] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const maxRetries = 3;
  const maxRetryTime = 30000; // 30 seconds total retry time
  const startTimeRef = useRef<number>(Date.now());

  // Cleanup function to clear retries and abort requests
  const cleanup = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      try {
        abortControllerRef.current.abort();
      } catch (error) {
        // Ignore errors from aborting, as this is cleanup
      }
    }
  };

  // Check if error is retryable
  const isRetryableError = (err: Error, status?: number): boolean => {
    if (status && (status === 401 || status === 403 || status === 404)) {
      return false; // Don't retry on authentication/authorization/not found errors
    }

    return (
      err.name === 'AbortError' ||
      err.message.includes('Internal Server Error') ||
      err.message.includes('Network Error') ||
      err.message.includes('Failed to fetch') ||
      err.message.includes('fetch')
    );
  };

  useEffect(() => {
    // Reset state when document changes
    startTimeRef.current = Date.now();
    setIsFailed(false);
    setRetryCount(0);
    cleanup();

    const fetchFileContent = async (currentRetry: number = 0) => {
      // Circuit breaker: Stop if we've failed permanently or exceeded max time
      if (isFailed || (Date.now() - startTimeRef.current) > maxRetryTime) {
        console.log('🛑 Circuit breaker: Stopping further attempts');
        setLoading(false);
        setError('Download failed - maximum retry time exceeded');
        setIsFailed(true);
        return;
      }

      // Stop if we've exceeded max retries
      if (currentRetry >= maxRetries) {
        console.log('🛑 Maximum retries exceeded');
        setLoading(false);
        setError(`Download failed after ${maxRetries} attempts`);
        setIsFailed(true);
        return;
      }

      try {
        setLoading(true);
        if (currentRetry === 0) {
          setError(null);
        }

        // Create new AbortController for this attempt
        abortControllerRef.current = new AbortController();
        const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 10000); // 10 second timeout per attempt

        console.log(`🔄 Fetching file (attempt ${currentRetry + 1}/${maxRetries}):`, doc.id);

        // Fetch file content from download API with credentials
        const response = await fetch(`/api/v1/documents/${doc.id}/download`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortControllerRef.current.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error('CanvasPreviewWithFetch - Download failed:');
          console.error('Status:', response.status);
          console.error('Status Text:', response.statusText);
          console.error('Document ID:', doc.id);
          console.error('Attempt:', currentRetry + 1);
          console.error('URL:', `/api/v1/documents/${doc.id}/download`);
          console.error('Headers:', Object.fromEntries(response.headers.entries()));
          console.error('Response type:', response.type);

          // Get more detailed error information
          let errorMessage = `Failed to fetch file: ${response.statusText} (${response.status})`;
          try {
            const errorData = await response.json();
            if (errorData.error) {
              errorMessage = `Failed to fetch file: ${errorData.error}`;
              if (errorData.details) {
                errorMessage += ` - ${errorData.details}`;
              }
            }
          } catch (parseError) {
            console.warn('Could not parse error response as JSON');
          }

          const error = new Error(errorMessage);
          (error as any).status = response.status;
          throw error;
        }

        // Get file content as blob
        const blob = await response.blob();

        // Validate blob
        if (!blob || blob.size === 0) {
          throw new Error('Downloaded file is empty or invalid');
        }

        // Handle filename and extension issues
        let finalFileName = doc.name || 'unknown-file';
        const hasExtension = finalFileName.includes('.');

        // If the file has no extension but we know the MIME type, add appropriate extension
        if (!hasExtension && doc?.mimeType) {
          const mimeToExt: Record<string, string> = {
            'application/pdf': '.pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
            'text/plain': '.txt',
            'text/csv': '.csv',
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'video/mp4': '.mp4',
            'audio/mpeg': '.mp3'
          };

          const suggestedExt = mimeToExt[doc.mimeType];
          if (suggestedExt) {
            finalFileName = finalFileName + suggestedExt;
            console.log('CanvasPreviewWithFetch - Added extension based on MIME type:', {
              original: doc.name,
              mimeType: doc.mimeType,
              final: finalFileName
            });
          }
        }

        // Create a File object from the blob
        const file = new File([blob], finalFileName, {
          type: doc.mimeType || 'application/octet-stream',
          lastModified: new Date().getTime(),
        });

        console.log('✅ File fetched successfully:', {
          documentId: doc.id,
          fileName: doc.name,
          fileSize: file.size,
          attempts: currentRetry + 1
        });

        setFetchedFile(file);
        setLoading(false);
        setError(null);
        setRetryCount(currentRetry);

      } catch (err) {
        // Don't log AbortError as they're expected when component unmounts or user navigates away
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('CanvasPreviewWithFetch - Request aborted (component unmounted or navigation)');
          return; // Exit early for aborted requests
        }

        console.error('CanvasPreviewWithFetch - Error fetching file for canvas preview:');
        console.error('Error:', err);
        console.error('Document ID:', doc.id);
        console.error('Document Name:', doc.name);
        console.error('MIME Type:', doc.mimeType);
        console.error('Attempt:', currentRetry + 1);
        console.error('Timestamp:', new Date().toISOString());
        if (err instanceof Error) {
          console.error('Error name:', err.name);
          console.error('Error message:', err.message);
          console.error('Error stack:', err.stack);
        }

        let errorMessage = 'Failed to fetch file content';
        let shouldRetry = false;

        if (err instanceof Error) {
          const status = (err as any).status;

          // Determine error message
          if (err.name === 'AbortError') {
            errorMessage = 'Request timed out';
          } else if (status === 401 || err.message.includes('Unauthorized')) {
            errorMessage = 'Authentication required to view this document';
          } else if (status === 403 || err.message.includes('Forbidden')) {
            errorMessage = 'You do not have permission to view this document';
          } else if (status === 404 || err.message.includes('Not Found')) {
            errorMessage = 'Document file not found';
          } else if (status >= 500 || err.message.includes('Internal Server Error')) {
            errorMessage = 'Server error while loading document';
          } else if (err.message.includes('Network Error') || err.message.includes('Failed to fetch')) {
            errorMessage = 'Network error - please check your connection';
          } else {
            errorMessage = err.message;
          }

          // Check if we should retry
          shouldRetry = isRetryableError(err, status) && currentRetry < maxRetries - 1;
        }

        setError(errorMessage);
        setRetryCount(currentRetry);

        if (shouldRetry && !isFailed) {
          const delay = Math.min(1000 * Math.pow(2, currentRetry), 8000); // Exponential backoff, max 8s
          console.log(`🔄 Retrying download in ${delay}ms (attempt ${currentRetry + 2}/${maxRetries})...`);

          retryTimeoutRef.current = setTimeout(() => {
            fetchFileContent(currentRetry + 1);
          }, delay);
        } else {
          console.log('🛑 No more retries:', { shouldRetry, isFailed, currentRetry, maxRetries });
          setLoading(false);
          setIsFailed(true);
        }
      }
    };

    if (!doc.originalFile) {
      fetchFileContent(0);
    } else {
      setFetchedFile(doc.originalFile);
      setLoading(false);
    }

    // Cleanup on unmount or document change
    return cleanup;
  }, [doc.id, doc.name, doc.mimeType, doc.originalFile]); // Removed retryCount from dependencies!

  if (loading) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div className="text-xs text-gray-500">
            {retryCount > 0 ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Loading...'}
          </div>
          {retryCount > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              Elapsed: {Math.round((Date.now() - startTimeRef.current) / 1000)}s
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error || !fetchedFile) {
    return (
      <div className={`w-full h-full flex items-center justify-center text-gray-500 ${className}`}>
        <div className="text-center p-4">
          <div className="text-6xl mb-4 text-gray-400">📄</div>
          <div className="text-sm font-medium mb-2">Preview not available</div>
          <div className="text-xs text-gray-600 mb-3">{doc.name}</div>
          {error && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-2 max-w-sm mx-auto">
              {error}
              {retryCount > 0 && (
                <div className="text-xs text-gray-600 mt-1">
                  (Attempted {retryCount + 1} times)
                </div>
              )}
              {isFailed && (
                <div className="text-xs text-gray-600 mt-1">
                  ⛔ No more retry attempts will be made
                </div>
              )}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-3">
            Document exists but preview cannot be loaded
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveCanvasPreview
      file={fetchedFile}
      fileName={doc.name}
      className={className}
    />
  );
};
