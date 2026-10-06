'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Save, 
  X, 
  Edit3, 
  Camera, 
  MapPin, 
  Calendar, 
  Star,
  Tag,
  User,
  FileText,
  Info,
  Globe,
  Clock,
  Aperture,
  Zap,
  Palette,
  Ruler,
  RotateCw
} from 'lucide-react';
import { 
  ExifData, 
  EditableExifData, 
  extractExifData, 
  getEditableMetadata, 
  createFileWithUpdatedMetadata,
  formatFileSize,
  formatDuration,
  validateFileName
} from '@/lib/exif-utils';

interface FileMetadataEditorProps {
  file: File | any; // Allow mock file objects
  onSave?: (updatedFile: File | any, metadata: EditableExifData) => void;
  onCancel?: () => void;
  className?: string;
}

export const FileMetadataEditor: React.FC<FileMetadataEditorProps> = ({
  file,
  onSave,
  onCancel,
  className = ''
}) => {
  const [exifData, setExifData] = useState<ExifData | null>(null);
  const [editableData, setEditableData] = useState<EditableExifData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('basic');

  async function loadExifData() {
    setIsLoading(true);
    try {
      // Validate file object
      if (!file || !file.name) {
        throw new Error('Invalid file object');
      }
      
      const data = await extractExifData(file);
      setExifData(data);
      setEditableData(getEditableMetadata(data));
    } catch (error) {
      console.error('Failed to load EXIF data:', error);
      // Create minimal data structure for graceful fallback
      const fallbackData = {
        fileName: file?.name || 'Unknown',
        fileSize: file?.size || 0,
        fileType: file?.type || 'application/octet-stream',
        lastModified: file?.lastModified ? new Date(file.lastModified) : new Date()
      };
      setExifData(fallbackData);
      setEditableData(getEditableMetadata(fallbackData));
    } finally {
      setIsLoading(false);
    }
  }


  useEffect(() => {
    let active = true;
    const load = async () => {
      try { return await extractExifData(file); }
      catch {
        return { fileName: file?.name || 'Unknown', fileSize: file?.size || 0,
          fileType: file?.type || 'application/octet-stream',
          lastModified: file?.lastModified ? new Date(file.lastModified) : new Date() };
      }
    };
    void load().then(data => {
      if (!active) return;
      setExifData(data);
      setEditableData(getEditableMetadata(data));
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [file]);

  const handleInputChange = (field: keyof EditableExifData, value: any) => {
    if (!editableData) return;
    
    setEditableData({
      ...editableData,
      [field]: value
    });
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleKeywordsChange = (value: string) => {
    const keywords = value.split(',').map(k => k.trim()).filter(k => k.length > 0);
    handleInputChange('keywords', keywords);
  };

  const validateForm = (): boolean => {
    if (!editableData) return false;
    
    const newErrors: Record<string, string> = {};
    
    // Validate file name
    const fileNameValidation = validateFileName(editableData.fileName);
    if (!fileNameValidation.isValid) {
      newErrors.fileName = fileNameValidation.error!;
    }
    
    // Validate rating
    if (editableData.rating && (editableData.rating < 0 || editableData.rating > 5)) {
      newErrors.rating = 'Rating must be between 0 and 5';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!editableData || !validateForm()) return;
    
    setIsSaving(true);
    try {
      const updatedFile = createFileWithUpdatedMetadata(file, editableData);
      onSave?.(updatedFile, editableData);
    } catch (error) {
      console.error('Failed to save metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderRatingStars = () => {
    const rating = editableData?.rating || 0;
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => handleInputChange('rating', star === rating ? 0 : star)}
            className="focus:outline-none"
          >
            <Star 
              className={`w-5 h-5 ${
                star <= rating 
                  ? 'text-yellow-400 fill-yellow-400' 
                  : 'text-gray-300 hover:text-yellow-300'
              }`}
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-gray-600">
          {rating > 0 ? `${rating} star${rating > 1 ? 's' : ''}` : 'No rating'}
        </span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading metadata...</p>
        </div>
      </div>
    );
  }

  if (!exifData || !editableData) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No metadata available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`file-metadata-editor ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Edit3 className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Edit File Metadata</h3>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic" className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-1">
            <Info className="w-4 h-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="camera" className="flex items-center gap-1">
            <Camera className="w-4 h-4" />
            Camera
          </TabsTrigger>
          <TabsTrigger value="location" className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            Location
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[500px] mt-4">
          <TabsContent value="basic" className="space-y-4">
            {/* File Name */}
            <div className="space-y-2">
              <Label htmlFor="fileName" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                File Name
              </Label>
              <Input
                id="fileName"
                value={editableData.fileName}
                onChange={(e) => handleInputChange('fileName', e.target.value)}
                placeholder="Enter file name..."
                className={errors.fileName ? 'border-red-500' : ''}
              />
              {errors.fileName && (
                <p className="text-sm text-red-500">{errors.fileName}</p>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Title
              </Label>
              <Input
                id="title"
                value={editableData.title || ''}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter title..."
              />
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="subject" className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Subject
              </Label>
              <Input
                id="subject"
                value={editableData.subject || ''}
                onChange={(e) => handleInputChange('subject', e.target.value)}
                placeholder="Enter subject..."
              />
            </div>

            {/* Keywords */}
            <div className="space-y-2">
              <Label htmlFor="keywords" className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Keywords
              </Label>
              <Input
                id="keywords"
                value={editableData.keywords?.join(', ') || ''}
                onChange={(e) => handleKeywordsChange(e.target.value)}
                placeholder="Enter keywords separated by commas..."
              />
              <p className="text-xs text-gray-500">Separate multiple keywords with commas</p>
            </div>

            {/* Rating */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Star className="w-4 h-4" />
                Rating
              </Label>
              {renderRatingStars()}
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Comment
              </Label>
              <Textarea
                id="comment"
                value={editableData.comment || ''}
                onChange={(e) => handleInputChange('comment', e.target.value)}
                placeholder="Enter comments..."
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            {/* Artist */}
            <div className="space-y-2">
              <Label htmlFor="artist" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Artist/Author
              </Label>
              <Input
                id="artist"
                value={editableData.artist || ''}
                onChange={(e) => handleInputChange('artist', e.target.value)}
                placeholder="Enter artist name..."
              />
            </div>

            {/* Copyright */}
            <div className="space-y-2">
              <Label htmlFor="copyright" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Copyright
              </Label>
              <Input
                id="copyright"
                value={editableData.copyright || ''}
                onChange={(e) => handleInputChange('copyright', e.target.value)}
                placeholder="Enter copyright information..."
              />
            </div>

            {/* Software */}
            <div className="space-y-2">
              <Label htmlFor="software" className="flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Software
              </Label>
              <Input
                id="software"
                value={editableData.software || ''}
                onChange={(e) => handleInputChange('software', e.target.value)}
                placeholder="Enter software used..."
              />
            </div>

            {/* Date/Time */}
            <div className="space-y-2">
              <Label htmlFor="datetime" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date & Time
              </Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={editableData.datetime ? editableData.datetime.toISOString().slice(0, 16) : ''}
                onChange={(e) => handleInputChange('datetime', e.target.value ? new Date(e.target.value) : undefined)}
              />
            </div>

            {/* File Information (Read-only) */}
            <Separator />
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">File Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">File Size:</span>
                  <span className="ml-2 font-medium">{formatFileSize(exifData.fileSize)}</span>
                </div>
                <div>
                  <span className="text-gray-600">File Type:</span>
                  <span className="ml-2 font-medium">{exifData.fileType}</span>
                </div>
                <div>
                  <span className="text-gray-600">Last Modified:</span>
                  <span className="ml-2 font-medium">{exifData.lastModified.toLocaleDateString()}</span>
                </div>
                {exifData.imageWidth && exifData.imageHeight && (
                  <div>
                    <span className="text-gray-600">Dimensions:</span>
                    <span className="ml-2 font-medium">{exifData.imageWidth} × {exifData.imageHeight}</span>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="camera" className="space-y-4">
            {exifData.make || exifData.model || exifData.exposureTime || exifData.fNumber ? (
              <div className="space-y-4">
                {/* Camera Info */}
                {(exifData.make || exifData.model) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Camera className="w-4 h-4" />
                        Camera Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {exifData.make && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Make:</span>
                          <span className="font-medium">{exifData.make}</span>
                        </div>
                      )}
                      {exifData.model && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Model:</span>
                          <span className="font-medium">{exifData.model}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Camera Settings */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Aperture className="w-4 h-4" />
                      Camera Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {exifData.exposureTime && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Shutter Speed:</span>
                        <span className="font-medium">{exifData.exposureTime}s</span>
                      </div>
                    )}
                    {exifData.fNumber && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Aperture:</span>
                        <span className="font-medium">f/{exifData.fNumber}</span>
                      </div>
                    )}
                    {exifData.iso && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">ISO:</span>
                        <span className="font-medium">{exifData.iso}</span>
                      </div>
                    )}
                    {exifData.focalLength && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Focal Length:</span>
                        <span className="font-medium">{exifData.focalLength}mm</span>
                      </div>
                    )}
                    {exifData.flash && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Flash:</span>
                        <span className="font-medium">{exifData.flash}</span>
                      </div>
                    )}
                    {exifData.whiteBalance && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">White Balance:</span>
                        <span className="font-medium">{exifData.whiteBalance}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Video Metadata */}
                {(exifData.duration || exifData.videoCodec || exifData.frameRate) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Video Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {exifData.duration && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Duration:</span>
                          <span className="font-medium">{formatDuration(exifData.duration)}</span>
                        </div>
                      )}
                      {exifData.videoCodec && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Video Codec:</span>
                          <span className="font-medium">{exifData.videoCodec}</span>
                        </div>
                      )}
                      {exifData.audioCodec && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Audio Codec:</span>
                          <span className="font-medium">{exifData.audioCodec}</span>
                        </div>
                      )}
                      {exifData.frameRate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Frame Rate:</span>
                          <span className="font-medium">{exifData.frameRate} fps</span>
                        </div>
                      )}
                      {exifData.bitrate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bitrate:</span>
                          <span className="font-medium">{Math.round(exifData.bitrate / 1000)} kbps</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No camera metadata available</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="location" className="space-y-4">
            {/* GPS Coordinates (Read-only) */}
            {(exifData.gpsLatitude || exifData.gpsLongitude) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    GPS Coordinates
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {exifData.gpsLatitude && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Latitude:</span>
                      <span className="font-medium">{exifData.gpsLatitude.toFixed(6)}°</span>
                    </div>
                  )}
                  {exifData.gpsLongitude && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Longitude:</span>
                      <span className="font-medium">{exifData.gpsLongitude.toFixed(6)}°</span>
                    </div>
                  )}
                  {exifData.gpsAltitude && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Altitude:</span>
                      <span className="font-medium">{exifData.gpsAltitude.toFixed(1)}m</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Location Name */}
            <div className="space-y-2">
              <Label htmlFor="locationName" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Location Name
              </Label>
              <Input
                id="locationName"
                value={editableData.locationName || ''}
                onChange={(e) => handleInputChange('locationName', e.target.value)}
                placeholder="Enter location name..."
              />
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                City
              </Label>
              <Input
                id="city"
                value={editableData.city || ''}
                onChange={(e) => handleInputChange('city', e.target.value)}
                placeholder="Enter city..."
              />
            </div>

            {/* State */}
            <div className="space-y-2">
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={editableData.state || ''}
                onChange={(e) => handleInputChange('state', e.target.value)}
                placeholder="Enter state or province..."
              />
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={editableData.country || ''}
                onChange={(e) => handleInputChange('country', e.target.value)}
                placeholder="Enter country..."
              />
            </div>

            {(!exifData.gpsLatitude && !exifData.gpsLongitude) && (
              <div className="text-center py-4">
                <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No GPS data found in file</p>
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};

export default FileMetadataEditor;