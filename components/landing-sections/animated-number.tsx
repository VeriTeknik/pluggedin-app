'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  target: number;
  inView: boolean;
  duration?: number;
}

export function AnimatedNumber({ target, inView, duration = 1500 }: AnimatedNumberProps) {
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (inView && !hasAnimated.current) {
      hasAnimated.current = true;
      const startTime = Date.now();

      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    }
  }, [inView, target, duration]);

  return <span>{value}</span>;
}
