'use client';

import { AlertCircle, Languages, Loader2,Save, Send, Users } from 'lucide-react';
import { useEffect,useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { LazyMonacoEditor } from '@/components/lazy-monaco-editor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type EmailTranslations,languageNames, type SupportedLanguage } from '@/lib/email-translation-service';

import { getEmailRecipients, getEmailTemplates, saveEmailTemplate, sendBulkProductUpdate, translateEmailContent } from '../actions';

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
  const [translations, setTranslations] = useState<EmailTranslations | null>(null);
  const [translating, setTranslating] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('en');

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
      setTemplates(result.data as unknown as EmailTemplate[]);
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

  const handleTranslate = async () => {
    if (!subject || !content) {
      toast.error('Please enter subject and content before translating');
      return;
    }

    setTranslating(true);
    try {
      const result = await translateEmailContent({
        subject,
        content,
        sourceLanguage: 'en', // Assuming source is English by default
      });

      if (result.success && result.data) {
        setTranslations(result.data);
        toast.success('Email translated to all languages successfully');
      } else {
        toast.error(result.error || 'Failed to translate email');
      }
    } catch (error) {
      toast.error('An error occurred while translating');
    } finally {
      setTranslating(false);
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
        translations: translations || undefined,
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

  // Get the current content based on selected language and translations
  const getCurrentContent = () => {
    if (translations && selectedLanguage !== 'en') {
      const translation = translations.translations.find(t => t.language === selectedLanguage);
      return translation?.content || content;
    }
    return content;
  };

  const getCurrentSubject = () => {
    if (translations && selectedLanguage !== 'en') {
      const translation = translations.translations.find(t => t.language === selectedLanguage);
      return translation?.subject || subject;
    }
    return subject;
  };

  const processedContent = getCurrentContent()
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

          {/* Translation Button */}
          <div className="flex justify-between items-center">
            <Label>Content *</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTranslate}
              disabled={translating || !subject || !content}
            >
              {translating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Languages className="mr-2 h-4 w-4" />
                  Auto-Translate to All Languages
                </>
              )}
            </Button>
          </div>

          {/* Language Tabs (shown when translations exist) */}
          {translations && (
            <div className="border rounded-md p-2 bg-muted/30">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">Language:</span>
                {Object.entries(languageNames).map(([code, name]) => {
                  const hasTranslation = translations.translations.some(t => t.language === code);
                  return (
                    <Button
                      key={code}
                      variant={selectedLanguage === code ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedLanguage(code as SupportedLanguage)}
                      disabled={!hasTranslation}
                      className="text-xs"
                    >
                      {name}
                      {hasTranslation && translations.translations.find(t => t.language === code)?.success === false && (
                        <AlertCircle className="ml-1 h-3 w-3 text-destructive" />
                      )}
                    </Button>
                  );
                })}
              </div>
              {selectedLanguage !== 'en' && (
                <div className="mt-2 p-2 bg-background rounded">
                  <p className="text-sm font-medium mb-1">Translated Subject:</p>
                  <p className="text-sm text-muted-foreground">{getCurrentSubject()}</p>
                </div>
              )}
            </div>
          )}

          {/* Content Editor with Preview */}
          <div className="space-y-2">
            <Tabs defaultValue="edit" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="mt-4">
                <div className="border rounded-md">
                  <LazyMonacoEditor
                    value={selectedLanguage === 'en' ? content : getCurrentContent()}
                    onChange={(value) => {
                      if (selectedLanguage === 'en') {
                        setContent(value || '');
                        // Clear translations if original content is edited
                        if (translations) {
                          setTranslations(null);
                        }
                      }
                    }}
                    language="markdown"
                    height="400px"
                    theme="vs-light"
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      fontSize: 14,
                      readOnly: selectedLanguage !== 'en',
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