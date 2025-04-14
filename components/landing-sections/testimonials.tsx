'use client';

import { motion } from 'framer-motion';
// Removed unused Image import
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

// Define testimonial data structure
interface Testimonial {
  quoteKey: string;
  nameKey: string;
  titleKey: string;
  avatarUrl?: string; // Optional avatar image URL
  fallbackInitials: string;
  defaultQuote: string;
  defaultName: string;
  defaultTitle: string;
}

// Placeholder testimonial data - update keys, content, and add avatar URLs
const testimonials: Testimonial[] = [
  {
    quoteKey: 'landing.testimonials.quote1',
    nameKey: 'landing.testimonials.name1',
    titleKey: 'landing.testimonials.title1',
    fallbackInitials: 'JD',
    defaultQuote: '"Plugged.in revolutionized how our team manages MCP servers. The organization features are fantastic!"',
    defaultName: 'Jane Doe',
    defaultTitle: 'Lead AI Engineer, TechCorp',
  },
  {
    quoteKey: 'landing.testimonials.quote2',
    nameKey: 'landing.testimonials.name2',
    titleKey: 'landing.testimonials.title2',
    fallbackInitials: 'AS',
    defaultQuote: '"The community sharing aspect is a game-changer. Discovering new tools is easier than ever."',
    defaultName: 'Alex Smith',
    defaultTitle: 'Independent Developer',
  },
  {
    quoteKey: 'landing.testimonials.quote3',
    nameKey: 'landing.testimonials.name3',
    titleKey: 'landing.testimonials.title3',
    fallbackInitials: 'MK',
    defaultQuote: '"Debugging with the MCP Playground saved us countless hours. Highly recommended!"',
    defaultName: 'Maria Kim',
    defaultTitle: 'Founder, AI Solutions Inc.',
  },
];

// Animation variants for staggering (similar to features section)
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15, // Adjust stagger delay
    },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
    },
  },
};

// Testimonial Card Component
function TestimonialCard({ quoteKey, nameKey, titleKey, avatarUrl, fallbackInitials, defaultQuote, defaultName, defaultTitle }: Testimonial) {
  const { t } = useTranslation(); // Ensure default hook
  return (
    <motion.div variants={itemVariants}>
      <Card className="h-full border border-border/40 bg-background/50 overflow-hidden">
        <CardContent className="pt-6">
          <blockquote className="italic text-muted-foreground mb-4">
            {t(quoteKey.replace('landing.', ''), defaultQuote)} {/* Use relative key */}
          </blockquote>
          <div className="flex items-center space-x-3">
            <Avatar>
              {avatarUrl && <AvatarImage src={avatarUrl} alt={t(nameKey.replace('landing.', ''), defaultName)} />} {/* Use relative key */}
              <AvatarFallback>{fallbackInitials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{t(nameKey.replace('landing.', ''), defaultName)}</p> {/* Use relative key */}
              <p className="text-xs text-muted-foreground">{t(titleKey.replace('landing.', ''), defaultTitle)}</p> {/* Use relative key */}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Main Testimonials Section Component
export function LandingTestimonials() {
  const { t } = useTranslation(); // Ensure default hook

  return (
    <section id="testimonials" className="py-16 md:py-24 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('testimonials.sectionTitle', 'Trusted by Developers Worldwide')} {/* Use relative key */}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('testimonials.sectionSubtitle', 'Hear what our users have to say about Plugged.in.')} {/* Use relative key */}
          </p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {testimonials.map((testimonial) => (
            <TestimonialCard key={testimonial.nameKey} {...testimonial} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
