'use client';

import { AlertTriangle, FileText, HardDrive, Upload } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// 100 MB storage limit
const STORAGE_LIMIT = 100 * 1024 * 1024; // 100 MB in bytes

export interface DocsStatsProps {
  totalDocs: number;
  totalSize: number;
  recentUploads: number;
  formatFileSize: (bytes: number) => string;
}

export function DocsStats({ 
  totalDocs, 
  totalSize, 
  recentUploads, 
  formatFileSize 
}: DocsStatsProps) {
  // Calculate storage usage percentage
  const storagePercentage = Math.min((totalSize / STORAGE_LIMIT) * 100, 100);
  const isNearLimit = storagePercentage >= 80;
  const isOverLimit = storagePercentage >= 95;

  const stats = [
    {
      title: 'Total Documents',
      value: totalDocs.toString(),
      icon: FileText,
      description: 'Documents in your collection',
    },
    {
      title: 'Storage Used',
      value: formatFileSize(totalSize),
      icon: HardDrive,
      description: `${formatFileSize(STORAGE_LIMIT)} limit`,
      isStorage: true,
    },
    {
      title: 'Recent Uploads',
      value: recentUploads.toString(),
      icon: Upload,
      description: 'Uploaded in last 7 days',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.title} className={cn(
          stat.isStorage && isOverLimit && 'border-destructive',
          stat.isStorage && isNearLimit && !isOverLimit && 'border-yellow-500'
        )}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <div className="flex items-center gap-1">
              {stat.isStorage && (isNearLimit || isOverLimit) && (
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  isOverLimit ? "text-destructive" : "text-yellow-500"
                )} />
              )}
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
            {stat.isStorage && (
              <div className="mt-2 space-y-1">
                <Progress 
                  value={storagePercentage} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs">
                  <span className={cn(
                    "text-muted-foreground",
                    isOverLimit && "text-destructive",
                    isNearLimit && !isOverLimit && "text-yellow-600"
                  )}>
                    {storagePercentage.toFixed(1)}% used
                  </span>
                  {isNearLimit && (
                    <span className={cn(
                      "font-medium",
                      isOverLimit ? "text-destructive" : "text-yellow-600"
                    )}>
                      {isOverLimit ? 'Limit exceeded!' : 'Near limit!'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 