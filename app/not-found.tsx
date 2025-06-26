'use client';

import { Home, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useThemeLogo } from '@/hooks/use-theme-logo';

// Language model planets that will orbit around the circles
const languageModels = [
  { name: 'GPT', size: 32, orbit: 30, speed: 20, startPosition: 0 },
  { name: 'Claude', size: 36, orbit: 30, speed: 25, startPosition: 120 },
  { name: 'Llama', size: 30, orbit: 30, speed: 30, startPosition: 240 },
  { name: 'Gemini', size: 34, orbit: 20, speed: 15, startPosition: 60 },
  { name: 'Mistral', size: 28, orbit: 20, speed: 18, startPosition: 180 },
  { name: 'MCP', size: 26, orbit: 20, speed: 22, startPosition: 300 },
  { name: 'Falcon', size: 24, orbit: 40, speed: 12, startPosition: 30 },
  { name: 'Cohere', size: 26, orbit: 40, speed: 14, startPosition: 150 },
  { name: 'Anthropic', size: 28, orbit: 40, speed: 16, startPosition: 270 },
];

// Planet component that orbits around a circle
function OrbitingPlanet({ name, size, orbit, speed, startPosition }: { 
  name: string;
  size: number;
  orbit: number;
  speed: number;
  startPosition: number;
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [angle, setAngle] = useState(startPosition);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const newAngle = (angle + 0.2) % 360;
      setAngle(newAngle);
      
      // Calculate position based on orbit radius
      const radians = (newAngle * Math.PI) / 180;
      const x = 50 + orbit * Math.cos(radians);
      const y = 50 + orbit * Math.sin(radians);
      
      setPosition({ x, y });
    }, speed);

    return () => clearInterval(intervalId);
  }, [angle, orbit, speed]);

  return (
    <g transform={`translate(${position.x}, ${position.y})`}>
      {/* Use a subtle gradient for the planet */}
      <circle 
        r={size / 10} 
        className="fill-primary/20 stroke-primary/30" 
        strokeWidth="0.3"
        filter="url(#planetGlow)"
      />
      <text 
        textAnchor="middle" 
        dominantBaseline="middle" 
        className="fill-primary/80 text-xs"
        style={{ fontSize: `${size / 12}px` }}
      >
        {name}
      </text>
    </g>
  );
}

export default function NotFound() {
  const { t } = useTranslation(['common']);
  const { isAuthenticated } = useAuth();
  const { logoSrc } = useThemeLogo();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background overflow-hidden">
      <div className="w-full h-screen relative">
        {/* Fixed background illustration that looks good on all screen sizes */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Static circles with fixed positions relative to viewport */}
          <div className="fixed top-[20%] left-[20%] w-[15vw] h-[15vw] min-w-[100px] min-h-[100px] max-w-[200px] max-h-[200px] rounded-full bg-primary/5 animate-pulse"></div>
          <div className="fixed bottom-[30%] right-[20%] w-[20vw] h-[20vw] min-w-[120px] min-h-[120px] max-w-[250px] max-h-[250px] rounded-full bg-primary/5 animate-pulse" style={{ animationDelay: '0.5s' }}></div>
          <div className="fixed top-[60%] left-[25%] w-[12vw] h-[12vw] min-w-[80px] min-h-[80px] max-w-[150px] max-h-[150px] rounded-full bg-primary/5 animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="fixed top-[30%] right-[25%] w-[18vw] h-[18vw] min-w-[100px] min-h-[100px] max-w-[220px] max-h-[220px] rounded-full bg-primary/5 animate-pulse" style={{ animationDelay: '1.5s' }}></div>
          
          {/* Responsive orbital circles with orbiting planets */}
          <div className="fixed inset-0 pointer-events-none">
            <svg className="w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <defs>
                <filter id="planetGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                
                <linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.05"/>
                  <stop offset="50%" stopColor="currentColor" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.05"/>
                </linearGradient>
              </defs>
              
              {/* Orbital paths with subtle gradient - removed diagonal lines */}
              <circle cx="50" cy="50" r="20" fill="none" stroke="url(#orbitGradient)" strokeWidth="0.1" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="url(#orbitGradient)" strokeWidth="0.1" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="url(#orbitGradient)" strokeWidth="0.1" />
              
              {/* Orbiting language model planets */}
              {languageModels.map((model) => (
                <OrbitingPlanet
                  key={model.name}
                  name={model.name}
                  size={model.size}
                  orbit={model.orbit}
                  speed={model.speed}
                  startPosition={model.startPosition}
                />
              ))}
            </svg>
          </div>
        </div>
        
        {/* Central content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* 404 Message */}
          <div className="text-center mb-8 px-8 py-4">
            <h1 className="text-5xl font-bold text-foreground mb-2">404</h1>
            <p className="text-xl text-foreground">
              {t('common.errors.pageNotFound')}
            </p>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/10 opacity-50"></div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 animate-spin-slow"></div>
            <div className="relative flex items-center justify-center w-48 h-48 rounded-full bg-background/60 backdrop-blur-md border border-primary/20 p-5">
              {mounted && (
                <Image 
                  src={logoSrc}
                  alt={t('common.pluggedinLogo')}
                  width={160} 
                  height={160} 
                  className="filter drop-shadow-lg"
                  priority
                />
              )}
            </div>
          </div>
          
          <div className="text-center mb-12 max-w-md px-6">
            <p className="text-foreground mb-4 text-lg backdrop-blur-sm bg-background/30 p-4">
              {t('common.errors.pageNotFoundMessage')}
            </p>
          </div>
          
          {/* Navigation buttons with standard (non-rounded) design */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild variant="secondary" className="min-w-[160px]">
              <Link href="/">
                <Home className="mr-2 h-5 w-5" />
                {t('actions.goHome')}
              </Link>
            </Button>
            
            {isAuthenticated ? (
              <Button asChild variant="default" className="min-w-[160px]">
                <Link href="/mcp-playground">
                  <Search className="mr-2 h-5 w-5" />
                  {t('actions.playground')}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="default" className="min-w-[160px]">
                <Link href="/login">
                  {t('actions.login')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 