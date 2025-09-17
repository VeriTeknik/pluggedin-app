'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getEmailTemplates, deleteEmailTemplate } from '../actions';
import { FileText, Plus, Edit, Trash2, Copy, Clock } from 'lucide-react';
import Link from 'next/link';
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
import { useRouter } from 'next/navigation';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: { email: string };
  updatedBy?: { email: string };
}

export default function EmailTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);

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

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      const result = await deleteEmailTemplate(templateToDelete.id);
      if (result.success) {
        toast.success('Template deleted successfully');
        setTemplates(templates.filter(t => t.id !== templateToDelete.id));
      } else {
        toast.error(result.error || 'Failed to delete template');
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const confirmDelete = (template: EmailTemplate) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
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
        <Link href="/admin/emails/templates/new/edit">
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
            <Link href="/admin/emails/templates/new/edit">
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
                  {template.version && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Version {template.version}
                      {template.updatedAt && ` • ${new Date(template.updatedAt).toLocaleDateString()}`}
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Link href={`/admin/emails/templates/${template.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit className="mr-2 h-3 w-3" />
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/admin/emails/compose?template=${template.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full">
                        <Copy className="mr-2 h-3 w-3" />
                        Use
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirmDelete(template)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template "{templateToDelete?.name}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTemplateToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}