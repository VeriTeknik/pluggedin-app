'use client';

import { Copy } from 'lucide-react';
import Link from 'next/link';
import { Highlight, themes } from 'prism-react-renderer';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

export default function SetupGuidePage() {
  const { currentProject } = useProjects();
  const { data: apiKey } = useSWR(
    currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );
  const { toast } = useToast();

  return (
    <div className='max-w-4xl mx-auto py-8 px-4'>
      <h1 className='text-3xl font-bold mb-8'>Setup Guide</h1>

      <section className='mb-8'>
        <h2 className='text-2xl font-semibold mb-4'>Prerequisites</h2>
        <div className='space-y-4'>
          <div className='p-4 bg-gray-50 rounded-lg'>
            <h3 className='font-medium mb-2'>For Python-based MCP servers:</h3>
            <p>
              Install uv (uvx) globally -{' '}
              <Link
                href='https://docs.astral.sh/uv/getting-started/installation'
                className='text-blue-600 hover:text-blue-800 underline'
                target='_blank'
                rel='noopener noreferrer'>
                Installation Guide
              </Link>
            </p>
          </div>

          <div className='p-4 bg-gray-50 rounded-lg'>
            <h3 className='font-medium mb-2'>For Node.js-based MCP servers:</h3>
            <p>
              Install Node.js (npx) globally -{' '}
              <Link
                href='https://nodejs.org/en/download'
                className='text-blue-600 hover:text-blue-800 underline'
                target='_blank'
                rel='noopener noreferrer'>
                Download Node.js
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className='mb-8'>
        <h2 className='text-2xl font-semibold mb-4'>Installation Methods</h2>

        <div className='space-y-6'>
          <div className='p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg'>
            <p className='font-medium'>
              Notice: you can manage your API Keys in the{' '}
              <Link
                href='/api-keys'
                className='text-blue-600 hover:text-blue-800 underline'>
                API Keys Page
              </Link>
            </p>
          </div>

          {/* <div className='p-4 bg-gray-50 rounded-lg'>
            <h3 className='font-medium mb-2'>
              1. Using Smithery AI MCP Registry
            </h3>
            <pre className='bg-gray-800 text-white p-4 rounded-md overflow-x-auto'>
              npx -y @smithery/cli@latest install @metamcp/mcp-server-metamcp
              --client claude
            </pre>
          </div> */}

          <div className='p-4 bg-gray-50 rounded-lg'>
            <h3 className='font-medium mb-2'>Manual Configuration</h3>
            <p className='mb-2'>
              For Claude Desktop, locate the configuration file at:
            </p>
            <ul className='list-disc list-inside mb-4 space-y-1'>
              <li>
                <strong>macOS:</strong>
                <pre>
                  {' '}
                  ~/Library/Application
                  Support/Claude/claude_desktop_config.json
                </pre>
              </li>
              <li>
                <strong>Windows:</strong>
                <pre> %APPDATA%\Claude\claude_desktop_config.json</pre>
              </li>
            </ul>

            <p className='mb-2'>
              Generally the JSON Configuration Template will look like this:
            </p>
            <div className='relative'>
              <button
                onClick={() => {
                  const jsonConfig = JSON.stringify(
                    {
                      mcpServers: {
                        MetaMCP: {
                          command: 'npx',
                          args: ['-y', '@metamcp/mcp-server-metamcp'],
                          env: {
                            METAMCP_API_KEY:
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
                theme={themes.github}
                code={`{
  "mcpServers": {
    "MetaMCP": {
      "command": "npx",
      "args": ["-y", "@metamcp/mcp-server-metamcp"],
      "env": {
        "METAMCP_API_KEY": "${apiKey?.api_key ?? '<create an api key first>'}",
        "METAMCP_API_BASE_URL": "http://localhost:12005"
      }
    }
  }
}`}
                language='json'>
                {({ tokens, getLineProps, getTokenProps }) => (
                  <pre className='bg-[#f6f8fa] text-[#24292f] p-4 rounded-md overflow-x-auto'>
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

          <div className='p-4 bg-gray-50 rounded-lg'>
            <h3 className='font-medium mb-2'>Cursor Configuration</h3>
            <p className='mb-2'>
              For Cursor, you can configure MetaMCP directly in the settings:
            </p>
            <ol className='list-decimal list-inside mb-4 space-y-2'>
              <li>Open Cursor and go to Cursor Settings</li>
              <li>Navigate to the Features section</li>
              <li>
                Find &apos;MCP Servers&apos; and click &apos;Add new MCP
                Server&apos;
              </li>
              <li>Use the following command:</li>
            </ol>

            <div className='relative'>
              <button
                onClick={() => {
                  const command = `npx -y @metamcp/mcp-server-metamcp --metamcp-api-key ${apiKey?.api_key ?? '<create an api key first>'}`;
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
                theme={themes.github}
                code={`npx -y @metamcp/mcp-server-metamcp --metamcp-api-key ${apiKey?.api_key ?? '<create an api key first>'} --metamcp-api-base-url http://localhost:12005`}
                language='bash'>
                {({ tokens, getLineProps, getTokenProps }) => (
                  <pre className='bg-[#f6f8fa] text-[#24292f] p-4 rounded-md overflow-x-auto'>
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
        </div>
      </section>
    </div>
  );
}
