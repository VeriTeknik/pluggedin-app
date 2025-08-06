'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Point, Area } from 'react-easy-crop';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { ZoomIn, RotateCw } from 'lucide-react';

interface ImageCropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onCropComplete: (croppedImage: Blob) => void;
  aspectRatio?: number;
  cropShape?: 'rect' | 'round';
}

export function ImageCropperDialog({
  open,
  onOpenChange,
  imageUrl,
  onCropComplete,
  aspectRatio = 1,
  cropShape = 'round',
}: ImageCropperDialogProps) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = (crop: Point) => {
    setCrop(crop);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onRotationChange = (rotation: number) => {
    setRotation(rotation);
  };

  const onCropAreaChange = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation = 0
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    const maxSize = Math.max(image.width, image.height);
    const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

    canvas.width = safeArea;
    canvas.height = safeArea;

    ctx.translate(safeArea / 2, safeArea / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-safeArea / 2, -safeArea / 2);

    ctx.drawImage(
      image,
      safeArea / 2 - image.width * 0.5,
      safeArea / 2 - image.height * 0.5
    );

    const data = ctx.getImageData(0, 0, safeArea, safeArea);

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.putImageData(
      data,
      Math.round(0 - safeArea / 2 + image.width * 0.5 - pixelCrop.x),
      Math.round(0 - safeArea / 2 + image.height * 0.5 - pixelCrop.y)
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, 'image/jpeg', 0.95);
    });
  };

  const handleCrop = async () => {
    if (!croppedAreaPixels) return;

    try {
      setIsProcessing(true);
      const croppedImage = await getCroppedImg(imageUrl, croppedAreaPixels, rotation);
      onCropComplete(croppedImage);
      onOpenChange(false);
      
      // Reset state
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    } catch (error) {
      console.error('Error cropping image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('common.cropImage', 'Adjust Image')}</DialogTitle>
          <DialogDescription>
            {t('common.cropImageDescription', 'Move and resize the image to fit perfectly')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full h-[400px] bg-gray-100 dark:bg-gray-900">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            cropShape={cropShape}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onRotationChange={onRotationChange}
            onCropComplete={onCropAreaChange}
            showGrid={false}
          />
        </div>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ZoomIn className="h-4 w-4" />
              <label className="text-sm font-medium">
                {t('common.zoom', 'Zoom')}
              </label>
            </div>
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={1}
              max={3}
              step={0.1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <RotateCw className="h-4 w-4" />
              <label className="text-sm font-medium">
                {t('common.rotation', 'Rotation')}
              </label>
            </div>
            <Slider
              value={[rotation]}
              onValueChange={([value]) => setRotation(value)}
              min={-180}
              max={180}
              step={1}
              className="w-full"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleCrop} disabled={isProcessing}>
            {isProcessing ? t('common.processing', 'Processing...') : t('common.apply', 'Apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}