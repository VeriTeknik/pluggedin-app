'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Cable, Layers, Server, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

const PROXY_COMMAND = 'npx -y @pluggedin/pluggedin-mcp-proxy@latest';

const features = [
  {
    key: 'servers',
    icon: Server,
    accentColor: 'border-t-electric-cyan',
    iconBg: 'bg-electric-cyan/10',
    iconColor: 'text-electric-cyan',
  },
  {
    key: 'transports',
    icon: Cable,
    accentColor: 'border-t-neon-purple',
    iconBg: 'bg-neon-purple/10',
    iconColor: 'text-neon-purple',
  },
  {
    key: 'clients',
    icon: Layers,
    accentColor: 'border-t-glow-green',
    iconBg: 'bg-glow-green/10',
    iconColor: 'text-glow-green',
  },
  {
    key: 'orchestration',
    icon: Workflow,
    accentColor: 'border-t-amber-400',
    iconBg: 'bg-amber-400/10',
    iconColor: 'text-amber-400',
  },
] as const;

export function McpProxySection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(PROXY_COMMAND).then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      /* clipboard unavailable */
    });
  }, []);

  if (!mounted || !ready) return null;

  return (
    <section
      ref={ref}
      id="mcp-proxy"
      className="relative py-24 overflow-hidden bg-gradient-to-b from-tech-blue-900/10 via-background to-tech-blue-900/5"
    >
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container relative z-10 mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/20 mb-6">
            <Server className="h-4 w-4 text-neon-purple" />
            <span className="text-sm font-semibold text-neon-purple">
              {t('mcpProxy.badge')}
            </span>
          </div>

          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-neon-purple to-electric-cyan">
              {t('mcpProxy.title')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('mcpProxy.subtitle')}
          </p>
        </motion.div>

        {/* Install Command */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="max-w-2xl mx-auto mb-6"
        >
          <div className="relative group">
            <div
              aria-hidden="true"
              className="absolute -inset-0.5 bg-gradient-to-r from-neon-purple/20 to-electric-cyan/20 rounded-lg blur opacity-50 group-hover:opacity-75 transition-opacity duration-300"
            />
            <div className="relative bg-[#0d1117] rounded-lg border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
                <span className="text-xs text-muted-foreground/80 uppercase tracking-wider">
                  {t('mcpProxy.installLabel')}
                </span>
                <button
                  onClick={handleCopy}
                  aria-live="polite"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  {copied ? t('mcpProxy.copied') : t('mcpProxy.copy')}
                </button>
              </div>
              <pre className="px-6 py-5 text-left font-mono text-sm md:text-base leading-relaxed overflow-x-auto">
                <code>
                  <span className="text-neon-purple">npx</span>
                  <span className="text-muted-foreground"> -y </span>
                  <span className="text-glow-green">@pluggedin/pluggedin-mcp-proxy@latest</span>
                </code>
              </pre>
            </div>
          </div>
        </motion.div>

        {/* Compatibility note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="text-center text-sm text-muted-foreground/80 mb-12"
        >
          {t('mcpProxy.compat')}
        </motion.p>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-10">
          {features.map((feature, i) => (
            <motion.div
              key={feature.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.35 + i * 0.08, duration: 0.5 }}
              className={`bg-card border border-t-2 ${feature.accentColor} rounded-xl p-6 hover:shadow-lg transition-shadow duration-300`}
            >
              <div className={`w-12 h-12 rounded-lg ${feature.iconBg} flex items-center justify-center mb-4`}>
                <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
              </div>
              <h3 className="text-base font-semibold mb-2">
                {t(`mcpProxy.features.${feature.key}.title`)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(`mcpProxy.features.${feature.key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="flex flex-wrap justify-center gap-4"
        >
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-neon-purple/30 hover:bg-neon-purple/10"
          >
            <Link href="/search?source=REGISTRY&offset=0">
              {t('mcpProxy.cta.browse')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-electric-cyan/30 hover:bg-electric-cyan/10"
          >
            <a
              href="https://docs.plugged.in/mcp-proxy"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              {t('mcpProxy.cta.setupGuide')}
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-neon-purple to-electric-cyan hover:opacity-90 text-white"
          >
            <Link href="/login">
              {t('mcpProxy.cta.getApiKey')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
