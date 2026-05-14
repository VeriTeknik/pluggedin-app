'use client';

import { Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const PLUGIN_COMMANDS = `/plugin marketplace add VeriTeknik/pluggedin-plugin
/plugin install pluggedin
/pluggedin:setup`;

const PROXY_COMMAND = `npx -y @pluggedin/pluggedin-mcp-proxy@latest`;

export type InstallTabKey = 'plugin' | 'proxy';

export interface DualInstallSnippetLabels {
  pluginTabLabel: string;
  proxyTabLabel: string;
  pluginCaption: string;
  proxyCaption: string;
  copyLabel: string;
  copiedLabel: string;
  pluginSetupHint: string;
  proxySetupHint: string;
}

interface DualInstallSnippetProps {
  labels: DualInstallSnippetLabels;
  defaultTab?: InstallTabKey;
}

export function DualInstallSnippet({ labels, defaultTab = 'plugin' }: DualInstallSnippetProps) {
  const [activeTab, setActiveTab] = useState<InstallTabKey>(defaultTab);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    const text = activeTab === 'plugin' ? PLUGIN_COMMANDS : PROXY_COMMAND;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      /* clipboard unavailable */
    });
  }, [activeTab]);

  const handleTabChange = useCallback((tab: InstallTabKey) => {
    setActiveTab(tab);
    setCopied(false);
    clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="relative group">
      <div
        aria-hidden="true"
        className="absolute -inset-0.5 bg-gradient-to-r from-electric-cyan/20 to-neon-purple/20 rounded-lg blur opacity-50 group-hover:opacity-75 transition-opacity duration-300"
      />
      <div className="relative bg-[#0d1117] rounded-lg border border-border/50 overflow-hidden">
        {/* Tab Bar */}
        <div role="tablist" aria-label="Installation method" className="flex items-stretch border-b border-border/30 bg-black/30">
          <button
            role="tab"
            aria-selected={activeTab === 'plugin'}
            aria-controls="install-panel-plugin"
            id="install-tab-plugin"
            onClick={() => handleTabChange('plugin')}
            className={`flex-1 px-4 py-3 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'plugin'
                ? 'text-electric-cyan border-b-2 border-electric-cyan bg-electric-cyan/5'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
            }`}
          >
            {labels.pluginTabLabel}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'proxy'}
            aria-controls="install-panel-proxy"
            id="install-tab-proxy"
            onClick={() => handleTabChange('proxy')}
            className={`flex-1 px-4 py-3 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'proxy'
                ? 'text-neon-purple border-b-2 border-neon-purple bg-neon-purple/5'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
            }`}
          >
            {labels.proxyTabLabel}
          </button>
        </div>

        {/* Caption + Copy */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
          <span className="text-[11px] sm:text-xs text-muted-foreground/80">
            {activeTab === 'plugin' ? labels.pluginCaption : labels.proxyCaption}
          </span>
          <button
            onClick={handleCopy}
            aria-live="polite"
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? labels.copiedLabel : labels.copyLabel}
          </button>
        </div>

        {/* Code Body */}
        {activeTab === 'plugin' ? (
          <pre
            id="install-panel-plugin"
            role="tabpanel"
            aria-labelledby="install-tab-plugin"
            className="px-6 py-5 text-left font-mono text-sm md:text-base leading-relaxed overflow-x-auto"
          >
            <code>
              <span className="text-electric-cyan">/plugin</span>
              <span className="text-muted-foreground"> marketplace add </span>
              <span className="text-glow-green">VeriTeknik/pluggedin-plugin</span>
              {'\n'}
              <span className="text-electric-cyan">/plugin</span>
              <span className="text-muted-foreground"> install </span>
              <span className="text-glow-green">pluggedin</span>
              {'\n'}
              <span className="text-electric-cyan">/pluggedin:setup</span>
              <span className="text-muted-foreground/50"> </span>
              <span className="text-slate-500 italic text-xs">{labels.pluginSetupHint}</span>
            </code>
          </pre>
        ) : (
          <pre
            id="install-panel-proxy"
            role="tabpanel"
            aria-labelledby="install-tab-proxy"
            className="px-6 py-5 text-left font-mono text-sm md:text-base leading-relaxed overflow-x-auto"
          >
            <code>
              <span className="text-neon-purple">npx</span>
              <span className="text-muted-foreground"> -y </span>
              <span className="text-glow-green">@pluggedin/pluggedin-mcp-proxy@latest</span>
              {'\n'}
              <span className="text-slate-500 italic text-xs"># {labels.proxySetupHint}</span>
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
