/**
 * EXIF data extraction and manipulation utilities
 */

import * as exifr from 'exifr';

export interface ExifData {
  // Basic file info
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: Date;
  
  // Image EXIF data
  make?: string;
  model?: string;
  datetime?: Date;
  software?: string;
  artist?: string;
  copyright?: string;
  imageDescription?: string;
  
  // Camera settings
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  flash?: string;
  whiteBalance?: string;
  
  // Image dimensions
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number;
  
  // GPS data
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  gpsDatetime?: Date;
  
  // Video metadata
  duration?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  frameRate?: number;
  
  // Raw EXIF data for advanced editing
  rawExif?: Record<string, any>;
}

export interface EditableExifData {
  fileName: string;
  imageDescription?: string;
  artist?: string;
  copyright?: string;
  software?: string;
  datetime?: Date;
  
  // Custom metadata
  title?: string;
  subject?: string;
  keywords?: string[];
  comment?: string;
  rating?: number; // 1-5 stars
  
  // Location (editable)
  locationName?: string;
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Extract EXIF data from a file
 */
export async function extractExifData(file: File | any): Promise<ExifData> {
  // Handle both real File objects and mock file objects
  const baseData: ExifData = {
    fileName: file.name || 'Unknown',
    fileSize: file.size || 0,
    fileType: file.type || 'application/octet-stream',
    lastModified: file.lastModified ? new Date(file.lastModified) : new Date()
  };

  // Only process image and video files
  const fileType = file.type || '';
  if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) {
    return baseData;
  }

  // Skip EXIF extraction for mock files (they don't have real file data)
  if (!file.arrayBuffer || !file.slice) {
    console.warn('Mock file detected, skipping EXIF extraction');
    return baseData;
  }

  try {
    // Use exifr for comprehensive EXIF extraction
    const exifData = await exifr.parse(file, {
      pick: [
        // Basic EXIF
        'Make', 'Model', 'DateTime', 'Software', 'Artist', 'Copyright',
        'ImageDescription', 'ImageWidth', 'ImageHeight', 'Orientation',
        
        // Camera settings
        'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'Flash', 'WhiteBalance',
        
        // GPS data
        'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSDateTimeStamp',
        
        // Video metadata
        'Duration', 'VideoCodec', 'AudioCodec', 'Bitrate', 'FrameRate'
      ]
    });

    if (exifData) {
      return {
        ...baseData,
        make: exifData.Make,
        model: exifData.Model,
        datetime: exifData.DateTime ? new Date(exifData.DateTime) : undefined,
        software: exifData.Software,
        artist: exifData.Artist,
        copyright: exifData.Copyright,
        imageDescription: exifData.ImageDescription,
        
        exposureTime: exifData.ExposureTime ? `1/${Math.round(1 / exifData.ExposureTime)}` : undefined,
        fNumber: exifData.FNumber,
        iso: exifData.ISO,
        focalLength: exifData.FocalLength,
        flash: formatFlash(exifData.Flash),
        whiteBalance: formatWhiteBalance(exifData.WhiteBalance),
        
        imageWidth: exifData.ImageWidth,
        imageHeight: exifData.ImageHeight,
        orientation: exifData.Orientation,
        
        gpsLatitude: exifData.GPSLatitude,
        gpsLongitude: exifData.GPSLongitude,
        gpsAltitude: exifData.GPSAltitude,
        gpsDatetime: exifData.GPSDateTimeStamp ? new Date(exifData.GPSDateTimeStamp) : undefined,
        
        duration: exifData.Duration,
        videoCodec: exifData.VideoCodec,
        audioCodec: exifData.AudioCodec,
        bitrate: exifData.Bitrate,
        frameRate: exifData.FrameRate,
        
        rawExif: exifData
      };
    }
  } catch (error) {
    console.warn('Failed to extract EXIF data:', error);
  }

  return baseData;
}

/**
 * Extract editable metadata from ExifData
 */
