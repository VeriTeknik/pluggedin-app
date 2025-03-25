'use client';

import { Info, LogOut, Settings, User } from 'lucide-react';
import Link from 'next/link';

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
    await signOut({ callbackUrl: '/' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center w-full gap-2 px-3 py-2 rounded-md hover:bg-sidebar-accent focus:outline-none">
        <div className="flex items-center gap-2 flex-1">
          <Avatar className="h-6 w-6">
            <AvatarImage src={session?.user?.image || ''} alt={session?.user?.name || 'User'} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-left flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{session?.user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {session?.user?.name || 'User'}
        </DropdownMenuLabel>
        <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
          {session?.user?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/setup-guide" className="flex items-center cursor-pointer">
            <Info className="mr-2 h-4 w-4" />
            <span>Setup Guide</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleSignOut}
          className="text-red-600 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 