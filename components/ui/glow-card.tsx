'use client';

import { cn } from '@/lib/utils';

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  onClick?: () => void;
}

export function GlowCard({
  children,
  className,
  glowColor = 'rgba(6, 182, 212, 0.5)',
  onClick
}: GlowCardProps) {
  return (
    <div
      className={cn(
        'relative group glow',
        'rounded-xl p-[2px]',
        'bg-gradient-to-r from-electric-cyan via-neon-purple to-electric-cyan',
        'animate-gradient-shift bg-300%',
        'transition-all duration-300',
        'hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]',
        className
      )}
      onClick={onClick}
    >
      <div className="relative h-full w-full rounded-xl bg-background/95 backdrop-blur-xl p-6">
        {children}
      </div>
    </div>
  );
}
