'use client';

import { motion } from 'framer-motion';
import { BookOpen, Bell, Lock, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useMemo } from 'react';

import { HeroVideoDialog } from '@/components/ui/hero-video-dialog';
import { useMounted } from '@/hooks/use-mounted';
import { getSafeYouTubeUrl } from '@/lib/video-url-validator';

const tutorials = [
  {
    key: 'quickSetup',
    icon: Zap,
    color: 'from-blue-500 to-cyan-500',
    iconColor: 'text-blue-500',
    // Placeholder thumbnail - replace with actual video thumbnail
    thumbnail: 'https://placehold.co/600x400/1e293b/06b6d4?text=Quick+Setup',
  },
  {
    key: 'ragArchive',
    icon: BookOpen,
    color: 'from-purple-500 to-pink-500',
    iconColor: 'text-purple-500',
    thumbnail: 'https://placehold.co/600x400/1e293b/a855f7?text=RAG+Archive',
  },
  {
    key: 'notifications',
    icon: Bell,
    color: 'from-orange-500 to-red-500',
    iconColor: 'text-orange-500',
    thumbnail: 'https://placehold.co/600x400/1e293b/f97316?text=Notifications',
  },
  {
    key: 'oauthServers',
    icon: Lock,
    color: 'from-green-500 to-emerald-500',
    iconColor: 'text-green-500',
    thumbnail: 'https://placehold.co/600x400/1e293b/10b981?text=OAuth+Setup',
  },
];

export function VideoTutorialsSection() {
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
    <section id="video-tutorials" ref={ref} className="relative py-24 overflow-hidden bg-gradient-to-b from-background via-tech-blue-950/5 to-background">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <div className="container relative z-10 mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-electric-cyan to-neon-purple">
              {t('videoTutorials.title')}
            </span>
          </h2>

          <p className="text-lg text-muted-foreground leading-relaxed">
            {t('videoTutorials.subtitle')}
          </p>
        </motion.div>

        {/* Videos Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {tutorials.map((tutorial, index) => (
            <motion.div
              key={tutorial.key}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + index * 0.1, duration: 0.6 }}
              className="group"
            >
              <div className="relative bg-card/50 backdrop-blur-sm rounded-2xl p-6 border border-border/50 hover:border-electric-cyan/30 transition-all duration-300">
                {/* Icon and Title */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-electric-cyan/10 to-neon-purple/10 flex items-center justify-center">
                    <tutorial.icon className={`w-6 h-6 ${tutorial.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">
                      {t(`videoTutorials.${tutorial.key}.title`)}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t(`videoTutorials.${tutorial.key}.duration`)}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {t(`videoTutorials.${tutorial.key}.description`)}
                </p>

                {/* Video Player */}
                <HeroVideoDialog
                  animationStyle="from-center"
                  videoSrc={getSafeYouTubeUrl(t(`videoTutorials.${tutorial.key}.videoUrl`)) || ''}
                  thumbnailSrc={tutorial.thumbnail}
                  thumbnailAlt={t(`videoTutorials.${tutorial.key}.title`)}
                  className="rounded-lg overflow-hidden"
                  aria-label={t(`videoTutorials.${tutorial.key}.title`)}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8 }}
          className="text-center mt-12"
        >
          <p className="text-sm text-muted-foreground">
            {t('videoTutorials.moreVideos')} <a href="https://docs.plugged.in" className="text-electric-cyan hover:underline">{t('videoTutorials.docsLink')}</a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
