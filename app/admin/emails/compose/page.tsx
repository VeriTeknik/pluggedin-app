'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { LazyMonacoEditor } from '@/components/lazy-monaco-editor';
import { Send, Eye, Save, Users, AlertCircle, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendBulkProductUpdate, getEmailRecipients, getEmailTemplates, saveEmailTemplate } from '../actions';
import { toast } from 'sonner';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
}

export default function EmailComposePage() {
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [segment, setSegment] = useState<'all' | 'developer' | 'business' | 'enterprise'>('all');
  const [testMode, setTestMode] = useState(true);
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  useEffect(() => {
    loadTemplates();
    updateRecipientCount();
  }, []);

  useEffect(() => {
    updateRecipientCount();
  }, [segment, testMode]);

  const loadTemplates = async () => {
    const result = await getEmailTemplates();
    if (result.success && result.data) {
      setTemplates(result.data);
    }
  };

  const updateRecipientCount = async () => {
    const result = await getEmailRecipients({ segment, testMode });
    if (result.success && result.data) {
      setRecipientCount(result.data.count);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
      setSelectedTemplate(templateId);
    }
  };

  const handleSaveTemplate = async () => {
    const name = prompt('Enter template name:');
    if (!name) return;

    const result = await saveEmailTemplate({
      name,
      subject,
      content,
      category: 'other',
    });

    if (result.success) {
      toast.success('Template saved successfully');
      await loadTemplates();
    } else {
      toast.error(result.error || 'Failed to save template');
    }
  };

  const handleSend = async () => {
    if (!subject || !content) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!testMode && recipientCount > 10) {
      const confirmed = confirm(`This will send emails to ${recipientCount} users. Are you sure?`);
      if (!confirmed) return;
    }

    setSending(true);
    try {
      const result = await sendBulkProductUpdate({
        subject,
        markdownContent: content,
        segment,
        testMode,
      });

      if (result.success && result.data) {
        toast.success(`Successfully sent ${result.data.sent} emails${result.data.failed > 0 ? `, ${result.data.failed} failed` : ''}`);

        // Clear form after successful send
        if (!testMode) {
          setSubject('');
          setContent('');
        }
      } else {
        toast.error(result.error || 'Failed to send emails');
      }
    } catch (error) {
      toast.error('An error occurred while sending emails');
    } finally {
      setSending(false);
    }
  };

  const processedContent = content
    .replace(/{{firstName}}/g, 'John')
    .replace(/{{email}}/g, 'user@example.com');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Compose Email</h2>
        <p className="text-muted-foreground">
          Create and send product updates to your users
        </p>
      </div>

      {/* Recipient Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Choose who will receive this email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Test Mode</Label>
              <p className="text-sm text-muted-foreground">
                {testMode ? 'Email will only be sent to your admin address' : 'Email will be sent to all selected recipients'}
              </p>
            </div>
            <Switch
              checked={testMode}
              onCheckedChange={setTestMode}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Segment</Label>
            <Select value={segment} onValueChange={(value: any) => setSegment(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="developer">Developers</SelectItem>
                <SelectItem value="business">Business Users</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              This email will be sent to{' '}
              <strong>{recipientCount}</strong>{' '}
              {recipientCount === 1 ? 'recipient' : 'recipients'}
              {testMode && <Badge variant="secondary" className="ml-2">Test Mode</Badge>}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Email Content */}
      <Card>
        <CardHeader>
          <CardTitle>Email Content</CardTitle>
          <CardDescription>
            Compose your email using markdown formatting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Template (Optional)</Label>
            <div className="flex gap-2">
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleSaveTemplate}
                disabled={!subject || !content}
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label>Subject *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
              required
            />
          </div>

          {/* Content Editor with Preview */}
          <div className="space-y-2">
            <Label>Content *</Label>
            <Tabs defaultValue="edit" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="mt-4">
                <div className="border rounded-md">
                  <LazyMonacoEditor
                    value={content}
                    onChange={(value) => setContent(value || '')}
                    language="markdown"
                    height="400px"
                    theme="vs-light"
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      fontSize: 14,
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Available variables: {'{{firstName}}'}, {'{{email}}'}
                </p>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <div className="border rounded-md p-6 min-h-[400px] bg-white">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {processedContent || '*No content to preview*'}
                    </ReactMarkdown>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {testMode ? (
            <Alert className="inline-flex items-center gap-2 px-3 py-1">
              <AlertCircle className="h-4 w-4" />
              Test mode is enabled
            </Alert>
          ) : (
            <Alert variant="destructive" className="inline-flex items-center gap-2 px-3 py-1">
              <AlertCircle className="h-4 w-4" />
              Live mode - emails will be sent to real users
            </Alert>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSubject('');
              setContent('');
              setSelectedTemplate('');
            }}
          >
            Clear
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !subject || !content}
          >
            {sending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {testMode ? 'Send Test' : 'Send Email'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}