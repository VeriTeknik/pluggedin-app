'use client';

import { MessageSquare } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function Footer({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className={cn('w-full mt-auto py-6', className)}>
      <div className="container mx-auto px-4 md:px-6 max-w-10xl">
        <Separator className="mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 place-items-center text-center">
          <div className="space-y-3">
            <div className="flex items-center justify-center space-x-2">
              <a href="https://veritech.net" className="text-muted-foreground hover:text-foreground transition-colors flex items-center">
                {/* Use logoSrc from useThemeLogo hook */}
                <Image src="/vtlogo.png" alt="VeriTeknik Logo" width={210} height={50} /> 
              </a>
            </div>
            <p className="text-sm text-muted-foreground">
              The AI Crossroads. <br />
              Connect, create, and extend your AI capabilities.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/setup-guide" className="text-muted-foreground hover:text-foreground transition-colors">
                  Setup Guide
                </Link>
              </li>
              <li>
                <Link href="/mcp-playground" className="text-muted-foreground hover:text-foreground transition-colors">
                  MCP Playground
                </Link>
              </li>
              <li>
                <Link href="/mcp-servers" className="text-muted-foreground hover:text-foreground transition-colors">
                  MCP Servers
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/legal/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/disclaimer" className="text-muted-foreground hover:text-foreground transition-colors">
                  Disclaimer
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/legal/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <a 
                  href="https://github.com/VeriTeknik/pluggedin-app" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a 
                  href="https://discord.gg/pluggedin" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Discord <MessageSquare className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            <span className="inline-block bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium mr-2">
              Release Candidate
            </span>
            &copy; {year} VeriTeknik B.V. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
