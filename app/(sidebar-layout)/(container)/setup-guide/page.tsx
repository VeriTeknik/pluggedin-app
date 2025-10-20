'use client';

import { Copy } from 'lucide-react';
import Link from 'next/link';
import { Highlight, themes } from 'prism-react-renderer';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { useTheme } from '@/components/providers/theme-provider';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

export default function SetupGuidePage() {
  const { theme } = useTheme();
  const { currentProject } = useProjects();
  const { data: apiKey } = useSWR(
    currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );
  const { toast } = useToast();
  const { t } = useTranslation();

  const resolvedApiKey = apiKey?.api_key ?? '<create an api key first>';

  const copyToClipboard = (value: string, message: string) => {
    navigator.clipboard.writeText(value);
    toast({ description: message });
  };

  const claudeDesktopConfig = `{
  "mcpServers": {
    "PluggedinMCP": {
      "command": "npx",
      "args": ["-y", "@pluggedin/pluggedin-mcp-proxy@latest"],
      "env": {
        "PLUGGEDIN_API_KEY": "${resolvedApiKey}"
      }
    }
  }
}`;

  const claudeCodeCommand = `claude mcp add PluggedIn \\
  npx @pluggedin/pluggedin-mcp-proxy@latest \\
  -e PLUGGEDIN_API_KEY=${resolvedApiKey}`;

  const cursorCommand = `npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key ${resolvedApiKey}`;

  return (
    <div className='max-w-4xl mx-auto py-8 px-4'>
      <h1 className='text-3xl font-bold mb-8'>{t('setupGuide.title')}</h1>
      <p className='mb-6 text-sm text-muted-foreground'>
        {t('setupGuide.moreInfo.prefix')}{' '}
        <Link
          href='https://docs.plugged.in/setup-guide'
          className='text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline'
          target='_blank'
          rel='noopener noreferrer'>
          {t('setupGuide.moreInfo.linkLabel')}
        </Link>
        .
      </p>

      <section className='mb-8'>
        <h2 className='text-2xl font-semibold mb-4'>{t('setupGuide.proxyBenefits.title')}</h2>
        <div className='p-4 bg-card dark:bg-muted rounded-lg'>
          <p className='mb-4'>{t('setupGuide.proxyBenefits.description')}</p>
          <ul className='list-disc list-inside space-y-2'>
            {(t('setupGuide.proxyBenefits.benefits', { returnObjects: true }) as string[]).map((benefit: string, index: number) => (
              <li key={index}>{benefit}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className='mb-12'>
        <h2 className='text-2xl font-semibold mb-4'>{t('setupGuide.installation.title')}</h2>

        <div className='space-y-6'>
          <div className='p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg'>
            <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
              <div>
                <h3 className='text-lg font-semibold'>{t('setupGuide.installation.apiKeyCard.title')}</h3>
                <p className='text-sm text-muted-foreground'>
                  {t('setupGuide.installation.apiKeyCard.description')}{' '}
                  <Link
                    href='/api-keys'
                    className='text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline'>
                    {t('apiKeys.title')}
                  </Link>
                  .
                </p>
              </div>
              <div className='flex items-center gap-2 w-full md:w-auto'>
                <code className='bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 px-3 py-2 rounded-md text-sm font-mono break-all flex-1'>
                  {resolvedApiKey}
                </code>
                <button
                  onClick={() => copyToClipboard(resolvedApiKey, t('setupGuide.installation.apiKeyCard.copySuccess'))}
                  className='inline-flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-600 transition-colors hover:bg-blue-600 hover:text-white dark:border-blue-800 dark:bg-gray-900 dark:text-blue-300 dark:hover:bg-blue-800'
                  title={t('setupGuide.installation.apiKeyCard.copyLabel')}>
                  <Copy className='w-5 h-5' />
                </button>
              </div>
            </div>
          </div>

          <div className='p-4 bg-card dark:bg-muted rounded-lg space-y-4'>
            <h3 className='text-xl font-semibold'>{t('setupGuide.installation.claudeDesktop.title')}</h3>
            <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeDesktop.intro')}</p>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeDesktop.step1.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeDesktop.step1.description')}</p>
            </div>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeDesktop.step2.title')}</h4>
              <p className='text-sm text-muted-foreground mb-2'>{t('setupGuide.installation.claudeDesktop.step2.description')}</p>
              <div className='rounded-md border border-dashed border-muted-foreground/30 bg-muted p-3 text-sm'>
                <p className='font-semibold uppercase tracking-wide text-xs text-muted-foreground mb-2'>
                  {t('setupGuide.installation.manualConfig.title')}
                </p>
                <ul className='list-disc list-inside space-y-1'>
                  <li>
                    <strong>{t('setupGuide.installation.manualConfig.paths.macos')}:</strong>{' '}
                    <span className='font-mono break-all'>~/Library/Application Support/Claude/claude_desktop_config.json</span>
                  </li>
                  <li>
                    <strong>{t('setupGuide.installation.manualConfig.paths.windows')}:</strong>{' '}
                    <span className='font-mono break-all'>%APPDATA%\\Claude\\claude_desktop_config.json</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className='space-y-3'>
              <div>
                <h4 className='font-medium'>{t('setupGuide.installation.claudeDesktop.step3.title')}</h4>
                <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeDesktop.step3.description')}</p>
              </div>
              <div className='p-3 bg-muted rounded-md font-mono text-sm'>
                <span className='font-semibold text-foreground'>PLUGGEDIN_API_KEY=</span>
                <span className='break-all'> {resolvedApiKey}</span>
              </div>
              <div className='relative'>
                <button
                  onClick={() => copyToClipboard(claudeDesktopConfig, t('setupGuide.installation.claudeDesktop.copySuccess'))}
                  className='absolute top-2 right-2 p-2 text-gray-500 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
                  title={t('setupGuide.installation.shared.copyLabel')}>
                  <Copy className='w-5 h-5' />
                </button>
                <Highlight
                  theme={theme === 'dark' ? themes.vsDark : themes.github}
                  code={claudeDesktopConfig}
                  language='json'>
                  {({ tokens, getLineProps, getTokenProps }) => (
                    <pre className='bg-[#f6f8fa] dark:bg-[#1e1e1e] text-[#24292f] dark:text-[#d4d4d4] p-4 rounded-md overflow-x-auto'>
                      {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })}>
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                        </div>
                      ))}
                    </pre>
                  )}
                </Highlight>
              </div>
            </div>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeDesktop.step4.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeDesktop.step4.description')}</p>
            </div>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeDesktop.step5.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeDesktop.step5.description')}</p>
            </div>
          </div>

          <div className='p-4 bg-card dark:bg-muted rounded-lg space-y-4'>
            <h3 className='text-xl font-semibold'>{t('setupGuide.installation.claudeCode.title')}</h3>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeCode.step1.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeCode.step1.description')}</p>
            </div>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeCode.step2.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeCode.step2.description')}</p>
            </div>

            <div className='space-y-3'>
              <div>
                <h4 className='font-medium'>{t('setupGuide.installation.claudeCode.step3.title')}</h4>
                <p className='text-sm text-muted-foreground'>
                  {t('setupGuide.installation.claudeCode.step3.description')}
                </p>
              </div>
              <div className='p-3 bg-muted rounded-md font-mono text-sm'>
                <span className='font-semibold text-foreground'>PLUGGEDIN_API_KEY=</span>
                <span className='break-all'> {resolvedApiKey}</span>
              </div>
              <div className='relative'>
                <button
                  onClick={() => copyToClipboard(claudeCodeCommand, t('setupGuide.installation.claudeCode.copySuccess'))}
                  className='absolute top-2 right-2 p-2 text-gray-500 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
                  title={t('setupGuide.installation.shared.copyLabel')}>
                  <Copy className='w-5 h-5' />
                </button>
                <Highlight
                  theme={theme === 'dark' ? themes.vsDark : themes.github}
                  code={claudeCodeCommand}
                  language='bash'>
                  {({ tokens, getLineProps, getTokenProps }) => (
                    <pre className='bg-[#f6f8fa] dark:bg-[#1e1e1e] text-[#24292f] dark:text-[#d4d4d4] p-4 rounded-md overflow-x-auto'>
                      {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })}>
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                        </div>
                      ))}
                    </pre>
                  )}
                </Highlight>
              </div>
              <div className='rounded-md border border-dashed border-blue-400/40 bg-blue-50/60 p-3 text-sm dark:border-blue-500/40 dark:bg-blue-950/50'>
                <strong className='block text-blue-800 dark:text-blue-200'>
                  {t('setupGuide.installation.claudeCode.noteTitle')}
                </strong>
                <p className='text-muted-foreground dark:text-blue-100'>
                  {t('setupGuide.installation.claudeCode.noteDescription')}{' '}
                  <code className='bg-gray-200 dark:bg-gray-700 px-1 rounded'>claude mcp list</code>
                  .
                </p>
              </div>
            </div>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeCode.step4.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeCode.step4.description')}</p>
            </div>

            <div>
              <h4 className='font-medium'>{t('setupGuide.installation.claudeCode.step5.title')}</h4>
              <p className='text-sm text-muted-foreground'>{t('setupGuide.installation.claudeCode.step5.description')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className='mb-12'>
        <div className='p-4 bg-card dark:bg-muted rounded-lg space-y-4'>
          <h3 className='text-xl font-semibold'>{t('setupGuide.installation.cursorConfig.title')}</h3>
          <p className='text-sm text-muted-foreground'>
            {t('setupGuide.installation.cursorConfig.description')}
          </p>
          <ol className='list-decimal list-inside space-y-2 text-sm'>
            {(t('setupGuide.installation.cursorConfig.steps', { returnObjects: true }) as string[]).map((step: string, index: number) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <div className='p-3 bg-muted rounded-md font-mono text-sm'>
            <span className='font-semibold text-foreground'>PLUGGEDIN_API_KEY=</span>
            <span className='break-all'> {resolvedApiKey}</span>
          </div>
          <div className='relative'>
            <button
              onClick={() => copyToClipboard(cursorCommand, t('setupGuide.installation.cursorConfig.copySuccess'))}
              className='absolute top-2 right-2 p-2 text-gray-500 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
              title={t('setupGuide.installation.shared.copyLabel')}>
              <Copy className='w-5 h-5' />
            </button>
            <Highlight
              theme={theme === 'dark' ? themes.vsDark : themes.github}
              code={cursorCommand}
              language='bash'>
              {({ tokens, getLineProps, getTokenProps }) => (
                <pre className='bg-[#f6f8fa] dark:bg-[#1e1e1e] text-[#24292f] dark:text-[#d4d4d4] p-4 rounded-md overflow-x-auto'>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
        </div>
      </section>

      <section className='mb-8'>
        <div className='p-4 bg-card dark:bg-muted rounded-lg space-y-4'>
          <h2 className='text-2xl font-semibold'>{t('setupGuide.lmStudio.title')}</h2>
          <p className='text-sm text-muted-foreground'>{t('setupGuide.lmStudio.description')}</p>
          <ol className='list-decimal list-inside space-y-2 text-sm'>
            {(t('setupGuide.lmStudio.steps', { returnObjects: true }) as string[]).map((step: string, index: number) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <div className='p-3 bg-muted rounded-md font-mono text-sm'>
            <span className='font-semibold text-foreground'>PLUGGEDIN_API_KEY=</span>
            <span className='break-all'> {resolvedApiKey}</span>
          </div>
          <div className='relative'>
            <button
              onClick={() => copyToClipboard(claudeDesktopConfig, t('setupGuide.lmStudio.copySuccess'))}
              className='absolute top-2 right-2 p-2 text-gray-500 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
              title={t('setupGuide.installation.shared.copyLabel')}>
              <Copy className='w-5 h-5' />
            </button>
            <Highlight
              theme={theme === 'dark' ? themes.vsDark : themes.github}
              code={claudeDesktopConfig}
              language='json'>
              {({ tokens, getLineProps, getTokenProps }) => (
                <pre className='bg-[#f6f8fa] dark:bg-[#1e1e1e] text-[#24292f] dark:text-[#d4d4d4] p-4 rounded-md overflow-x-auto'>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
          <p className='text-sm text-muted-foreground'>{t('setupGuide.lmStudio.saveNote')}</p>
        </div>
      </section>
    </div>
  );
}
