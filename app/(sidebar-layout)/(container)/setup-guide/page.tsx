'use client';

import { Copy } from 'lucide-react';
import Image from 'next/image';
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

  return (
    <div className='max-w-4xl mx-auto py-8 px-4'>
      <h1 className='text-3xl font-bold mb-8'>{t('setupGuide.title')}</h1>

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

      <section className='mb-8'>
        <h2 className='text-2xl font-semibold mb-4'>{t('setupGuide.installation.title')}</h2>

        <div className='space-y-6'>
          <div className='p-4 bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 rounded-lg'>
            <p className='font-medium'>
              {t('setupGuide.installation.apiKeysNotice')}{' '}
              <Link
                href='/api-keys'
                className='text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline'>
                {t('apiKeys.title')}
              </Link>
            </p>
          </div>

          {/* Claude Desktop Configuration */}
          <div className='p-4 bg-card dark:bg-muted rounded-lg'>
            <h3 className='text-xl font-semibold mb-4'>{t('setupGuide.installation.claudeDesktop.title')}</h3>
            
            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeDesktop.step1.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeDesktop.step1.description')}</p>
              <div className='bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4'>
                <Image
                  src="/images/setup-guide/claude-desktop/step1-settings-menu.png"
                  alt={t('setupGuide.installation.claudeDesktop.step1.imageAlt')}
                  width={800}
                  height={400}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeDesktop.step2.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeDesktop.step2.description')}</p>
              <ul className='list-disc list-inside mb-4 space-y-1'>
                <li>
                  <strong>{t('setupGuide.installation.manualConfig.paths.macos')}:</strong>
                  <pre className='inline'> ~/Library/Application Support/Claude/claude_desktop_config.json</pre>
                </li>
                <li>
                  <strong>{t('setupGuide.installation.manualConfig.paths.windows')}:</strong>
                  <pre className='inline'> %APPDATA%\Claude\claude_desktop_config.json</pre>
                </li>
              </ul>
              <div className='bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4'>
                <Image
                  src="/images/setup-guide/claude-desktop/step2-config-location.png"
                  alt={t('setupGuide.installation.claudeDesktop.step2.imageAlt')}
                  width={800}
                  height={400}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeDesktop.step3.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeDesktop.step3.description')}</p>
              <div className='relative'>
                <button
                  onClick={() => {
                    const jsonConfig = JSON.stringify(
                      {
                        mcpServers: {
                          PluggedinMCP: {
                            command: 'npx',
                            args: ['-y', '@pluggedin/pluggedin-mcp-proxy@latest'],
                            env: {
                              PLUGGEDIN_API_KEY:
                                apiKey?.api_key ?? '<create an api key first>',
                            },
                          },
                        },
                      },
                      null,
                      2
                    );
                    navigator.clipboard.writeText(jsonConfig);
                    toast({
                      description: 'Configuration JSON copied to clipboard',
                    });
                  }}
                  className='absolute top-2 right-2 p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
                  title='Copy to clipboard'>
                  <Copy className='w-5 h-5' />
                </button>
                <Highlight
                  theme={theme === 'dark' ? themes.vsDark : themes.github}
                  code={`{
  "mcpServers": {
    "PluggedinMCP": {
      "command": "npx",
      "args": ["-y", "@pluggedin/pluggedin-mcp-proxy@latest"],
      "env": {
        "PLUGGEDIN_API_KEY": "${apiKey?.api_key ?? '<create an api key first>'}"
      }
    }
  }
}`}
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

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeDesktop.step4.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeDesktop.step4.description')}</p>
              <div className='bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4'>
                <Image
                  src="/images/setup-guide/claude-desktop/step4-restart.png"
                  alt={t('setupGuide.installation.claudeDesktop.step4.imageAlt')}
                  width={800}
                  height={400}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeDesktop.step5.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeDesktop.step5.description')}</p>
              <div className='bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-4'>
                <Image
                  src="/images/setup-guide/claude-desktop/step5-verification.png"
                  alt={t('setupGuide.installation.claudeDesktop.step5.imageAlt')}
                  width={800}
                  height={400}
                  className="rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Claude Code Configuration */}
          <div className='p-4 bg-card dark:bg-muted rounded-lg'>
            <h3 className='text-xl font-semibold mb-4'>{t('setupGuide.installation.claudeCode.title')}</h3>
            
            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeCode.step1.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeCode.step1.description')}</p>
              <div className='bg-black text-green-400 p-4 rounded-lg font-mono text-sm mb-4'>
                <div className='mb-2'>$ claude mcp --help</div>
                <div className='text-gray-300'>Usage: claude mcp [command] [options]</div>
                <div className='text-gray-300'>Commands:</div>
                <div className='text-gray-300'>  add &lt;name&gt; &lt;command&gt;  Add a new MCP server</div>
                <div className='text-gray-300'>  list                 List all MCP servers</div>
                <div className='text-gray-300'>  remove &lt;name&gt;        Remove an MCP server</div>
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeCode.step2.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeCode.step2.description')}</p>
              <div className='bg-black text-green-400 p-4 rounded-lg font-mono text-sm mb-4'>
                <div className='mb-2'>$ claude mcp list</div>
                <div className='text-gray-300'>No MCP servers configured. Run `claude mcp add` to add servers.</div>
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeCode.step3.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeCode.step3.description')}</p>
              <div className='relative mb-4'>
                <button
                  onClick={() => {
                    const command = `claude mcp add PluggedIn npx @pluggedin/pluggedin-mcp-proxy@latest -e PLUGGEDIN_API_KEY=${apiKey?.api_key ?? '<create an api key first>'}`;
                    navigator.clipboard.writeText(command);
                    toast({
                      description: 'Claude Code command copied to clipboard',
                    });
                  }}
                  className='absolute top-2 right-2 p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
                  title='Copy to clipboard'>
                  <Copy className='w-5 h-5' />
                </button>
                <Highlight
                  theme={theme === 'dark' ? themes.vsDark : themes.github}
                  code={`claude mcp add PluggedIn npx @pluggedin/pluggedin-mcp-proxy@latest -e PLUGGEDIN_API_KEY=${apiKey?.api_key ?? '<create an api key first>'}`}
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
              <div className='p-4 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 rounded-lg mb-4'>
                <p className='text-sm'>
                  <strong>Note:</strong> Run this command in your terminal where you have Claude Code installed. 
                  You can verify the installation with <code className='bg-gray-200 dark:bg-gray-700 px-1 rounded'>claude mcp list</code>
                </p>
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeCode.step4.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeCode.step4.description')}</p>
              <div className='bg-black text-green-400 p-4 rounded-lg font-mono text-sm mb-4'>
                <div className='mb-2'>$ claude mcp add PluggedIn @pluggedin/pluggedin-mcp-proxy -e PLUGGEDIN_API_KEY=pg_in_...</div>
                <div className='text-gray-300'>Added stdio MCP server PluggedIn with command: @pluggedin/pluggedin-mcp-proxy to local config</div>
              </div>
            </div>

            <div className='mb-6'>
              <h4 className='font-medium mb-2'>{t('setupGuide.installation.claudeCode.step5.title')}</h4>
              <p className='mb-4'>{t('setupGuide.installation.claudeCode.step5.description')}</p>
              <div className='bg-black text-green-400 p-4 rounded-lg font-mono text-sm mb-4'>
                <div className='mb-2'>$ claude mcp list</div>
                <div className='text-gray-300'>PluggedIn: @pluggedin/pluggedin-mcp-proxy</div>
                <div className='mt-4 mb-2'>$ claude mcp get PluggedIn</div>
                <div className='text-gray-300'>PluggedIn:</div>
                <div className='text-gray-300'>  Scope: Local (private to you in this project)</div>
                <div className='text-gray-300'>  Type: stdio</div>
                <div className='text-gray-300'>  Command: @pluggedin/pluggedin-mcp-proxy</div>
                <div className='text-gray-300'>  Environment:</div>
                <div className='text-gray-300'>    PLUGGEDIN_API_KEY=pg_in_...</div>
              </div>
            </div>
          </div>
        </div>

      </section>

      <section className='mb-8'>
        <div className='p-4 bg-card dark:bg-muted rounded-lg'>
          <h3 className='font-medium mb-2'>{t('setupGuide.installation.cursorConfig.title')}</h3>
          <p className='mb-2'>
            {t('setupGuide.installation.cursorConfig.description')}
          </p>
          <ol className='list-decimal list-inside mb-4 space-y-2'>
            {(t('setupGuide.installation.cursorConfig.steps', { returnObjects: true }) as string[]).map((step: string, index: number) => (
              <li key={index}>{step}</li>
            ))}
          </ol>

        <div className='relative'>
          <button
            onClick={() => {
              const command = `npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key ${apiKey?.api_key ?? '<create an api key first>'}`;
              navigator.clipboard.writeText(command);
              toast({
                description: 'Cursor command copied to clipboard',
              });
            }}
            className='absolute top-2 right-2 p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
            title='Copy to clipboard'>
            <Copy className='w-5 h-5' />
          </button>
          <Highlight
            theme={theme === 'dark' ? themes.vsDark : themes.github}
            code={`npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key ${apiKey?.api_key ?? '<create an api key first>'}`}
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
      </div></section>

      <section className='mb-8'>
        <h2 className='text-2xl font-semibold mb-4'>{t('setupGuide.smithery.title')}</h2>
        <div className='p-4 bg-card dark:bg-muted rounded-lg'>
          <p className='mb-4'>
            {t('setupGuide.smithery.description')}{' '}
            {t('setupGuide.smithery.setupLink')}{' '}
            <Link 
              href="https://smithery.ai/docs/smithery-cli" 
              className='text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline' 
              target="_blank" 
              rel="noopener noreferrer"
            >
              https://smithery.ai/docs/smithery-cli
            </Link>
          </p>

          <p className='mb-4'>
            {t('setupGuide.smithery.serverLink')}{' '}
            <Link 
              href="https://smithery.ai/server/@VeriTeknik/pluggedin-mcp" 
              className='text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline' 
              target="_blank" 
              rel="noopener noreferrer"
            >
              https://smithery.ai/server/@VeriTeknik/pluggedin-mcp
            </Link>
          </p>

          <p className='mb-4'>{t('setupGuide.smithery.windowsNote')}</p>

          <p className='mb-4'>{t('setupGuide.smithery.terminalCommand')}</p>

          <div className='relative mb-6'>
            <button
              onClick={() => {
                const command = `smithery run @VeriTeknik/pluggedin-mcp --config '{"pluggedinApiKey":"${apiKey?.api_key ?? '<create an api key first>'}"}'`;
                navigator.clipboard.writeText(command);
                toast({
                  description: 'Smithery command copied to clipboard',
                });
              }}
              className='absolute top-2 right-2 p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
              title='Copy to clipboard'>
              <Copy className='w-5 h-5' />
            </button>
            <Highlight
              theme={theme === 'dark' ? themes.vsDark : themes.github}
              code={`smithery run @VeriTeknik/pluggedin-mcp --config '{"pluggedinApiKey":"${apiKey?.api_key ?? '<create an api key first>'}"}'`}
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

          <p className='mb-4'>{t('setupGuide.smithery.desktopConfig')}</p>

          <div className='relative'>
            <button
              onClick={() => {
                const jsonConfig = JSON.stringify(
                  {
                    mcpServers: {
                      PluggedinMCP: {
                        command: "smithery",
                        args: [
                          "run",
                          "@VeriTeknik/pluggedin-mcp",
                          "--config",
                          `{\"pluggedinApiKey\":\"${apiKey?.api_key ?? '<create an api key first>'} \"}`
                        ]
                      }
                    }
                  },
                  null,
                  2
                );
                navigator.clipboard.writeText(jsonConfig);
                toast({
                  description: 'Smithery Windows configuration copied to clipboard',
                });
              }}
              className='absolute top-2 right-2 p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors'
              title='Copy to clipboard'>
              <Copy className='w-5 h-5' />
            </button>
            <Highlight
              theme={theme === 'dark' ? themes.vsDark : themes.github}
              code={`{
  "mcpServers": {
    "PluggedinMCP": {
      "command": "smithery",
      "args": [
        "run",
        "@VeriTeknik/pluggedin-mcp",
        "--config",
        "{\\"pluggedinApiKey\\":\\"${apiKey?.api_key ?? '<create an api key first>'}\\"}"
      ]
    }
  }
}`}
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
      </section>
    </div>
  );
}
