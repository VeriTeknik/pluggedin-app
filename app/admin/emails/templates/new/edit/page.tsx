'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { createEmailTemplate } from '../../../actions';
import {
  Save,
  Eye,
  ArrowLeft,
  AlertCircle,
  Code,
  FileText,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

export default function NewEmailTemplatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState(`Hi {{firstName}},

Welcome to our newsletter!

## Section Title

Your content here...

Best regards,
The Team`);
  const [category, setCategory] = useState('other');

  // Preview state
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [previewData, setPreviewData] = useState({
    firstName: 'John',
    email: 'john@example.com',
    username: 'johndoe',
  });

  const extractVariables = (text: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;
    while ((match = regex.exec(text)) !== null) {
      variables.add(match[1]);
    }
    return Array.from(variables);
  };

  const replaceVariables = (text: string, data: Record<string, string>): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
      return data[variable] || match;
    });
  };

  const handleSave = async () => {
    if (!name || !subject || !content) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const result = await createEmailTemplate({
        name,
        subject,
        content,
        category,
      });

      if (result.success && result.data) {
        toast.success('Template created successfully');
        router.push(`/admin/emails/templates/${result.data.id}/edit`);
      } else {
        toast.error(result.error || 'Failed to create template');
      }
    } catch (error) {
      console.error('Failed to create template:', error);
      toast.error('Failed to create template');
    } finally {
      setSaving(false);
    }
  };

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
            <h2 className="text-3xl font-bold tracking-tight">Create Email Template</h2>
            <p className="text-muted-foreground">
              Create a reusable template for your email campaigns
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Creating...' : 'Create Template'}
        </Button>
      </div>

      {/* Template Details */}
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
          <CardDescription>Basic information about your email template</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Email"
                required
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
            <Label htmlFor="subject">Email Subject *</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Welcome to {{productName}}!"
              required
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
              <CardTitle>Email Content *</CardTitle>
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
              {/* Add fields for other common variables */}
              {variables
                .filter(v => !Object.keys(previewData).includes(v))
                .slice(0, 3)
                .map((variable) => (
                  <div key={variable} className="space-y-2">
                    <Label htmlFor={`preview-${variable}`}>{variable}</Label>
                    <Input
                      id={`preview-${variable}`}
                      placeholder={`Enter ${variable}`}
                      onChange={(e) => setPreviewData({
                        ...previewData,
                        [variable]: e.target.value
                      })}
                    />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}