'use client';

import { Copy, Terminal } from 'lucide-react';
import useSWR from 'swr';

import { getFirstApiKey } from '@/app/actions/api-keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

export default function InspectorGuidePage() {
  const { currentProject } = useProjects();
  const { data: apiKey } = useSWR(
    currentProject?.uuid ? `${currentProject?.uuid}/api-keys/getFirst` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );
  const { toast } = useToast();

  const inspectorCommand = `npx -y @modelcontextprotocol/inspector npx -y @VeriTeknik/pluggedin-mcp@latest -e PLUGGEDIN_API_KEY=${apiKey?.api_key || '<YOUR_API_KEY>'} -e PLUGGEDIN_API_BASE_URL=http://localhost:12005`;

  return (
    <div className='container mx-auto py-6 flex flex-col items-start justify-center gap-6'>
      <p className='text-lg'>
        Because Plugged.in is a local proxy and we currently don&apos;t support
        any cloud hosting of your MCPs. You can use MCP&apos;s official inspector
        to check what exact tools you will have access to with Plugged.in. The
        inspector command is used to start the inspector tool. You can use the
        command below to start the inspector tool. In the future we may support
        better experience for you to check inspection details directly on our
        platform.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Terminal className='h-5 w-5' />
            Inspector Command{' '}
            <button
              onClick={() => {
                navigator.clipboard.writeText(inspectorCommand);
                toast({
                  title: 'Copied to clipboard',
                  description:
                    'The inspector command has been copied to your clipboard.',
                });
              }}
              className='p-1 hover:bg-gray-200 rounded-md'>
              <Copy className='h-4 w-4' />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='relative'>
            <pre className='pr-10 whitespace-pre-wrap break-words max-w-[80ch]'>
              {inspectorCommand}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
