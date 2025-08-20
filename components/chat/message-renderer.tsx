'use client';

import { ExternalLink } from 'lucide-react';
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant' | 'system';
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


export const MessageRenderer = memo(({ 
  content, 
  role, 
  className 
}: MessageRendererProps) => {
  return (
    <div className={cn("space-y-2", className)}>
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