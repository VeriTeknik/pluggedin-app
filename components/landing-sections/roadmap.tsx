'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Calendar, CheckCircle, Circle, Github } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface RoadmapStage {
  date: string;
  status: 'completed' | 'in_progress' | 'planned' | 'future';
  titleKey: string;
  descriptionKey: string;
}

const stages: RoadmapStage[] = [
  {
    date: 'March 2025',
    status: 'completed',
    titleKey: 'roadmap.stage1.title',
    descriptionKey: 'roadmap.stage1.description'
  },
  {
    date: '19 June 2025',
    status: 'completed',
    titleKey: 'roadmap.stage2.title',
    descriptionKey: 'roadmap.stage2.description'
  },
  {
    date: 'Late October 2025',
    status: 'in_progress',
    titleKey: 'roadmap.stage3.title',
    descriptionKey: 'roadmap.stage3.description'
  },
  {
    date: 'Q1 2026',
    status: 'future',
    titleKey: 'roadmap.stage4.title',
    descriptionKey: 'roadmap.stage4.description'
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { y: 40, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
    },
  },
};

function TimelineDot({ status, index }: { status: RoadmapStage['status']; index: number }) {
  const dotConfig = {
    completed: {
      icon: CheckCircle,
      color: 'text-glow-green',
      bg: 'bg-glow-green',
      ring: 'ring-glow-green/20',
    },
    in_progress: {
      icon: Circle,
      color: 'text-electric-cyan',
      bg: 'bg-electric-cyan',
      ring: 'ring-electric-cyan/20',
    },
    planned: {
      icon: Circle,
      color: 'text-neon-purple',
      bg: 'bg-neon-purple/30',
      ring: 'ring-neon-purple/20',
    },
    future: {
      icon: Circle,
      color: 'text-muted-foreground',
      bg: 'bg-muted-foreground/30',
      ring: 'ring-muted-foreground/10',
    },
  };

  const config = dotConfig[status];
  const Icon = config.icon;
  const isPulsing = status === 'in_progress';

  return (
    <div className="relative flex items-center justify-center">
      <div
        className={cn(
          'absolute w-16 h-16 rounded-full blur-xl transition-all',
          config.bg,
          isPulsing && 'animate-pulse'
        )}
      />
      <div
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-full ring-4',
          config.bg,
          config.ring,
          isPulsing && 'animate-pulse'
        )}
      >
        <Icon className={cn('w-6 h-6', config.color)} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RoadmapStage['status'] }) {
  const { t } = useTranslation('landing');

  const badgeConfig = {
    completed: {
      label: t('roadmap.status.completed'),
      className: 'bg-glow-green/10 text-glow-green border-glow-green/20',
    },
    in_progress: {
      label: t('roadmap.status.inProgress'),
      className: 'bg-electric-cyan/10 text-electric-cyan border-electric-cyan/20',
    },
    planned: {
      label: t('roadmap.status.planned'),
      className: 'bg-neon-purple/10 text-neon-purple border-neon-purple/20',
    },
    future: {
      label: t('roadmap.status.future'),
      className: 'bg-muted/50 text-muted-foreground border-border/50',
    },
  };

  const config = badgeConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

export function RoadmapSection() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <section
      ref={ref}
      id="roadmap"
      className="py-16 md:py-24 lg:py-32 bg-gradient-to-b from-muted/30 via-background to-muted/30 relative overflow-hidden"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#a855f708_1px,transparent_1px),linear-gradient(to_bottom,#a855f708_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/20 mb-4"
          >
            <Calendar className="h-4 w-4 text-neon-purple" />
            <span className="text-sm font-semibold text-neon-purple">{t('roadmap.badge')}</span>
          </motion.div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
              {t('roadmap.title')}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('roadmap.subtitle')}
          </p>
        </motion.div>

        {/* Timeline */}
        <motion.div
          className="max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {stages.map((stage, index) => {
            const isEven = index % 2 === 0;

            return (
              <motion.div
                key={index}
                variants={itemVariants}
                className="relative"
              >
                {/* Timeline Line */}
                {index < stages.length - 1 && (
                  <div className="absolute left-1/2 top-20 -translate-x-1/2 w-0.5 h-full bg-gradient-to-b from-border via-border to-transparent" />
                )}

                <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                  {/* Left Side (Desktop) */}
                  <div className={cn('md:flex', isEven ? 'md:justify-end' : 'md:order-2')}>
                    <div className="md:hidden mb-4 flex justify-center">
                      <TimelineDot status={stage.status} index={index} />
                    </div>

                    <Card
                      className={cn(
                        'group transition-all duration-300',
                        'hover:scale-[1.02] hover:shadow-xl',
                        'border-border/50 bg-background/50 backdrop-blur-sm',
                        stage.status === 'completed' && 'hover:border-glow-green/50 hover:shadow-glow-green/20',
                        stage.status === 'in_progress' && 'hover:border-electric-cyan/50 hover:shadow-electric-cyan/20',
                        (stage.status === 'planned' || stage.status === 'future') && 'hover:border-neon-purple/50 hover:shadow-neon-purple/20'
                      )}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            <span className="font-medium">{stage.date}</span>
                          </div>
                          <StatusBadge status={stage.status} />
                        </div>
                        <h3 className="text-xl font-semibold mb-3 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-electric-cyan group-hover:to-neon-purple transition-all">
                          {t(stage.titleKey)}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {t(stage.descriptionKey)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Timeline Dot (Desktop Center) */}
                  <div className="hidden md:flex absolute left-1/2 top-0 -translate-x-1/2 z-10">
                    <TimelineDot status={stage.status} index={index} />
                  </div>

                  {/* Right Side (Desktop) - Empty spacer */}
                  <div className={cn('hidden md:block', !isEven && 'md:order-1')} />
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Outcome Block */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="max-w-4xl mx-auto mt-20"
        >
          <Card className="border-2 border-electric-cyan/20 bg-gradient-to-br from-electric-cyan/5 to-neon-purple/5 backdrop-blur-sm">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-electric-cyan to-neon-purple">
                {t('roadmap.outcome.title')}
              </h3>
              <p className="text-muted-foreground mb-3 leading-relaxed">
                {t('roadmap.outcome.line1')}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {t('roadmap.outcome.line2')}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Workforce Block */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="max-w-4xl mx-auto mt-8"
        >
          <Card className="border-2 border-glow-green/20 bg-gradient-to-br from-glow-green/5 to-transparent backdrop-blur-sm">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4 text-glow-green">
                {t('roadmap.workforce.title')}
              </h3>
              <p className="text-muted-foreground mb-3 leading-relaxed">
                {t('roadmap.workforce.line1')}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {t('roadmap.workforce.line2')}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mt-12"
        >
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-electric-cyan to-neon-purple hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all duration-300"
          >
            <Link href="/register">
              {t('roadmap.cta.primary')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-electric-cyan/20 hover:bg-electric-cyan/10"
          >
            <a href="https://github.com/veriteknik" target="_blank" rel="noopener noreferrer">
              <Github className="mr-2 h-4 w-4" />
              {t('roadmap.cta.secondary')}
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
