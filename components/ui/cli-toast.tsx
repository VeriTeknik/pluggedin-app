'use client';

import { Terminal,X } from 'lucide-react';
import React, { useEffect, useRef,useState } from 'react';

import { cn } from '@/lib/utils';

interface CliToastProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  lines: string[];
  className?: string;
}

export function CliToast({ isOpen, onClose, title = 'Terminal Output', lines, className }: CliToastProps) {
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDisplayedLines([]);
      setCurrentLineIndex(0);
      return;
    }

    // If we have new lines, update displayed lines
    if (lines.length > displayedLines.length) {
      // Display all lines immediately if there are many or if we're catching up
      if (lines.length > 10 || lines.length - displayedLines.length > 5) {
        setDisplayedLines(lines);
        setCurrentLineIndex(lines.length);
      } else {
        // Animate remaining lines
        const newLines = lines.slice(displayedLines.length);
        let index = 0;
        const interval = setInterval(() => {
          if (index < newLines.length) {
            setDisplayedLines(prev => [...prev, newLines[index]]);
            index++;
          } else {
            clearInterval(interval);
          }
        }, 20); // Very fast animation
        
        return () => clearInterval(interval);
      }
    }
  }, [isOpen, lines, displayedLines.length]);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedLines]);

  if (!isOpen) return null;

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 w-[700px] bg-black/95 backdrop-blur-sm rounded-lg border border-gray-800 shadow-2xl transition-all duration-300",
      isOpen ? "h-[500px]" : "h-0",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-green-500" />
          <span className="text-sm font-mono text-gray-300">{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded transition-colors"
          aria-label="Close terminal output"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Terminal Content */}
      <div 
        ref={scrollRef}
        className="overflow-y-auto h-[calc(100%-40px)] p-4 font-mono text-xs custom-scrollbar"
      >
        {displayedLines.map((line, index) => (
          <CliLine key={index} text={line} />
        ))}
        {displayedLines.length < lines.length && (
          <div className="flex items-center gap-2 mt-2">
            <div className="inline-block w-2 h-4 bg-green-500 animate-pulse" />
            <span className="text-gray-500 text-xs">Processing...</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface CliLineProps {
  text: string;
}

function CliLine({ text }: CliLineProps) {
  // Color coding based on content
  const getLineStyle = () => {
    if (text.startsWith('[Action]')) return 'text-blue-400';
    if (text.startsWith('[PackageManager]')) return 'text-yellow-400';
    if (text.startsWith('[pnpm]')) return 'text-orange-400';
    if (text.startsWith('[MCP Wrapper]')) return 'text-purple-400';
    if (text.includes('ERROR') || text.includes('error')) return 'text-red-400';
    if (text.includes('successfully') || text.includes('SUCCESS')) return 'text-green-400';
    if (text.includes('Installing')) return 'text-yellow-300';
    if (text.includes('Discovered')) return 'text-green-300';
    if (text.includes('Cleaned up')) return 'text-gray-400';
    return 'text-gray-300';
  };

  // Format JSON objects
  const formatLine = (line: string) => {
    // Check if line contains JSON
    const jsonMatch = line.match(/({.*})/);
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[1]);
        const prefix = line.substring(0, line.indexOf(jsonMatch[1]));
        return (
          <>
            <span>{prefix}</span>
            <span className="text-gray-500">{'{'}</span>
            {Object.entries(json).map(([key, value], index, arr) => (
              <React.Fragment key={key}>
                <br />
                <span className="ml-4 text-cyan-400">{key}</span>
                <span className="text-gray-500">: </span>
                <span className="text-amber-300">
                  {typeof value === 'string' ? `'${value}'` : String(value)}
                </span>
                {index < arr.length - 1 && <span className="text-gray-500">,</span>}
              </React.Fragment>
            ))}
            <br />
            <span className="text-gray-500">{'}'}</span>
          </>
        );
      } catch {
        // Not valid JSON, return as is
        return line;
      }
    }
    return line;
  };

  return (
    <div className={cn('whitespace-pre-wrap', getLineStyle())}>
      {formatLine(text)}
    </div>
  );
}