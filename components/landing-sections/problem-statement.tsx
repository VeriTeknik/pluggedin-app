'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Users, Clock, GitBranch, Zap, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { useMounted } from '@/hooks/use-mounted';

const problems = [
  { icon: GitBranch, key: 'scattered' },
  { icon: Clock, key: 'reconfiguring' },
  { icon: XCircle, key: 'noMemory' },
  { icon: AlertCircle, key: 'agentFailures' },
  { icon: Zap, key: 'productionGap' },
];

export function ProblemStatementSection() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  if (!mounted || !ready) {
    return null;
  }

  return (
    <section ref={ref} className="relative py-24 overflow-hidden bg-gradient-to-b from-background via-red-950/5 to-background">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container relative z-10 mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={inView ? { scale: 1, opacity: 1 } : {}}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-6"
            >
              <AlertCircle className="w-8 h-8 text-red-500" />
            </motion.div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-red-400">
                {t('problemStatement.title')}
              </span>
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {t('problemStatement.subtitle')}
            </p>
          </motion.div>

          {/* Problems Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="grid md:grid-cols-2 gap-6 mb-12"
          >
            {problems.map((problem, index) => (
              <motion.div
                key={problem.key}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative bg-card/50 backdrop-blur-sm rounded-2xl p-6 border border-red-500/20 hover:border-red-500/40 transition-all duration-300">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                        <problem.icon className="w-6 h-6 text-red-500" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2 text-base">
                        {t(`problemStatement.problems.${problem.key}.title`)}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {t(`problemStatement.problems.${problem.key}.description`)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Quote/Testimonial */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.9 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-electric-cyan/10 to-neon-purple/10 rounded-2xl blur-2xl" />
            <div className="relative bg-card/80 backdrop-blur-xl rounded-2xl p-8 border border-electric-cyan/20">
              <Users className="w-10 h-10 text-electric-cyan/60 mb-4" />
              <blockquote className="text-lg font-medium mb-4 leading-relaxed">
                "{t('problemStatement.quote')}"
              </blockquote>
              <cite className="text-sm text-muted-foreground not-italic">
                {t('problemStatement.quoteAuthor')}
              </cite>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
