'use client';

import { Copy } from 'lucide-react';
import { Highlight, themes } from 'prism-react-renderer';

import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ConfigDisplayProps {
  config: object;
  language?: string;
  className?: string;
  copyMessage?: string;
}

export function ConfigDisplay({ 
  config, 
  language = 'json', 
  className = '',
  copyMessage = 'Configuration copied to clipboard'
}: ConfigDisplayProps) {
  const { theme } = useTheme();
  const { toast } = useToast();

  const configString = JSON.stringify(config, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(configString);
    toast({
      description: copyMessage,
    });
  };

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors z-10"
        onClick={handleCopy}
        title="Copy to clipboard"
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Highlight
        theme={theme === 'dark' ? themes.vsDark : themes.github}
        code={configString}
        language={language}
      >
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="bg-[#f6f8fa] dark:bg-[#1e1e1e] text-[#24292f] dark:text-[#d4d4d4] p-4 rounded-md overflow-x-auto">
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
  );
}