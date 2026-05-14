'use client';

import { Copy } from 'lucide-react';
import { type KeyboardEvent, useCallback, useRef, useState } from 'react';

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

import { PLUGIN_COMMANDS, PROXY_COMMAND } from './constants';

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
  /** Accessible label for the tablist (localized). */
  tablistLabel: string;
}

interface DualInstallSnippetProps {
  labels: DualInstallSnippetLabels;
  defaultTab?: InstallTabKey;
}

const TAB_ORDER: readonly InstallTabKey[] = ['plugin', 'proxy'] as const;

export function DualInstallSnippet({ labels, defaultTab = 'plugin' }: DualInstallSnippetProps) {
  const [activeTab, setActiveTab] = useState<InstallTabKey>(defaultTab);
  const { copied, copy } = useCopyToClipboard();
  const tabRefs = useRef<Record<InstallTabKey, HTMLButtonElement | null>>({
    plugin: null,
    proxy: null,
  });

  const handleCopy = useCallback(() => {
    copy(activeTab === 'plugin' ? PLUGIN_COMMANDS : PROXY_COMMAND);
  }, [activeTab, copy]);

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      // ARIA APG: ArrowLeft/Right cycles tabs, Home/End jumps to ends.
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();

      const currentIdx = TAB_ORDER.indexOf(activeTab);
      let nextIdx = currentIdx;
      if (event.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      else if (event.key === 'ArrowRight') nextIdx = (currentIdx + 1) % TAB_ORDER.length;
      else if (event.key === 'Home') nextIdx = 0;
      else if (event.key === 'End') nextIdx = TAB_ORDER.length - 1;

      const nextTab = TAB_ORDER[nextIdx];
      setActiveTab(nextTab);
      tabRefs.current[nextTab]?.focus();
    },
    [activeTab],
  );

  return (
    <div className="relative group">
      <div
        aria-hidden="true"
        className="absolute -inset-0.5 bg-gradient-to-r from-electric-cyan/20 to-neon-purple/20 rounded-lg blur opacity-50 group-hover:opacity-75 transition-opacity duration-300"
      />
      <div className="relative bg-[#0d1117] rounded-lg border border-border/50 overflow-hidden">
        {/* Tab Bar */}
        <div role="tablist" aria-label={labels.tablistLabel} className="flex items-stretch border-b border-border/30 bg-black/30">
          <button
            ref={(el) => { tabRefs.current.plugin = el; }}
            role="tab"
            aria-selected={activeTab === 'plugin'}
            aria-controls="install-panel-plugin"
            id="install-tab-plugin"
            tabIndex={activeTab === 'plugin' ? 0 : -1}
            onClick={() => setActiveTab('plugin')}
            onKeyDown={handleTabKeyDown}
            className={`flex-1 px-4 py-3 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === 'plugin'
                ? 'text-electric-cyan border-b-2 border-electric-cyan bg-electric-cyan/5'
                : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
            }`}
          >
            {labels.pluginTabLabel}
          </button>
          <button
            ref={(el) => { tabRefs.current.proxy = el; }}
            role="tab"
            aria-selected={activeTab === 'proxy'}
            aria-controls="install-panel-proxy"
            id="install-tab-proxy"
            tabIndex={activeTab === 'proxy' ? 0 : -1}
            onClick={() => setActiveTab('proxy')}
            onKeyDown={handleTabKeyDown}
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
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? labels.copiedLabel : labels.copyLabel}
          </button>
        </div>
        <span aria-live="polite" className="sr-only">
          {copied ? labels.copiedLabel : ''}
        </span>

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