export function getEditableMetadata(exifData: ExifData): EditableExifData {
  return {
    fileName: exifData.fileName,
    imageDescription: exifData.imageDescription,
    artist: exifData.artist,
    copyright: exifData.copyright,
    software: exifData.software,
    datetime: exifData.datetime,
    
    // Initialize custom fields
    title: exifData.imageDescription,
    subject: '',
    keywords: [],
    comment: '',
    rating: 0,
    
    // Location from GPS or manual entry
    locationName: '',
    city: '',
    state: '',
    country: ''
  };
}

/**
 * Create a new file with updated metadata
 * Note: This creates a new file object with updated name and internal metadata.
 * Actual EXIF writing to image files would require server-side processing.
 */
export function createFileWithUpdatedMetadata(
  originalFile: File | any, 
  editedData: EditableExifData
): File | any {
  try {
    // Handle real File objects
    if (originalFile instanceof File) {
      // Create new file with updated name
      const newFile = new File([originalFile], editedData.fileName, {
        type: originalFile.type,
        lastModified: editedData.datetime?.getTime() || originalFile.lastModified
      });

      // Add custom metadata as properties (for UI tracking)
      (newFile as any).customMetadata = {
        title: editedData.title,
        subject: editedData.subject,
        keywords: editedData.keywords,
        comment: editedData.comment,
        rating: editedData.rating,
        artist: editedData.artist,
        copyright: editedData.copyright,
        locationName: editedData.locationName,
        city: editedData.city,
        state: editedData.state,
        country: editedData.country
      };

      return newFile;
    } else {
      // Handle mock file objects
      const updatedMockFile = {
        ...originalFile,
        name: editedData.fileName,
        lastModified: editedData.datetime?.getTime() || originalFile.lastModified,
        customMetadata: {
          title: editedData.title,
          subject: editedData.subject,
          keywords: editedData.keywords,
          comment: editedData.comment,
          rating: editedData.rating,
          artist: editedData.artist,
          copyright: editedData.copyright,
          locationName: editedData.locationName,
          city: editedData.city,
          state: editedData.state,
          country: editedData.country
        }
      };
      
      return updatedMockFile;
    }
  } catch (error) {
    console.error('Failed to create file with updated metadata:', error);
    return originalFile;
  }
}

/**
 * Format flash information
 */
function formatFlash(flash?: number): string | undefined {
  if (flash === undefined) return undefined;
  
  const flashModes = {
    0: 'No Flash',
    1: 'Flash',
    5: 'Flash, No Return',
    7: 'Flash, Return',
    9: 'Flash, Compulsory',
    13: 'Flash, Compulsory, No Return',
    15: 'Flash, Compulsory, Return',
    16: 'No Flash, Compulsory',
    24: 'No Flash, Auto',
    25: 'Flash, Auto',
    29: 'Flash, Auto, No Return',
    31: 'Flash, Auto, Return',
    32: 'No Flash Available'
  };
  
  return flashModes[flash as keyof typeof flashModes] || `Flash (${flash})`;
}

/**
 * Format white balance information
 */
function formatWhiteBalance(wb?: number): string | undefined {
  if (wb === undefined) return undefined;
  
  const whiteBalanceModes = {
    0: 'Auto',
    1: 'Manual',
    2: 'Auto White Balance',
    3: 'Manual White Balance'
  };
  
  return whiteBalanceModes[wb as keyof typeof whiteBalanceModes] || `WB (${wb})`;
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Format duration in human readable format
 */
export function formatDuration(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Validate file name
 */
export function validateFileName(fileName: string): { isValid: boolean; error?: string } {
  if (!fileName.trim()) {
    return { isValid: false, error: 'File name cannot be empty' };
  }
  
  if (fileName.length > 255) {
    return { isValid: false, error: 'File name too long (max 255 characters)' };
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
  if (invalidChars.test(fileName)) {
    return { isValid: false, error: 'File name contains invalid characters' };
  }
  
  return { isValid: true };
}