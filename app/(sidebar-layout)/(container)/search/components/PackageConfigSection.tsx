'use client';

import { AlertCircle, CheckCircle, Info, Loader2, Package } from 'lucide-react';
import { useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  checkPackageAvailability,
  type GitHubRepoData,
  type PackageInfo} from '@/app/actions/registry-intelligence';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { suggestNextVersion } from '@/lib/registry/registry-utils';
import { cn } from '@/lib/utils';

interface PackageConfigSectionProps {
  form: UseFormReturn<any>;
  packageInfo?: PackageInfo;
  repoData?: GitHubRepoData;
}

interface AvailabilityStatus {
  checking: boolean;
  available?: boolean;
  currentVersion?: string;
  error?: string;
}

export function PackageConfigSection({ form, packageInfo, repoData }: PackageConfigSectionProps) {
  const { t } = useTranslation();
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>({ checking: false });
  
  const packageRegistry = form.watch('packageRegistry');
  const packageName = form.watch('packageName');
  // const packageVersion = form.watch('packageVersion');

  // Check package availability when name or registry changes
  useEffect(() => {
    if (!packageRegistry || !packageName) {
      setAvailabilityStatus({ checking: false });
      return;
    }

    const checkAvailability = async () => {
      setAvailabilityStatus({ checking: true });

      try {
        const result = await checkPackageAvailability(
          packageRegistry as 'npm' | 'docker' | 'pypi',
          packageName
        );

        setAvailabilityStatus({
          checking: false,
          available: result.available,
          currentVersion: result.currentVersion,
          error: result.error
        });
      } catch (_error) {
        setAvailabilityStatus({
          checking: false,
          error: 'Failed to check package availability'
        });
      }
    };

    const timer = setTimeout(checkAvailability, 500);
    return () => clearTimeout(timer);
  }, [packageRegistry, packageName]);

  const getPackageStatusIcon = () => {
    if (availabilityStatus.checking) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (availabilityStatus.error) return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    if (availabilityStatus.available === false) return <AlertCircle className="h-4 w-4 text-destructive" />;
    if (availabilityStatus.available === true) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return null;
  };

  const getPackageStatusText = () => {
    if (availabilityStatus.checking) return 'Checking availability...';
    if (availabilityStatus.error) return availabilityStatus.error;
    if (availabilityStatus.available === false) {
      return `Package already exists (v${availabilityStatus.currentVersion})`;
    }
    if (availabilityStatus.available === true) return 'Package name is available';
    return '';
  };

  const suggestVersion = () => {
    if (availabilityStatus.currentVersion) {
      const suggested = suggestNextVersion(availabilityStatus.currentVersion);
      form.setValue('packageVersion', suggested);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Package Configuration
        </CardTitle>
        <CardDescription>
          Configure how your MCP server will be distributed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="packageRegistry"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('registry.form.packageRegistry')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a package registry" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="npm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-12 text-center">NPM</Badge>
                      <span>Node Package Manager</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pypi">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-12 text-center">PyPI</Badge>
                      <span>Python Package Index</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="docker">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-12 text-center">Docker</Badge>
                      <span>Docker Hub</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="packageName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                {t('registry.form.packageName')}
                {getPackageStatusIcon()}
              </FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder={
                    packageRegistry === 'npm' ? '@owner/package-name' :
                    packageRegistry === 'docker' ? 'owner/image-name' :
                    'package-name'
                  }
                  className={cn(
                    availabilityStatus.available === false && "border-destructive",
                    availabilityStatus.available === true && "border-green-500"
                  )}
                />
              </FormControl>
              <FormMessage />
              {getPackageStatusText() && (
                <p className={cn(
                  "text-sm",
                  availabilityStatus.available === false ? "text-destructive" : "text-muted-foreground"
                )}>
                  {getPackageStatusText()}
                </p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="packageVersion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('registry.form.packageVersion')}</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <Input {...field} placeholder="0.1.0" />
                  {availabilityStatus.currentVersion && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={suggestVersion}
                    >
                      Suggest
                    </Button>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {packageInfo && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Auto-detected from repository:</strong>
              <ul className="mt-2 space-y-1 text-sm">
                {packageInfo.type && <li>• Package type: {packageInfo.type.toUpperCase()}</li>}
                {packageInfo.name && <li>• Package name: {packageInfo.name}</li>}
                {packageInfo.version && <li>• Current version: {packageInfo.version}</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {!packageInfo && repoData && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {repoData.language === 'TypeScript' || repoData.language === 'JavaScript' ? (
                <>We recommend using <strong>NPM</strong> for {repoData.language} projects.</>
              ) : repoData.language === 'Python' ? (
                <>We recommend using <strong>PyPI</strong> for Python projects.</>
              ) : (
                <>Select the package registry that best fits your project type.</>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}