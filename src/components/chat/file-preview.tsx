'use client';
import { useObjectURL } from '@/hooks/use-object-url';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { validateFile, getEffectiveMimeType, isVideoFile } from '@/lib/file-validation';
import { 
  X, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Download, 
  Eye, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  File,
  Maximize2,
  Minimize2,
  RotateCw,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface FilePreviewProps {
  file: File;
  url?: string;
  onRemove?: () => void;
  onDownload?: () => void;
  className?: string;
  showRemove?: boolean;
  size?: 'small' | 'medium' | 'large';
}

interface MediaState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  url,
  onRemove,
  onDownload,
  className = '',
  showRemove = true,
  size = 'medium'
}) => {
  const objectUrl = useObjectURL(url ? null : file);
  const previewUrl = url || objectUrl;
  const [mediaState, setMediaState] = useState<MediaState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isFullscreen: false
  });
  const [imageError, setImageError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getFileType = () => {
    // Use enhanced validation to get the effective MIME type
    const validation = validateFile(file);
    const effectiveType = getEffectiveMimeType(validation);
    
    if (effectiveType.startsWith('image/')) return 'image';
    if (effectiveType.startsWith('video/') || isVideoFile(file)) return 'video';
    if (effectiveType.startsWith('audio/')) return 'audio';
    if (effectiveType === 'application/pdf') return 'pdf';
    if (effectiveType.includes('document') || effectiveType.includes('text')) return 'document';
    return 'file';
  };
  
  const getFileIcon = () => {
    const type = getFileType();
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'audio': return <Music className="h-4 w-4" />;
      case 'pdf':
      case 'document': return <FileText className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };
  
  const getTypeColor = () => {
    const type = getFileType();
    switch (type) {
      case 'image': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'video': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'audio': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'pdf':
      case 'document': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };
  
  const togglePlayPause = () => {
    const media = mediaRef.current;
    if (!media) return;
    
    if (mediaState.isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setMediaState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };
  
  const toggleMute = () => {
    const media = mediaRef.current;
    if (!media) return;
    
    media.muted = !media.muted;
    setMediaState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  };
  
  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else if (previewUrl) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = file.name;
      link.click();
    }
  };
  
  const getSizeClasses = () => {
    switch (size) {
      case 'small': return 'max-w-full sm:max-w-xs';
      case 'large': return 'max-w-full sm:max-w-2xl';
      default: return 'max-w-full sm:max-w-lg';
    }
  };
  
  const renderImagePreview = () => {
    if (!previewUrl || imageError) {
      return (
        <div className="relative w-full h-64 sm:h-80 flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg bg-gray-800/30">
          <div className="text-center">
            <ImageIcon className="h-8 w-8 mx-auto text-gray-500 mb-2" />
            <p className="text-sm text-gray-500">Preview unavailable</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className={`relative group cursor-pointer ${isZoomed ? 'fixed inset-0 bg-black/95 z-50 flex items-center justify-center' : 'w-full h-64 sm:h-80'}`}>
        <img
          src={previewUrl}
          alt={file.name}
          className={`rounded-lg object-cover transition-all duration-300 ${
            isZoomed 
              ? 'max-h-[90vh] max-w-[90vw] cursor-zoom-out object-contain' 
              : 'w-full h-full cursor-zoom-in hover:scale-105'
          }`}
          onError={() => setImageError(true)}
          onClick={() => setIsZoomed(!isZoomed)}
        />
        
        {/* Floating File Info Overlay */}
        {!isZoomed && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
              <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
                <div className={`p-1.5 rounded-md ${getTypeColor()}`}>
                  {getFileIcon()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate max-w-[200px]">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-300">{formatFileSize(file.size)}</p>
                </div>
              </div>
              {showRemove && onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="bg-black/60 backdrop-blur-sm text-gray-300 hover:text-red-400 hover:bg-red-500/20 h-9 w-9 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            <div className="absolute bottom-3 right-3 flex space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomed(true);
                }}
                className="bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white border-white/20 h-9 w-9 p-0"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                className="bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white border-white/20 h-9 w-9 p-0"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Fullscreen Mode Controls */}
        {isZoomed && (
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <Button
              variant="ghost"
              className="bg-black/60 backdrop-blur-sm text-white hover:bg-black/80"
              onClick={() => setIsZoomed(false)}
            >
              <X className="h-5 w-5 mr-2" />
              Close
            </Button>
            <Button
              variant="ghost"
              className="bg-black/60 backdrop-blur-sm text-white hover:bg-black/80"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              <Download className="h-5 w-5 mr-2" />
              Download
            </Button>
          </div>
        )}
      </div>
    );
  };
  
  const renderVideoPreview = () => {
    if (!previewUrl) {
      return (
        <div className="relative w-full h-64 sm:h-80 flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg bg-gray-800/30">
          <div className="text-center">
            <Video className="h-8 w-8 mx-auto text-gray-500 mb-2" />
            <p className="text-sm text-gray-500">Video preview unavailable</p>
          </div>
        </div>
      );
    }
    
    // Get the effective MIME type for the video element
    const validation = validateFile(file);
    const effectiveType = getEffectiveMimeType(validation);
    
    return (
      <div className="relative group w-full h-64 sm:h-80 rounded-lg overflow-hidden bg-gray-900">
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          className="w-full h-full object-cover"
          controls={false} // We provide custom controls
          preload="metadata"
          onLoadedMetadata={() => {
            const video = mediaRef.current as HTMLVideoElement;
            if (video) {
              setMediaState(prev => ({ ...prev, duration: video.duration }));
            }
          }}
          onTimeUpdate={() => {
            const video = mediaRef.current as HTMLVideoElement;
            if (video) {
              setMediaState(prev => ({ ...prev, currentTime: video.currentTime }));
            }
          }}
          onEnded={() => {
            setMediaState(prev => ({ ...prev, isPlaying: false }));
          }}
          onError={(e) => {
            console.error('Video playback error:', e);
            console.log('File details:', { name: file.name, type: file.type, effectiveType });
          }}
        >
          <source src={previewUrl} type={effectiveType} />
          Your browser does not support the video tag.
        </video>
        
        {/* Floating File Info Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
            <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
              <div className={`p-1.5 rounded-md ${getTypeColor()}`}>
                {getFileIcon()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate max-w-[200px]">
                  {file.name}
                </p>
                <p className="text-xs text-gray-300">{formatFileSize(file.size)}</p>
              </div>
            </div>
            {showRemove && onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="bg-black/60 backdrop-blur-sm text-gray-300 hover:text-red-400 hover:bg-red-500/20 h-9 w-9 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Video Controls - Always Visible */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
          <div className="flex items-center space-x-2 text-white">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlayPause}
              className="hover:bg-white/20 h-9 w-9 p-0"
            >
              {mediaState.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1 flex items-center space-x-2">
              <span className="text-xs hidden sm:inline">{formatTime(mediaState.currentTime)}</span>
              <div className="flex-1 h-1 bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-100"
                  style={{ width: `${(mediaState.currentTime / mediaState.duration) * 100}%` }}
                />
              </div>
              <span className="text-xs hidden sm:inline">{formatTime(mediaState.duration)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="hover:bg-white/20 h-9 w-9 p-0"
            >
              {mediaState.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="hover:bg-white/20 h-9 w-9 p-0"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };
  
  const renderAudioPreview = () => {
    return (
      <div className="relative w-full h-64 sm:h-80 bg-gradient-to-br from-purple-900/20 to-purple-700/20 rounded-lg group cursor-pointer">
        {/* Large Audio Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`p-8 rounded-full ${getTypeColor()}`}>
            <Music className="h-12 w-12" />
          </div>
        </div>
        
        {/* Audio Waveform Visualization */}
        <div className="absolute bottom-20 left-6 right-6 flex items-end justify-center space-x-1 opacity-30">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="bg-purple-400 rounded-full transition-all duration-300"
              style={{
                width: '3px',
                height: `${Math.random() * 40 + 10}px`,
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>
        
        {/* Floating File Info Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
            <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
              <div className={`p-1.5 rounded-md ${getTypeColor()}`}>
                {getFileIcon()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate max-w-[200px]">
                  {file.name}
                </p>
                <p className="text-xs text-gray-300">{formatFileSize(file.size)}</p>
              </div>
            </div>
            {showRemove && onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="bg-black/60 backdrop-blur-sm text-gray-300 hover:text-red-400 hover:bg-red-500/20 h-9 w-9 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Audio Controls - Always Visible */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
          <div className="flex items-center space-x-2 text-white">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlayPause}
              className="hover:bg-white/20 h-9 w-9 p-0"
            >
              {mediaState.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1 flex items-center space-x-2">
              <span className="text-xs hidden sm:inline">{formatTime(mediaState.currentTime)}</span>
              <div className="flex-1 h-1 bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 transition-all duration-100"
                  style={{ width: `${(mediaState.currentTime / mediaState.duration) * 100}%` }}
                />
              </div>
              <span className="text-xs hidden sm:inline">{formatTime(mediaState.duration)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="hover:bg-white/20 h-9 w-9 p-0"
            >
              {mediaState.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="hover:bg-white/20 h-9 w-9 p-0"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Hidden Audio Element */}
        {previewUrl && (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={previewUrl}
            className="hidden"
            onLoadedMetadata={() => {
              const audio = mediaRef.current as HTMLAudioElement;
              if (audio) {
                setMediaState(prev => ({ ...prev, duration: audio.duration }));
              }
            }}
            onTimeUpdate={() => {
              const audio = mediaRef.current as HTMLAudioElement;
              if (audio) {
                setMediaState(prev => ({ ...prev, currentTime: audio.currentTime }));
              }
            }}
            onEnded={() => {
              setMediaState(prev => ({ ...prev, isPlaying: false }));
            }}
          />
        )}
      </div>
    );
  };
  
  const renderDocumentPreview = () => {
    return (
      <div className="relative w-full h-64 sm:h-80 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg group cursor-pointer">
        {/* Large Document Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`p-8 rounded-full ${getTypeColor()}`}>
            {React.cloneElement(getFileIcon(), { className: 'h-12 w-12' })}
          </div>
        </div>
        
        {/* Floating File Info Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
            <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
              <div className={`p-1.5 rounded-md ${getTypeColor()}`}>
                {getFileIcon()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate max-w-[200px]">
                  {file.name}
                </p>
                <p className="text-xs text-gray-300">{formatFileSize(file.size)}</p>
              </div>
            </div>
            {showRemove && onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="bg-black/60 backdrop-blur-sm text-gray-300 hover:text-red-400 hover:bg-red-500/20 h-9 w-9 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="absolute bottom-3 right-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white border-white/20 h-9 px-4"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </div>
    );
  };
  
  const renderPreview = () => {
    const type = getFileType();
    
    switch (type) {
      case 'image':
        return renderImagePreview();
      case 'video':
        return renderVideoPreview();
      case 'audio':
        return renderAudioPreview();
      default:
        return renderDocumentPreview();
    }
  };
  
  return (
    <div className={`rounded-lg overflow-hidden ${getSizeClasses()} ${className}`}>
      {/* Full Frame Preview with Floating Info */}
      {renderPreview()}
    </div>
  );
};

export default FilePreview;