'use client';
import { useDocumentFile } from '@/hooks/use-document-file';
import { useObjectURL } from '@/hooks/use-object-url';

import React, { useEffect, useState, useCallback } from 'react';
import { FileImage, AlertTriangle } from 'lucide-react';

interface AuthenticatedImageProps {
  document: {
    id: string;
    name: string;
    originalFile?: File;
  };
  alt: string;
  className?: string;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  style?: React.CSSProperties;
}

function isValidFile(file: File): boolean {
  return file instanceof File && file.size > 0;
}

export function AuthenticatedImage({ 
  document, 
  alt, 
  className = "", 
  onLoad, 
  onError,
  style
}: AuthenticatedImageProps) {
  const { fetchedFile, loading, error: fetchError, status } = useDocumentFile(document);
  const validImage = fetchedFile && fetchedFile.type.startsWith('image/') ? fetchedFile : null;
  const imageUrl = useObjectURL(validImage);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const error = Boolean(fetchError || fetchedFile && !validImage || imageUrl && failedImageUrl === imageUrl);
  const errorType = status === 401 || status === 403 ? 'auth' : status === 404 || fetchedFile && !validImage ? 'missing' : fetchError ? 'network' : 'unknown';

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100`} style={style}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
      </div>
    );
  }

  if (error || !imageUrl) {
    // Create different placeholders based on error type
    const isSmall = (style?.width as string)?.includes('12') || (style?.height as string)?.includes('12');
    const iconSize = isSmall ? 16 : 24;
    
    // Different styling based on error type
    const getPlaceholderStyle = () => {
      switch (errorType) {
        case 'missing':
          return 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 border border-amber-200';
        case 'auth':
          return 'bg-gradient-to-br from-red-50 to-red-100 text-red-600 border border-red-200';
        case 'network':
          return 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 border border-blue-200';
        default:
          return 'bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400';
      }
    };

    const getIcon = () => {
      if (errorType === 'missing' || errorType === 'network') {
        return <AlertTriangle size={iconSize} className="opacity-70" />;
      }
      return <FileImage size={iconSize} className="opacity-60" />;
    };

    const getMessage = () => {
      if (isSmall) return null;
      switch (errorType) {
        case 'missing':
          return <span className="text-xs mt-1 opacity-80">File missing</span>;
        case 'auth':
          return <span className="text-xs mt-1 opacity-80">Access denied</span>;
        case 'network':
          return <span className="text-xs mt-1 opacity-80">Load failed</span>;
        default:
          return <span className="text-xs mt-1 opacity-70">Preview</span>;
      }
    };
    
    return (
      <div className={`${className} flex flex-col items-center justify-center ${getPlaceholderStyle()}`} style={style} title={errorType === 'missing' ? 'File not found in storage' : undefined}>
        {getIcon()}
        {getMessage()}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      style={style}
      onLoad={onLoad}
      onError={(e) => {
        setFailedImageUrl(imageUrl);
        onError?.(e);
      }}
    />
  );
}