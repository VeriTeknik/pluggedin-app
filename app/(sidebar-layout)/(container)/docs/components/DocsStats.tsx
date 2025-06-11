'use client';

import { FileText, HardDrive, Upload } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      description: 'Total storage used',
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
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 