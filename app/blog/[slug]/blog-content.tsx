'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { locales, localeNames } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

type BlogContentProps = {
  post: {
    translations: Array<{
      language: string;
      title: string;
      content: string;
    }>;
  };
};

export function BlogContent({ post }: BlogContentProps) {
  const [currentLanguage, setCurrentLanguage] = useState<Locale>('en');

  const availableLanguages = locales.filter(lang =>
    post.translations.some(t => t.language === lang && t.content)
  );

  const currentTranslation = post.translations.find(
    t => t.language === currentLanguage
  );

  if (!currentTranslation) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 max-w-4xl py-8">
      {/* Language Switcher */}
      {availableLanguages.length > 1 && (
        <Card className="p-4 mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Read in:
            </span>
            {availableLanguages.map(lang => (
              <Button
                key={lang}
                variant={currentLanguage === lang ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentLanguage(lang)}
              >
                {localeNames[lang]}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Markdown Content */}
      <div className="prose prose-lg dark:prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Customize heading IDs for anchor links
            h1: ({ children, ...props }) => (
              <h1 id={slugify(String(children))} {...props}>
                {children}
              </h1>
            ),
            h2: ({ children, ...props }) => (
              <h2 id={slugify(String(children))} {...props}>
                {children}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3 id={slugify(String(children))} {...props}>
                {children}
              </h3>
            ),
            // Custom code blocks
            code: ({ node, inline, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '');
              return !inline ? (
                <div className="relative">
                  {match && (
                    <div className="absolute top-2 right-2 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {match[1]}
                    </div>
                  )}
                  <code className={className} {...props}>
                    {children}
                  </code>
                </div>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            // Custom links to open external links in new tab
            a: ({ href, children, ...props }) => {
              const isExternal = href?.startsWith('http');
              return (
                <a
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  {...props}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {currentTranslation.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
