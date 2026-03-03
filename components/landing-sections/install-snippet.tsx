'use client';

import { Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const INSTALL_COMMANDS = `/plugin marketplace add VeriTeknik/pluggedin-plugin
/plugin install pluggedin`;

interface InstallSnippetProps {
  copyLabel: string;
  copiedLabel: string;
}

export function InstallSnippet({ copyLabel, copiedLabel }: InstallSnippetProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(INSTALL_COMMANDS).then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      /* clipboard unavailable */
    });
  }, []);

  return (
    <div className="relative group">
      <div aria-hidden="true" className="absolute -inset-0.5 bg-gradient-to-r from-electric-cyan/20 to-neon-purple/20 rounded-lg blur opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
      <div className="relative bg-[#0d1117] rounded-lg border border-border/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <button
            onClick={handleCopy}
            aria-live="polite"
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? copiedLabel : copyLabel}
          </button>
        </div>
        <pre className="px-6 py-5 text-left font-mono text-sm md:text-base leading-relaxed overflow-x-auto">
          <code>
            <span className="text-electric-cyan">/plugin</span>
            <span className="text-muted-foreground"> marketplace add </span>
            <span className="text-glow-green">VeriTeknik/pluggedin-plugin</span>
            {'\n'}
            <span className="text-electric-cyan">/plugin</span>
            <span className="text-muted-foreground"> install </span>
            <span className="text-glow-green">pluggedin</span>
          </code>
        </pre>
      </div>
    </div>
  );
}
