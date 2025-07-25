'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useMounted } from '@/hooks/use-mounted';
import { useThemeLogo } from '@/hooks/use-theme-logo';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useKeyPress } from '@/hooks/useKeyPress';

// Navigation links
const navLinks = [
  { href: '#why-pluggedin', labelKey: 'navigation.whyPluggedin' },
  { href: '#features', labelKey: 'navigation.features' },
  { href: '#ai-models', labelKey: 'navigation.aiModels' },
  { href: '#pricing', labelKey: 'navigation.pricing' },
  { href: '#community', labelKey: 'navigation.community' },
  { href: '/docs', labelKey: 'navigation.documentation' },
];

export function LandingNavbar() {
  const mounted = useMounted();
  const { logoSrc } = useThemeLogo();
  const { t } = useTranslation('landing');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  // Close mobile menu on escape key or outside click
  useKeyPress('Escape', () => setIsMobileMenuOpen(false), isMobileMenuOpen);
  useClickOutside(menuRef, () => setIsMobileMenuOpen(false));

  return (
    <div ref={menuRef}>
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 md:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            {mounted && (
              <Image
                src={logoSrc}
                alt="Plugged.in Logo"
                width={120}
                height={30}
                className="h-auto"
              />
            )}
            {!mounted && <div className="w-[120px] h-[30px]"></div>}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t(link.labelKey)}
              </Link> 
            ))}
            <ThemeToggle />
            <Button asChild size="sm">
              <Link href="/login">
                {t('navigation.getStarted')}
              </Link>
            </Button>
          </div>

          {/* Mobile Navigation Toggle */}
          <div className="md:hidden flex items-center">
             <ThemeToggle />
             <Button variant="ghost" size="icon" onClick={toggleMobileMenu} className="ml-2">
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 w-full bg-background border-b pb-4 animate-in fade-in-20 slide-in-from-top-5">
            <div className="container mx-auto flex flex-col space-y-4 px-4 md:px-6 lg:px-8 pt-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={toggleMobileMenu}
                >
                  {t(link.labelKey)}
                </Link>
              ))}
              <Button asChild className="w-full">
                <Link href="/login" onClick={toggleMobileMenu}>
                  {t('navigation.getStarted')}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
