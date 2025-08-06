'use client';

import { ImagePlus, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

  const sizeClasses = {
    sm: 'h-12 w-12',
    md: 'h-16 w-16',
    lg: 'h-20 w-20',
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);

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
          onChange={handleAvatarUpload}
          disabled={isUploading}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('common.avatarHint', 'Max 1MB, PNG or JPG')}
        </p>
      </div>
    </div>
  );
}