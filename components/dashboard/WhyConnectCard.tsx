'use client';

import { Book, Plug, Zap } from 'lucide-react';
import Link from 'next/link';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const WhyConnectCard = memo(function WhyConnectCard() {
  const { t } = useTranslation('analytics');

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {t('whyConnect.title')}
            </CardTitle>
            <CardDescription>
              {t('whyConnect.description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Value Proposition */}
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('whyConnect.intro')}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Knowledge Base */}
            <div className="flex gap-3">
              <div className="rounded-lg bg-primary/10 p-2 h-fit">
                <Book className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">
                  {t('whyConnect.features.knowledge.title')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('whyConnect.features.knowledge.description')}
                </p>
              </div>
            </div>

            {/* Unified Tools */}
            <div className="flex gap-3">
              <div className="rounded-lg bg-primary/10 p-2 h-fit">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">
                  {t('whyConnect.features.tools.title')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('whyConnect.features.tools.description')}
                </p>
              </div>
            </div>

            {/* Persistent Memory */}
            <div className="flex gap-3">
              <div className="rounded-lg bg-primary/10 p-2 h-fit">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  <path d="m15 5 3 3" />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">
                  {t('whyConnect.features.memory.title')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('whyConnect.features.memory.description')}
                </p>
              </div>
            </div>

            {/* Secure Workflows */}
            <div className="flex gap-3">
              <div className="rounded-lg bg-primary/10 p-2 h-fit">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">
                  {t('whyConnect.features.workflows.title')}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t('whyConnect.features.workflows.description')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/setup-guide">
            <Button size="sm" className="gap-2">
              <Plug className="h-4 w-4" />
              {t('whyConnect.actions.setup')}
            </Button>
          </Link>
          <a
            href="https://docs.plugged.in/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              {t('whyConnect.actions.docs')}
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
});
