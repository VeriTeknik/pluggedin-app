'use client';

import { TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GrowthBadgeProps {
  value: string;
  label: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function GrowthBadge({ value, label, className, size = 'md' }: GrowthBadgeProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-3'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 300 }}
      className={cn(
        'inline-flex items-center rounded-full',
        'bg-gradient-to-r from-glow-green/20 via-electric-cyan/20 to-glow-green/20',
        'border border-glow-green/40',
        'backdrop-blur-sm',
        'animate-gradient-shift bg-300%',
        sizeClasses[size],
        className
      )}
    >
      <TrendingUp className={cn('text-glow-green', iconSizes[size])} />
      <span className="font-bold text-glow-green">{value}</span>
      <span className="text-foreground/80">{label}</span>
      <div className="absolute inset-0 rounded-full bg-glow-green/10 blur-xl animate-pulse" />
    </motion.div>
  );
}