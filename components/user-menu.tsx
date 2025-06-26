'use client';

import { BookOpen, FileText, Info, Key, LogOut, Newspaper, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next'; // Import useTranslation

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';

export function UserMenu() {
  const { session, isAuthenticated, signOut } = useAuth();
  const { t } = useTranslation(); // Initialize useTranslation

  if (!isAuthenticated) {
    return (
      <Link href="/login" className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-sidebar-accent">
        <User className="h-5 w-5" />
        <span>Sign In</span>
      </Link>
    );
  }

  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n?.[0])
    .join('')
    .toUpperCase() || 'U';

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/logout' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center w-full gap-2 px-3 py-2 rounded-md hover:bg-sidebar-accent focus:outline-none">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="h-8 w-8 border-2 border-background flex-shrink-0">
            <AvatarImage src={session?.user?.image || ''} alt={session?.user?.name || 'User'} />
            <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-left flex-1 overflow-hidden min-w-0">
            <p className="text-sm font-medium truncate">{session?.user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <DropdownMenuLabel className="p-0 truncate">
              {session?.user?.name || 'User'}
            </DropdownMenuLabel>
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground p-0 truncate">
              {session?.user?.email}
            </DropdownMenuLabel>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>{t('settings.title', 'Settings')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/docs" className="flex items-center cursor-pointer">
            <BookOpen className="mr-2 h-4 w-4" />
            <span>{t('docs.title', 'Documentation')}</span>
          </Link>
        </DropdownMenuItem>
         <DropdownMenuItem asChild>
          <Link href="/api-keys" className="flex items-center cursor-pointer">
            <Key className="mr-2 h-4 w-4" />
            <span>{t('apiKeys.title', 'API Keys')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/release-notes" className="flex items-center cursor-pointer">
            <Newspaper className="mr-2 h-4 w-4" />
            <span>{t('releaseNotes.title', 'Release Notes')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/legal" className="flex items-center cursor-pointer">
            <FileText className="mr-2 h-4 w-4" />
            <span>{t('legal.title', 'Legal')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/setup-guide" className="flex items-center cursor-pointer">
            <Info className="mr-2 h-4 w-4" />
            <span>{t('setupGuide.title', 'Setup Guide')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleSignOut}
          className="text-red-600 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('auth.signOut', 'Sign Out')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
