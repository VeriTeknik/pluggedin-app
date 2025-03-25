'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export function LandingHero() {
  const [mounted, setMounted] = useState(false);

  // Ensure animations only start after component is mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-8 py-16">
      <div className={`flex items-center gap-4 mb-4 transition-all duration-700 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-primary/60 rounded-full blur-sm opacity-70"></div>
          <Image
            src="/pluggedin-wl-black.png"
            alt="Plugged.in Logo"
            width={72}
            height={72}
            className="h-18 w-18 relative"
          />
        </div>
        <h1 className="text-5xl font-bold">Plugged.in</h1>
      </div>
      
      <h2 className={`text-3xl font-semibold max-w-2xl transition-all duration-700 delay-200 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        The AI Crossroads
      </h2>
      
      <p className={`text-xl text-muted-foreground max-w-2xl transition-all duration-700 delay-300 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        Connect, create, and extend your AI capabilities with a unified platform.
        Build and manage plugins that enhance your AI workflows.
      </p>
      
      <div className={`flex gap-4 mt-8 transition-all duration-700 delay-400 ease-in-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <Button asChild size="lg" className="px-6">
          <Link href="/setup-guide">
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild size="lg" className="px-6">
          <Link href="/mcp-playground">
            Try Playground
          </Link>
        </Button>
      </div>
      
      <div className={`w-full max-w-lg h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent mt-6 transition-all duration-1000 delay-500 ease-in-out ${mounted ? 'opacity-40 scale-x-100' : 'opacity-0 scale-x-0'}`}></div>
    </div>
  );
} 