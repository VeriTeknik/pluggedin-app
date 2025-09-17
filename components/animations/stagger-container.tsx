'use client';

import { motion, Variants } from 'framer-motion';
import React from 'react';

interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  staggerChildren?: number;
  animateOnce?: boolean;
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade';
  distance?: number;
}

const getVariants = (direction: StaggerContainerProps['direction'] = 'up', distance = 30): Variants => {
  const hiddenState = {
    opacity: 0,
    ...(direction === 'up' && { y: distance }),
    ...(direction === 'down' && { y: -distance }),
    ...(direction === 'left' && { x: distance }),
    ...(direction === 'right' && { x: -distance })
  };

  return {
    hidden: hiddenState,
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 12
      }
    }
  };
};

export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  className,
  delay = 0,
  staggerChildren = 0.1,
  animateOnce = true,
  direction = 'up',
  distance = 30
}) => {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: staggerChildren
      }
    }
  };

  const itemVariants = getVariants(direction, distance);

  // Convert children to array and wrap each in motion.div
  const childrenArray = React.Children.toArray(children);
  const animatedChildren = childrenArray.map((child, index) => (
    <motion.div key={index} variants={itemVariants}>
      {child}
    </motion.div>
  ));

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: animateOnce, amount: 0.1 }}
      variants={containerVariants}
    >
      {animatedChildren}
    </motion.div>
  );
};

// Specific stagger components for different use cases
export const StaggerGrid: React.FC<StaggerContainerProps & { columns?: number }> = ({
  children,
  columns = 3,
  className,
  ...props
}) => {
  return (
    <StaggerContainer
      className={`grid grid-cols-1 md:grid-cols-${columns} gap-6 ${className || ''}`}
      staggerChildren={0.05}
      {...props}
    >
      {children}
    </StaggerContainer>
  );
};

export const StaggerList: React.FC<StaggerContainerProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <StaggerContainer
      className={`space-y-4 ${className || ''}`}
      staggerChildren={0.08}
      direction="up"
      {...props}
    >
      {children}
    </StaggerContainer>
  );
};

export const StaggerCards: React.FC<StaggerContainerProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <StaggerContainer
      className={`flex flex-wrap gap-4 ${className || ''}`}
      staggerChildren={0.06}
      direction="fade"
      {...props}
    >
      {children}
    </StaggerContainer>
  );
};

// Hook for custom stagger animations
export const useStaggerAnimation = (
  delay = 0,
  staggerChildren = 0.1
): Variants => {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: staggerChildren
      }
    }
  };
};

// Presets for common stagger patterns
export const staggerPresets = {
  fadeInUp: {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' }
    }
  },
  fadeInDown: {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' }
    }
  },
  fadeInLeft: {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.5, ease: 'easeOut' }
    }
  },
  fadeInRight: {
    hidden: { opacity: 0, x: 20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.5, ease: 'easeOut' }
    }
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.5, ease: 'easeOut' }
    }
  },
  rotateIn: {
    hidden: { opacity: 0, rotate: -10 },
    visible: {
      opacity: 1,
      rotate: 0,
      transition: { duration: 0.6, ease: 'easeOut' }
    }
  }
};