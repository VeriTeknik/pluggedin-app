'use client';

import { Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface TerminalDisplayProps {
  command: string;
  output?: string[];
  className?: string;
}

export function TerminalDisplay({ command, output = [], className = '' }: TerminalDisplayProps) {
  const { toast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    toast({
      description: 'Command copied to clipboard',
    });
  };

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 text-gray-400 hover:text-white rounded-md hover:bg-gray-700 transition-colors z-10"
        onClick={handleCopy}
        title="Copy command to clipboard"
      >
        <Copy className="h-4 w-4" />
      </Button>
      <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
        <div className="mb-2">$ {command}</div>
        {output.map((line, index) => (
          <div key={index} className="text-gray-300">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}