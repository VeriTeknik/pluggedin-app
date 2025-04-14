'use client';

// Third-party imports
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Internal imports
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
import { useMounted } from '@/hooks/use-mounted';
import { fontFamilies, FontFamily, setFont } from '@/lib/font-utils';

const fonts = [
  { value: 'geist', label: 'settings.appearance.fonts.geist' },
  { value: 'quicksand', label: 'settings.appearance.fonts.quicksand' },
  { value: 'nunito', label: 'settings.appearance.fonts.nunito' },
  { value: 'poppins', label: 'settings.appearance.fonts.poppins' },
  { value: 'roboto', label: 'settings.appearance.fonts.roboto' },
  { value: 'ubuntu', label: 'settings.appearance.fonts.ubuntu' },
  { value: 'varela-round', label: 'settings.appearance.fonts.varelaRound' },
  { value: 'work-sans', label: 'settings.appearance.fonts.workSans' },
  { value: 'zilla-slab', label: 'settings.appearance.fonts.zillaSlab' },
  { value: 'comfortaa', label: 'settings.appearance.fonts.comfortaa' }
];

export function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [currentFont, setCurrentFont] = useState<FontFamily>('geist');
  
  // Get the saved font on component mount
  useEffect(() => {
    const savedFont = localStorage.getItem('pluggedin-font') as FontFamily;
    if (savedFont && savedFont in fontFamilies) {
      setCurrentFont(savedFont);
      setFont(savedFont);
    }
  }, []);

  const handleFontChange = (fontName: string) => {
    const newFont = fontName as FontFamily;
    setFont(newFont);
    setCurrentFont(newFont);
  };

  if (!mounted) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.appearance.title')}</CardTitle>
        <CardDescription>
          {t('settings.appearance.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t('settings.appearance.colorTheme')}</Label>
          <div className="flex items-center space-x-4">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('light')}
            >
              {t('settings.appearance.light')}
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('dark')}
            >
              {t('settings.appearance.dark')}
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('system')}
            >
              {t('settings.appearance.system')}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t('settings.appearance.font')}</Label>
          <Select value={currentFont} onValueChange={handleFontChange}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder={t('settings.appearance.selectFont')} />
            </SelectTrigger>
            <SelectContent>
              {fonts.map((font) => (
                <SelectItem key={font.value} value={font.value} className={`font-${font.value}`}>
                  {t(font.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
