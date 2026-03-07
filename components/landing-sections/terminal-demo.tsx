'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { useMounted } from '@/hooks/use-mounted';

interface TerminalLine {
  id: string;
  text: string;
  color: string;
  indent?: boolean;
  bold?: boolean;
}

const terminalLines: TerminalLine[] = [
  // Command
  { id: 'cmd', text: '$ claude "Fix the recursive query bug"', color: 'text-foreground', bold: true },

  // Session start
  { id: 'session-start', text: '[plugged.in] Session started (mem_7f3a)', color: 'text-cyan-400', bold: true },

  // Pattern match
  { id: 'pattern-header', text: '[plugged.in] Pattern match found:', color: 'text-cyan-400', bold: true },
  { id: 'pattern-seen', text: '"Recursive query \u2192 infinite loop" seen 47 times', color: 'text-muted-foreground', indent: true },
  { id: 'pattern-cause', text: '89% caused by missing base case', color: 'text-muted-foreground', indent: true },

  // Community insight
  { id: 'community-header', text: '[plugged.in] Community insight injected:', color: 'text-cyan-400', bold: true },
  { id: 'community-tip', text: '"Don\'t forget to add LIMIT clause" (23 devs)', color: 'text-muted-foreground', indent: true },

  // Warning
  { id: 'warning-1', text: '[plugged.in] Warning: This pattern led to production', color: 'text-cyan-400', bold: true },
  { id: 'warning-2', text: 'issues 12 times. Consider circuit breaker.', color: 'text-muted-foreground', indent: true },

  // Assistant response
  { id: 'assistant-1', text: '[assistant]  Based on community patterns, your issue is', color: 'text-purple-400', bold: true },
  { id: 'assistant-2', text: 'likely a missing base case. Here\'s the fix...', color: 'text-muted-foreground', indent: true },

  // Session end
  { id: 'obs-recorded', text: '[plugged.in] Observation recorded. Pattern strengthened.', color: 'text-cyan-400', bold: true },
  { id: 'session-end', text: '[plugged.in] Session complete. Community contribution: +1', color: 'text-cyan-400', bold: true },
];

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.3,
    },
  },
};

const lineVariants = {
  hidden: {
    opacity: 0,
    x: -8,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
};

const cursorVariants = {
  blink: {
    opacity: [1, 1, 0, 0],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear' as const,
    },
  },
};

export function TerminalDemoSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');
  const { ref, inView } = useInView({ threshold: 0.15, triggerOnce: true });
  const shouldReduceMotion = useReducedMotion();

  if (!mounted || !ready) return null;

  return (
    <section id="terminal-demo" ref={ref} className="py-16 sm:py-20 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-10 sm:mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('terminal.title')}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
            {t('terminal.subtitle')}
          </p>
        </motion.div>

        {/* Terminal container */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-3xl mx-auto"
        >
          <div
            className="relative rounded-xl border border-[#30363d] overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.15)]"
          >
            {/* Scanline / noise overlay */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)',
              }}
            />

            {/* Terminal header bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              </div>
              <span className="ml-2 text-xs text-[#8b949e] font-mono select-none">
                claude-code &mdash; plugged.in
              </span>
            </div>

            {/* Terminal body */}
            <div className="bg-[#0d1117] p-4 sm:p-6 min-h-[360px] sm:min-h-[420px]">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate={inView ? 'visible' : 'hidden'}
                className="font-mono text-xs sm:text-sm leading-relaxed space-y-0.5"
              >
                {terminalLines.map((line, i) => {
                  const isHeaderLine = line.bold && !line.indent;
                  const needsTopSpacing = isHeaderLine && i > 0;

                  return (
                    <motion.div
                      key={line.id}
                      variants={lineVariants}
                      className={`${needsTopSpacing ? 'mt-4' : ''}`}
                    >
                      <span
                        className={`${line.color} ${line.bold ? 'font-semibold' : ''} ${line.indent ? 'pl-4' : ''} inline-block`}
                      >
                        {line.text}
                      </span>
                    </motion.div>
                  );
                })}

                {/* Blinking cursor at the end */}
                <motion.div
                  variants={lineVariants}
                  className="mt-4"
                >
                  <motion.span
                    variants={cursorVariants}
                    animate={inView && !shouldReduceMotion ? 'blink' : ''}
                    className="inline-block w-2 h-4 bg-emerald-400 align-middle"
                  />
                </motion.div>
              </motion.div>
            </div>

            {/* Bottom ambient glow accent */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
          </div>
        </motion.div>

        {/* Doc link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="text-center mt-10"
        >
          <Button asChild variant="outline" size="sm" className="border-border/50 hover:border-electric-cyan/40">
            <a href="https://docs.plugged.in/guides/synchronicity-detection" target="_blank" rel="noopener noreferrer">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('terminal.learnMore')}
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
