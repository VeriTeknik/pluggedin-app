'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.appearance.title', 'Appearance')}</CardTitle>
        <CardDescription>
          {t('settings.appearance.description', 'Customize the appearance of the application')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t('settings.appearance.colorTheme', 'Color Theme')}</Label>
          <div className="flex items-center space-x-4">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              {t('settings.appearance.light', 'Light')}
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              {t('settings.appearance.dark', 'Dark')}
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('system')}
            >
              {t('settings.appearance.system', 'System')}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('settings.appearance.font', 'Font')}</Label>
          <Select defaultValue="poppins">
            <SelectTrigger>
              <SelectValue placeholder={t('settings.appearance.selectFont', 'Select a font')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="poppins">Poppins</SelectItem>
              <SelectItem value="inter">Inter</SelectItem>
              <SelectItem value="roboto">Roboto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
