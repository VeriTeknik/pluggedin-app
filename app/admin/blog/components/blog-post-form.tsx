'use client';

import { Loader2,Upload, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';

import { createBlogPost, updateBlogPost, uploadBlogImage } from '../actions';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-[400px] flex items-center justify-center">Loading editor...</div>,
});

type BlogPostFormProps = {
  post?: any; // Existing post data for edit mode
  isEdit?: boolean;
};

type Translation = {
  uuid?: string;
  language: Locale;
  title: string;
  excerpt: string;
  content: string;
};

export function BlogPostForm({ post, isEdit = false }: BlogPostFormProps) {
  const { t } = useTranslation('blog');
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [slug, setSlug] = useState(post?.slug || '');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>(post?.status || 'draft');
  const [category, setCategory] = useState<string>(post?.category || 'announcement');
  const [tags, setTags] = useState<string[]>(post?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [headerImageUrl, setHeaderImageUrl] = useState(post?.header_image_url || '');
  const [headerImageAlt, setHeaderImageAlt] = useState(post?.header_image_alt || '');
  const [metaTitle, setMetaTitle] = useState(post?.meta_title || '');
  const [metaDescription, setMetaDescription] = useState(post?.meta_description || '');
  const [ogImageUrl, setOgImageUrl] = useState(post?.og_image_url || '');
  const [isFeatured, setIsFeatured] = useState(post?.is_featured || false);

  // Translation state
  const [currentLanguage, setCurrentLanguage] = useState<Locale>('en');
  const [translations, setTranslations] = useState<Record<Locale, Translation>>(() => {
    const initial: Record<string, Translation> = {};
    locales.forEach(lang => {
      const existing = post?.translations?.find((t: any) => t.language === lang);
      initial[lang] = existing || {
        language: lang,
        title: '',
        excerpt: '',
        content: '',
      };
      if (existing?.uuid) {
        initial[lang].uuid = existing.uuid;
      }
    });
    return initial as Record<Locale, Translation>;
  });

  // Auto-generate slug from English title
  useEffect(() => {
    if (!isEdit && translations.en.title && !slug) {
      const generatedSlug = translations.en.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setSlug(generatedSlug);
    }
  }, [translations.en.title, isEdit, slug]);

  const handleAddTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('admin.validation.imageMaxSize'));
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadBlogImage(formData);

    if (result.success && result.data) {
      setHeaderImageUrl(result.data.imageUrl);
      toast.success('Image uploaded successfully');
    } else {
      toast.error(result.error || 'Failed to upload image');
    }
    setUploading(false);
  };

  const updateTranslation = (field: keyof Translation, value: string) => {
    setTranslations(prev => ({
      ...prev,
      [currentLanguage]: {
        ...prev[currentLanguage],
        [field]: value,
      },
    }));
  };

  const validateForm = (): string | null => {
    if (!slug) return t('admin.validation.slugRequired');
    if (!/^[a-z0-9-]+$/.test(slug)) return t('admin.validation.slugInvalid');
    if (!translations.en.title) return t('admin.validation.titleRequired', { language: 'English' });
    if (!translations.en.excerpt) return t('admin.validation.excerptRequired', { language: 'English' });
    if (!translations.en.content) return t('admin.validation.contentRequired', { language: 'English' });
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);

    // Filter translations that have content
    const validTranslations = Object.values(translations).filter(
      t => t.title && t.excerpt && t.content
    );

    const formData = {
      post: {
        slug,
        status,
        category: category as any,
        tags,
        headerImageUrl,
        headerImageAlt,
        metaTitle,
        metaDescription,
        ogImageUrl,
        isFeatured,
      },
      translations: validTranslations,
    };

    const result = isEdit
      ? await updateBlogPost({ ...formData, uuid: post.uuid })
      : await createBlogPost(formData);

    if (result.success) {
      toast.success(t(isEdit ? 'admin.messages.saveSuccess' : 'admin.messages.saveSuccess'));
      router.push('/admin/blog');
      router.refresh();
    } else {
      toast.error(result.error || t('admin.messages.saveError'));
    }
    setSaving(false);
  };

  const currentTranslation = translations[currentLanguage];
  const hasTranslation = currentTranslation.title || currentTranslation.excerpt || currentTranslation.content;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slug">{t('admin.form.slug')}</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t('admin.form.slugPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('admin.form.slugHelp', { slug: slug || 'your-slug' })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">{t('admin.form.status')}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t('status.draft')}</SelectItem>
                  <SelectItem value="published">{t('status.published')}</SelectItem>
                  <SelectItem value="archived">{t('status.archived')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">{t('admin.form.category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="announcement">{t('categories.announcement')}</SelectItem>
                  <SelectItem value="technical">{t('categories.technical')}</SelectItem>
                  <SelectItem value="product">{t('categories.product')}</SelectItem>
                  <SelectItem value="tutorial">{t('categories.tutorial')}</SelectItem>
                  <SelectItem value="case-study">{t('categories.case-study')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">{t('admin.form.tags')}</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder={t('admin.form.tagsPlaceholder')}
                />
                <Button type="button" onClick={handleAddTag} variant="outline">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="featured"
              checked={isFeatured}
              onCheckedChange={(checked) => setIsFeatured(!!checked)}
            />
            <Label htmlFor="featured" className="cursor-pointer">
              {t('admin.form.featured')}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Header Image */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.form.headerImage')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            {headerImageUrl ? (
              <div className="space-y-2">
                <img
                  src={headerImageUrl}
                  alt={headerImageAlt}
                  className="max-w-md rounded-lg border"
                />
                <div className="flex gap-2">
                  <Label htmlFor="image-upload" className="cursor-pointer">
                    <Button type="button" variant="outline" asChild>
                      <span>{t('admin.form.changeImage')}</span>
                    </Button>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setHeaderImageUrl('')}
                  >
                    {t('admin.form.removeImage')}
                  </Button>
                </div>
              </div>
            ) : (
              <Label htmlFor="image-upload" className="cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  ) : (
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {uploading ? 'Uploading...' : t('admin.form.uploadImage')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max 5MB
                  </p>
                </div>
              </Label>
            )}
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={uploading}
            />
          </div>

          {headerImageUrl && (
            <div className="space-y-2">
              <Label htmlFor="imageAlt">{t('admin.form.headerImageAlt')}</Label>
              <Input
                id="imageAlt"
                value={headerImageAlt}
                onChange={(e) => setHeaderImageAlt(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Translations */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.form.translations')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Language Switcher Buttons */}
          <div className="flex gap-2 flex-wrap">
            {locales.map(lang => (
              <Button
                key={lang}
                type="button"
                variant={currentLanguage === lang ? 'default' : 'outline'}
                onClick={() => setCurrentLanguage(lang)}
                className="relative"
              >
                {lang.toUpperCase()}
                {translations[lang].title && (
                  <span className="ml-2 h-2 w-2 rounded-full bg-green-500" />
                )}
              </Button>
            ))}
          </div>

          {/* Translation Form */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor={`title-${currentLanguage}`}>
                {t('admin.form.title')} ({currentLanguage.toUpperCase()})
              </Label>
              <Input
                id={`title-${currentLanguage}`}
                value={currentTranslation.title}
                onChange={(e) => updateTranslation('title', e.target.value)}
                placeholder={t('admin.form.titlePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`excerpt-${currentLanguage}`}>
                {t('admin.form.excerpt')} ({currentLanguage.toUpperCase()})
              </Label>
              <Textarea
                id={`excerpt-${currentLanguage}`}
                value={currentTranslation.excerpt}
                onChange={(e) => updateTranslation('excerpt', e.target.value)}
                placeholder={t('admin.form.excerptPlaceholder')}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`content-${currentLanguage}`}>
                {t('admin.form.content')} ({currentLanguage.toUpperCase()})
              </Label>
              <div className="border rounded-lg overflow-hidden">
                <MonacoEditor
                  height="400px"
                  language="markdown"
                  theme="vs-dark"
                  value={currentTranslation.content}
                  onChange={(value) => updateTranslation('content', value || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metaTitle">{t('admin.form.metaTitle')}</Label>
            <Input
              id="metaTitle"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder={translations.en.title || 'SEO title'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metaDescription">{t('admin.form.metaDescription')}</Label>
            <Textarea
              id="metaDescription"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder={translations.en.excerpt || 'SEO description'}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ogImage">{t('admin.form.ogImage')}</Label>
            <Input
              id="ogImage"
              value={ogImageUrl}
              onChange={(e) => setOgImageUrl(e.target.value)}
              placeholder={headerImageUrl || 'https://...'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('admin.actions.saving')}
            </>
          ) : (
            t('admin.actions.save')
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/blog')}
          disabled={saving}
        >
          {t('common:cancel')}
        </Button>
      </div>
    </form>
  );
}
