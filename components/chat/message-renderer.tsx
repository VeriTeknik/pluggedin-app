'use client';

import { Download, ExternalLink, FileText, Image } from 'lucide-react';
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  data?: string;
}

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant' | 'system';
  attachments?: FileAttachment[];
  className?: string;
}

// Custom markdown components for enhanced rendering
const MarkdownComponents = {
  // Code blocks with syntax highlighting
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match;
    
    if (isInline) {
      return (
        <code 
          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" 
          {...props}
        >
          {children}
        </code>
      );
    }
    
    const language = match[1];
    
    return (
      <div className="my-4">
        <div className="flex items-center justify-between bg-slate-800 text-slate-200 px-4 py-2 rounded-t-lg">
          <span className="text-sm font-medium">{language}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-slate-300 hover:text-white"
            onClick={() => navigator.clipboard.writeText(String(children))}
          >
            Copy
          </Button>
        </div>
        <pre className="bg-slate-900 text-slate-100 rounded-b-lg p-4 overflow-x-auto">
          <code className={className} {...props}>
            {String(children).replace(/\n$/, '')}
          </code>
        </pre>
      </div>
    );
  },

  // Enhanced blockquotes
  blockquote({ children, ...props }: any) {
    return (
      <blockquote 
        className="border-l-4 border-primary pl-4 py-2 my-4 bg-muted/50 italic"
        {...props}
      >
        {children}
      </blockquote>
    );
  },

  // Enhanced tables
  table({ children, ...props }: any) {
    return (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse border border-border rounded-lg" {...props}>
          {children}
        </table>
      </div>
    );
  },

  thead({ children, ...props }: any) {
    return (
      <thead className="bg-muted" {...props}>
        {children}
      </thead>
    );
  },

  th({ children, ...props }: any) {
    return (
      <th className="border border-border px-3 py-2 text-left font-semibold" {...props}>
        {children}
      </th>
    );
  },

  td({ children, ...props }: any) {
    return (
      <td className="border border-border px-3 py-2" {...props}>
        {children}
      </td>
    );
  },

  // Enhanced links
  a({ href, children, ...props }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1"
        {...props}
      >
        {children}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  },

  // Enhanced lists
  ul({ children, ...props }: any) {
    return (
      <ul className="list-disc list-inside space-y-1 my-2" {...props}>
        {children}
      </ul>
    );
  },

  ol({ children, ...props }: any) {
    return (
      <ol className="list-decimal list-inside space-y-1 my-2" {...props}>
        {children}
      </ol>
    );
  },

  // Enhanced headings
  h1({ children, ...props }: any) {
    return (
      <h1 className="text-2xl font-bold mt-6 mb-4 border-b border-border pb-2" {...props}>
        {children}
      </h1>
    );
  },

  h2({ children, ...props }: any) {
    return (
      <h2 className="text-xl font-semibold mt-5 mb-3" {...props}>
        {children}
      </h2>
    );
  },

  h3({ children, ...props }: any) {
    return (
      <h3 className="text-lg font-medium mt-4 mb-2" {...props}>
        {children}
      </h3>
    );
  },
};

// File attachment renderer
const AttachmentRenderer = memo(({ attachment }: { attachment: FileAttachment }) => {
  const isImage = attachment.type.startsWith('image/');
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = () => {
    if (attachment.url) {
      window.open(attachment.url, '_blank');
    } else if (attachment.data) {
      const link = document.createElement('a');
      link.href = attachment.data;
      link.download = attachment.name;
      link.click();
    }
  };

  return (
    <Card className="mb-2 max-w-sm">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {isImage ? (
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Image className="h-6 w-6 text-blue-600" />
              </div>
            ) : (
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <FileText className="h-6 w-6 text-gray-600" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {attachment.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatFileSize(attachment.size)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {attachment.type.split('/')[1]?.toUpperCase() || 'FILE'}
              </Badge>
              {(attachment.url || attachment.data) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleDownload}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Image preview */}
        {isImage && attachment.data && (
          <div className="mt-3">
            <img
              src={attachment.data}
              alt={attachment.name}
              className="max-w-full h-auto rounded-lg cursor-pointer"
              onClick={() => window.open(attachment.data!, '_blank')}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
});

AttachmentRenderer.displayName = 'AttachmentRenderer';

export const MessageRenderer = memo(({ 
  content, 
  role, 
  attachments, 
  className 
}: MessageRendererProps) => {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <AttachmentRenderer key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}

      {/* Message content */}
      {content && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {role === 'assistant' ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MarkdownComponents}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {content}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

MessageRenderer.displayName = 'MessageRenderer';