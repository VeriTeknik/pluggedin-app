'use client';

import { ImagePlus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImageCropperDialog } from '@/components/ui/image-cropper-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onAvatarChange: (url: string) => void;
  uploadEndpoint?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AvatarUpload({
  currentAvatarUrl,
  onAvatarChange,
  uploadEndpoint = '/api/settings/avatar',
  name = 'Avatar',
  size = 'lg',
}: AvatarUploadProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-16 w-16',
    lg: 'h-20 w-20',
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('common.error'),
        description: t('common.invalidFileType', 'Please select an image file'),
        variant: 'destructive',
      });
      return;
    }

    // Create URL for the cropper
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageUrl(imageUrl);
    setCropperOpen(true);
    
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  };

  const handleCroppedImage = async (croppedBlob: Blob) => {
    try {
      setIsUploading(true);
      
      // Create FormData with the cropped image
      const formData = new FormData();
      formData.append('avatar', croppedBlob, 'avatar.jpg');
      formData.append('preCropped', 'true'); // Tell the server it's already cropped

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || t('common.uploadError', 'Failed to upload image'));
      }

      const data = await response.json();
      onAvatarChange(data.image);

      toast({
        title: t('common.success'),
        description: t('common.avatarUploaded', 'Avatar uploaded successfully'),
      });

      // Clean up the object URL
      if (selectedImageUrl) {
        URL.revokeObjectURL(selectedImageUrl);
        setSelectedImageUrl(null);
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('common.uploadError', 'Failed to upload image'),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src={currentAvatarUrl || ''} />
          <AvatarFallback>{name?.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <Label htmlFor="avatar-upload" className="cursor-pointer">
            <div className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {isUploading ? t('common.uploading', 'Uploading...') : t('common.uploadAvatar', 'Upload Avatar')}
            </div>
          </Label>
          <Input
            id="avatar-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
            disabled={isUploading}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('common.avatarHint', 'Click to select and crop your image')}
          </p>
        </div>
      </div>

      {selectedImageUrl && (
        <ImageCropperDialog
          open={cropperOpen}
          onOpenChange={(open) => {
            setCropperOpen(open);
            if (!open && selectedImageUrl) {
              // Clean up the object URL when closing without cropping
              URL.revokeObjectURL(selectedImageUrl);
              setSelectedImageUrl(null);
            }
          }}
          imageUrl={selectedImageUrl}
          onCropComplete={handleCroppedImage}
          aspectRatio={1}
          cropShape="round"
        />
      )}
    </>
  );
}