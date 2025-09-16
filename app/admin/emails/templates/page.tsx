'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getEmailTemplates } from '../actions';
import { FileText, Plus, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const result = await getEmailTemplates();
      if (result.success && result.data) {
        setTemplates(result.data);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    const variants: Record<string, any> = {
      product_update: { variant: 'default', label: 'Product Update' },
      feature_announcement: { variant: 'secondary', label: 'Feature' },
      newsletter: { variant: 'outline', label: 'Newsletter' },
      other: { variant: 'outline', label: 'Other' },
    };

    const config = variants[category] || variants.other;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Email Templates</h2>
          <p className="text-muted-foreground">
            Manage reusable email templates for quick composition
          </p>
        </div>
        <Link href="/admin/emails/compose">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first email template to get started
            </p>
            <Link href="/admin/emails/compose">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription className="text-sm line-clamp-2">
                      {template.subject}
                    </CardDescription>
                  </div>
                  {getCategoryBadge(template.category)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground line-clamp-3">
                    {template.content.substring(0, 150)}...
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <Link href={`/admin/emails/compose?template=${template.id}`}>
                      <Button variant="outline" size="sm">
                        <Edit className="mr-2 h-3 w-3" />
                        Use Template
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Template Categories Info */}
      <Card>
        <CardHeader>
          <CardTitle>Template Categories</CardTitle>
          <CardDescription>
            Organize your templates by type for easy access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {getCategoryBadge('product_update')}
              <span className="text-sm">Regular product updates and feature releases</span>
            </div>
            <div className="flex items-center gap-2">
              {getCategoryBadge('feature_announcement')}
              <span className="text-sm">Major feature announcements and launches</span>
            </div>
            <div className="flex items-center gap-2">
              {getCategoryBadge('newsletter')}
              <span className="text-sm">Periodic newsletters and community updates</span>
            </div>
            <div className="flex items-center gap-2">
              {getCategoryBadge('other')}
              <span className="text-sm">Custom templates for specific purposes</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}