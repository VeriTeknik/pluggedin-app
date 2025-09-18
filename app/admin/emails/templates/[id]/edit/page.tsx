'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LazyMonacoEditor } from '@/components/lazy-monaco-editor';
import {
  getEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  getTemplateVersions
} from '../../../actions';
import {
  Save,
  Eye,
  Trash2,
  ArrowLeft,
  History,
  AlertCircle,
  Code,
  FileText,
  CheckCircle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
  version: number;
  variables?: any[];
  createdBy?: { email: string };
  updatedBy?: { email: string };
  createdAt?: string;
  updatedAt?: string;
}

interface TemplateVersion {
  id: string;
  version: number;
  subject: string;
  content: string;
  updatedAt: string;
  updatedBy?: { email: string };
}

export default function EmailTemplateEditPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('other');

  // Preview state
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [previewData, setPreviewData] = useState({
    firstName: 'John',
    email: 'john@example.com',
    username: 'johndoe',
  });

  useEffect(() => {
    if (templateId && templateId !== 'new') {
      loadTemplate();
    } else {
      setLoading(false);
    }
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      const result = await getEmailTemplate(templateId);
      if (result.success && result.data) {
        setTemplate(result.data as unknown as EmailTemplate);
        setName(result.data.name);
        setSubject(result.data.subject);
        setContent(result.data.content);
        setCategory(result.data.category);
      } else {
        toast.error(result.error || 'Failed to load template');
        router.push('/admin/emails/templates');
      }

      // Load version history
      const versionsResult = await getTemplateVersions(templateId);
      if (versionsResult.success && versionsResult.data) {
        setVersions(versionsResult.data as unknown as TemplateVersion[]);
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      toast.error('Failed to load template');
      router.push('/admin/emails/templates');
    } finally {
      setLoading(false);
    }
  };

  const extractVariables = useCallback((text: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;
    while ((match = regex.exec(text)) !== null) {
      variables.add(match[1]);
    }
    return Array.from(variables);
  }, []);

  const replaceVariables = useCallback((text: string, data: Record<string, string>): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return data[variable] || match;
    });
  }, []);

  const handleSave = async () => {
    if (!name || !subject || !content) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const result = await updateEmailTemplate(templateId, {
        name,
        subject,
        content,
        category: category as "other" | "product_update" | "feature_announcement" | "newsletter",
      });

      if (result.success) {
        toast.success('Template saved successfully');
        if (result.data) {
          setTemplate(result.data as unknown as EmailTemplate);
        }
        // Reload version history if content changed
        if (template?.content !== content || template?.subject !== subject) {
          const versionsResult = await getTemplateVersions(templateId);
          if (versionsResult.success && versionsResult.data) {
            setVersions(versionsResult.data as unknown as TemplateVersion[]);
          }
        }
      } else {
        toast.error(result.error || 'Failed to save template');
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const result = await deleteEmailTemplate(templateId);
      if (result.success) {
        toast.success('Template deleted successfully');
        router.push('/admin/emails/templates');
      } else {
        toast.error(result.error || 'Failed to delete template');
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    }
    setShowDeleteDialog(false);
  };

  const restoreVersion = (version: TemplateVersion) => {
    setSubject(version.subject);
    setContent(version.content);
    setShowVersionHistory(false);
    toast.info('Version restored. Remember to save your changes.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  const variables = extractVariables(content + ' ' + subject);
  const previewSubject = replaceVariables(subject, previewData);
  const previewContent = replaceVariables(content, previewData);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/emails/templates')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              {templateId === 'new' ? 'Create Template' : 'Edit Template'}
            </h2>
            {template && (
              <p className="text-muted-foreground">
                Version {template.version} • Last updated {new Date(template.updatedAt || '').toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {templateId !== 'new' && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                className="gap-2"
              >
                <History className="h-4 w-4" />
                History
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(true)}
                className="gap-2 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* Version History */}
      {showVersionHistory && versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Version History</CardTitle>
            <CardDescription>Previous versions of this template</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div>
                    <div className="font-medium">Version {version.version}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(version.updatedAt).toLocaleString()}
                      {version.updatedBy && ` by ${version.updatedBy.email}`}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreVersion(version)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Details */}
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
          <CardDescription>Basic information about your email template</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_update">Product Update</SelectItem>
                  <SelectItem value="feature_announcement">Feature Announcement</SelectItem>
                  <SelectItem value="newsletter">Newsletter</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Email Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Welcome to {{productName}}!"
            />
          </div>
        </CardContent>
      </Card>

      {/* Template Variables */}
      {variables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Template Variables</CardTitle>
            <CardDescription>
              These variables will be replaced with actual data when sending emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {variables.map((variable) => (
                <Badge key={variable} variant="secondary">
                  <Code className="h-3 w-3 mr-1" />
                  {`{{${variable}}}`}
                </Badge>
              ))}
            </div>
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Common variables: firstName, email, username, productName, companyName
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Content Editor */}
      <Card className="min-h-[600px]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Content</CardTitle>
              <CardDescription>
                Write your email content using Markdown formatting
              </CardDescription>
            </div>
            <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as 'edit' | 'preview')}>
              <TabsList>
                <TabsTrigger value="edit" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {previewMode === 'edit' ? (
            <div className="min-h-[400px]">
              <LazyMonacoEditor
                value={content}
                onChange={(value) => setContent(value || '')}
                language="markdown"
                theme="vs-dark"
                height="400px"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                }}
              />
            </div>
          ) : (
            <div className="min-h-[400px] space-y-4">
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground mb-1">Subject</div>
                <div className="font-medium">{previewSubject}</div>
              </div>
              <Separator />
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {previewContent}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Data (for testing variables) */}
      {previewMode === 'preview' && variables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Data</CardTitle>
            <CardDescription>
              Test how your template looks with sample data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(previewData).map(([key, value]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`preview-${key}`}>{key}</Label>
                  <Input
                    id={`preview-${key}`}
                    value={value}
                    onChange={(e) => setPreviewData({
                      ...previewData,
                      [key]: e.target.value
                    })}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template "{name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}