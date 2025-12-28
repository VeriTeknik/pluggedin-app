'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AdminNav() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  const isActiveGroup = (paths: string[]) => paths.some((path) => pathname.startsWith(path));

  return (
    <nav className="ml-6 flex items-center space-x-1">
      {/* AI Models Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'text-sm font-medium transition-colors hover:text-primary',
              isActiveGroup(['/admin/models', '/admin/model-services', '/admin/model-routers'])
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            AI Models
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <Link
              href="/admin/models"
              className={cn('w-full cursor-pointer', isActive('/admin/models') && 'bg-accent')}
            >
              Models
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/admin/model-services"
              className={cn(
                'w-full cursor-pointer',
                isActive('/admin/model-services') && 'bg-accent'
              )}
            >
              Model Services
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/admin/model-routers"
              className={cn(
                'w-full cursor-pointer',
                isActive('/admin/model-routers') && 'bg-accent'
              )}
            >
              Model Routers
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clusters - Direct Link */}
      <Link
        href="/admin/clusters"
        className={cn(
          'text-sm font-medium transition-colors hover:text-primary px-3 py-2 rounded-md',
          isActive('/admin/clusters') ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        Clusters
      </Link>

      {/* Agent Templates - Direct Link */}
      <Link
        href="/admin/agent-templates"
        className={cn(
          'text-sm font-medium transition-colors hover:text-primary px-3 py-2 rounded-md',
          isActive('/admin/agent-templates') ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        Agent Templates
      </Link>

      {/* Emails Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'text-sm font-medium transition-colors hover:text-primary',
              isActiveGroup(['/admin/emails'])
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            Emails
            <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem asChild>
            <Link
              href="/admin/emails"
              className={cn('w-full cursor-pointer', isActive('/admin/emails') && 'bg-accent')}
            >
              Email Management
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/admin/emails/compose"
              className={cn(
                'w-full cursor-pointer',
                isActive('/admin/emails/compose') && 'bg-accent'
              )}
            >
              Compose
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/admin/emails/templates"
              className={cn(
                'w-full cursor-pointer',
                isActive('/admin/emails/templates') && 'bg-accent'
              )}
            >
              Templates
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href="/admin/emails/history"
              className={cn(
                'w-full cursor-pointer',
                isActive('/admin/emails/history') && 'bg-accent'
              )}
            >
              History
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
