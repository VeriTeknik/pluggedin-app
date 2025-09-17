'use client';

import { useEffect, useRef, useState } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const particlesRef = useRef<Particle[]>([]);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    // Don't render particles if user prefers reduced motion
    if (isReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Set canvas size with device pixel ratio for sharper rendering
    const setCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    setCanvasSize();

    // Debounce resize to improve performance
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(setCanvasSize, 250);
    };
    window.addEventListener('resize', handleResize);

    // Initialize particles - reduced count for better performance
    const particleCount = 30; // Reduced from 50
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3, // Slower movement
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.4 + 0.1, // Slightly more transparent
      });
    }
    particlesRef.current = particles;

    // Optimized animation loop
    let lastTime = 0;
    const targetFPS = 30; // Limit to 30 FPS for better performance
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;

      if (deltaTime > frameInterval) {
        lastTime = currentTime - (deltaTime % frameInterval);

        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        // Batch canvas operations for better performance
        ctx.save();

        // Draw all particles first
        particlesRef.current.forEach((particle) => {
          particle.x += particle.vx;
          particle.y += particle.vy;

          // Wrap around edges instead of bouncing for smoother performance
          if (particle.x < 0) particle.x = window.innerWidth;
          if (particle.x > window.innerWidth) particle.x = 0;
          if (particle.y < 0) particle.y = window.innerHeight;
          if (particle.y > window.innerHeight) particle.y = 0;

          // Draw particle
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(6, 182, 212, ${particle.opacity})`;
          ctx.fill();
        });

        // Draw connections with optimized loop (only check particles ahead)
        const maxDistance = 120; // Reduced from 150
        const maxDistanceSquared = maxDistance * maxDistance;

        for (let i = 0; i < particlesRef.current.length; i++) {
          const particle1 = particlesRef.current[i];

          // Only check particles ahead in the array to avoid duplicate connections
          for (let j = i + 1; j < particlesRef.current.length; j++) {
            const particle2 = particlesRef.current[j];
            const dx = particle1.x - particle2.x;
            const dy = particle1.y - particle2.y;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < maxDistanceSquared) {
              const distance = Math.sqrt(distanceSquared);
              const opacity = 0.12 * (1 - distance / maxDistance);

              ctx.beginPath();
              ctx.moveTo(particle1.x, particle1.y);
              ctx.lineTo(particle2.x, particle2.y);
              ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }

        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 opacity-50"
      style={{
        background: 'transparent',
        willChange: isReducedMotion ? 'auto' : 'transform',
      }}
      aria-hidden="true"
    />
  );
}