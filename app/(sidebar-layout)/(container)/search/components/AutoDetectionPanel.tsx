'use client';

import { AlertCircle, CheckCircle, Code, Package, Shield, User } from 'lucide-react';

import { type GitHubRepoData, type PackageInfo } from '@/app/actions/registry-intelligence';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface AutoDetectionPanelProps {
  repoData: GitHubRepoData;
  packageInfo?: PackageInfo;
  isOwner: boolean | null;
}

interface DetectionItem {
  label: string;
  value: string | null;
  status: 'success' | 'warning' | 'info';
  icon: React.ReactNode;
}

export function AutoDetectionPanel({ repoData, packageInfo, isOwner }: AutoDetectionPanelProps) {
  const detectionItems: DetectionItem[] = [
    {
      label: 'Repository',
      value: repoData.fullName,
      status: 'success',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      label: 'Package Type',
      value: packageInfo?.type 
        ? packageInfo.type.toUpperCase() 
        : repoData.language === 'TypeScript' || repoData.language === 'JavaScript' 
          ? 'NPM (suggested)' 
          : repoData.language === 'Python' 
          ? 'PyPI (suggested)' 
          : 'Not detected',
      status: packageInfo?.type ? 'success' : 'warning',
      icon: packageInfo?.type ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />
    },
    {
      label: 'Package Name',
      value: packageInfo?.name || 'Not detected',
      status: packageInfo?.name ? 'success' : 'info',
      icon: <Package className="h-4 w-4" />
    },
    {
      label: 'Version',
      value: packageInfo?.version || 'Not detected',
      status: packageInfo?.version ? 'success' : 'info',
      icon: <Code className="h-4 w-4" />
    },
    {
      label: 'Ownership',
      value: isOwner === null 
        ? 'Checking...' 
        : isOwner 
        ? 'Verified Owner' 
        : 'Community Contributor',
      status: isOwner === null ? 'info' : isOwner ? 'success' : 'info',
      icon: isOwner ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />
    }
  ];

  const detectionScore = detectionItems.filter(item => item.status === 'success').length;
  const detectionPercentage = (detectionScore / detectionItems.length) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Auto-Detection Results
          <Badge variant={detectionPercentage === 100 ? 'default' : 'secondary'}>
            {detectionScore}/{detectionItems.length} detected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={detectionPercentage} className="h-2" />
        
        <div className="space-y-2">
          {detectionItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <div className={`text-${item.status === 'success' ? 'green' : item.status === 'warning' ? 'yellow' : 'muted'}-500`}>
                  {item.icon}
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <span className={`text-sm ${item.status === 'info' ? 'text-muted-foreground' : ''}`}>
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {packageInfo && Object.keys(packageInfo.dependencies).length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Dependencies Detected</AlertTitle>
            <AlertDescription>
              Found {Object.keys(packageInfo.dependencies).length} dependencies that may indicate MCP integration patterns.
            </AlertDescription>
          </Alert>
        )}

        {repoData.topics.includes('mcp') || repoData.topics.includes('model-context-protocol') && (
          <Alert className="border-green-500">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertTitle>MCP Repository Detected</AlertTitle>
            <AlertDescription>
              This repository is tagged with MCP-related topics, indicating it&apos;s designed for the Model Context Protocol.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}