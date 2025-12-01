'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { format } from 'date-fns';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { getAllBlogPosts, deleteBlogPost } from '../actions';

type BlogPost = {
  uuid: string;
  slug: string;
  status: string;
  category: string;
  view_count: number;
  published_at: Date | null;
  created_at: Date;
  author: {
    name: string | null;
    email: string;
  };
  translations: Array<{
    language: string;
    title: string;
  }>;
};

export function BlogPostsList() {
  const { t } = useTranslation('blog');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteUuid, setDeleteUuid] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    setLoading(true);
    const result = await getAllBlogPosts();
    if (result.success && result.data) {
      setPosts(result.data as any);
    } else {
      toast.error(result.error || 'Failed to load blog posts');
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteUuid) return;

    setDeleting(true);
    const result = await deleteBlogPost(deleteUuid);

    if (result.success) {
      toast.success(t('admin.messages.deleteSuccess'));
      setPosts(posts.filter(p => p.uuid !== deleteUuid));
      setDeleteUuid(null);
    } else {
      toast.error(result.error || t('admin.messages.deleteError'));
    }
    setDeleting(false);
  }

  function getStatusBadgeVariant(status: string) {
    switch (status) {
      case 'published':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'archived':
        return 'outline';
      default:
        return 'secondary';
    }
  }

  function getCategoryBadgeVariant(category: string) {
    switch (category) {
      case 'announcement':
        return 'default';
      case 'technical':
        return 'secondary';
      case 'product':
        return 'outline';
      default:
        return 'secondary';
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">{t('admin.list.noResults')}</p>
        <Link href="/admin/blog/new">
          <Button>{t('admin.createPost')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.list.columns.title')}</TableHead>
              <TableHead>{t('admin.list.columns.category')}</TableHead>
              <TableHead>{t('admin.list.columns.status')}</TableHead>
              <TableHead>{t('admin.list.columns.author')}</TableHead>
              <TableHead>{t('admin.list.columns.published')}</TableHead>
              <TableHead>{t('admin.list.columns.views')}</TableHead>
              <TableHead className="text-right">{t('admin.list.columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => {
              const primaryTranslation = post.translations.find(t => t.language === 'en') || post.translations[0];

              return (
                <TableRow key={post.uuid}>
                  <TableCell className="font-medium">
                    {primaryTranslation?.title || 'Untitled'}
                    <div className="text-xs text-muted-foreground mt-1">
                      /{post.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getCategoryBadgeVariant(post.category)}>
                      {t(`categories.${post.category}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(post.status)}>
                      {t(`status.${post.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {post.author.name || post.author.email}
                  </TableCell>
                  <TableCell>
                    {post.published_at
                      ? format(new Date(post.published_at), 'MMM d, yyyy')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {post.view_count}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {post.status === 'published' && (
                        <Link href={`/blog/${post.slug}`} target="_blank">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                      <Link href={`/admin/blog/${post.uuid}/edit`}>
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteUuid(post.uuid)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteUuid} onOpenChange={() => setDeleteUuid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.deletePost')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.confirmDelete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('common:cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('common:deleting') : t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
