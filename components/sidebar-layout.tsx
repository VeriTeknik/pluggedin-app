'use client';

import {
  Bell,
  Blocks,
  Code2,
  FlaskConical,
  Plus,
  Trash2,
  Unplug,
  Users,
} from 'lucide-react'; // External library
import Image from 'next/image'; // Next.js
import Link from 'next/link'; // Next.js
import { usePathname } from 'next/navigation'; // Next.js
import * as React from 'react'; // React first
import { useEffect, useState } from 'react'; // React hooks
import { useTranslation } from 'react-i18next'; // External library

// Internal imports start here
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useCodes } from '@/hooks/use-codes';
import { useProjects } from '@/hooks/use-projects';
import { useThemeLogo } from '@/hooks/use-theme-logo';
import { useToast } from '@/hooks/use-toast';
import { Code } from '@/types/code';

import { NotificationBell } from './notification-bell'; // Local components last
import { ProfileSwitcher } from './profile-switcher';
import { ProjectSwitcher } from './project-switcher';
import { UserMenu } from './user-menu';

// Local storage key for sidebar state
const SIDEBAR_STATE_KEY = 'sidebar:expanded';

// Get version from environment variable (set in next.config.ts)
const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.4.0';

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { codes, createCode, deleteCode } = useCodes();
  const [open, setOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [selectedCodeUuid, setSelectedCodeUuid] = React.useState<string | null>(
    null
  );
  const [fileName, setFileName] = React.useState('');
  const { toast } = useToast();
  const { logoSrc } = useThemeLogo();
  const { isAuthenticated } = useProjects();
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();
  
  // State for sidebar expansion
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (savedState !== null) {
        setSidebarExpanded(savedState === 'true');
      }
    } catch (error) {
      console.error('Failed to load sidebar state from localStorage:', error);
    }
  }, []);

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      try {
        localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(sidebarExpanded));
        
        // Also update via cookie to ensure the sidebar.tsx component picks it up
        document.cookie = `sidebar:state=${sidebarExpanded}; path=/; max-age=${60 * 60 * 24 * 7}`;
      } catch (error) {
        console.error('Failed to save sidebar state to localStorage:', error);
      }
    }
  }, [sidebarExpanded, mounted]);

  // Removed unused toggleSidebar function

  // Skip rendering any translated content until after hydration
  if (!mounted) {
    return null;
  }

  const handleCreateCode = async () => {
    if (fileName.trim()) {
      await createCode(fileName, '');
      setFileName('');
      setOpen(false);
    }
  };

  // If not authenticated, only show minimal layout
  if (!isAuthenticated) {
    return (
      <div className='flex flex-1 h-screen'>
        <div className='flex-1 flex flex-col'>
          <main className='flex-1 overflow-y-auto'>
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={sidebarExpanded}>
      <div className='flex flex-1 h-screen'>
        {/* Main Sidebar */}
        <Sidebar collapsible='icon' variant="sidebar" className='w-64 flex-shrink-0 border-r' style={{ '--sidebar-width-icon': '3.5rem' } as React.CSSProperties}>
          <SidebarHeader className='flex flex-col px-2 py-4'>
            <div className='mb-2 px-3'>
              <div className="flex items-center justify-between">
                <div className="flex-1 flex justify-center">
                  <Link href="/" className="flex items-center justify-center">
                    <Image
                      src={logoSrc}
                      alt='Plugged.in Logo'
                      width={288}
                      height={72}
                      className='h-10 w-36 group-data-[collapsible=icon]:hidden'
                      priority
                    />
                    {/* Small logo for collapsed state */}
                    <div className="hidden group-data-[collapsible=icon]:block group-data-[collapsible=icon]:text-center group-data-[collapsible=icon]:pt-2">
                      <Image
                        src="/P-logo-gr.png"
                        alt="P Logo"
                        width={16}
                        height={16}
                        className="w-4 h-4 mx-auto"
                      />
                    </div>
                  </Link>
                </div>
                <div className="group-data-[collapsible=icon]:hidden">
                  <NotificationBell />
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 group-data-[collapsible=icon]:hidden">
                {t('common.releaseCandidate', { version })}
              </div>
            </div>
            <div className="group-data-[collapsible=icon]:hidden">
              <ProjectSwitcher />
              <ProfileSwitcher />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>{t('sidebar.navigation')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  
                <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={t('playground.title')} className="group-data-[collapsible=icon]:justify-center">
                      <Link href='/mcp-playground'>
                        <FlaskConical className='mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0' />
                        <span className="group-data-[collapsible=icon]:hidden">{t('playground.title')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={t('mcpServers.title')} className="group-data-[collapsible=icon]:justify-center">
                      <Link href='/mcp-servers'>
                        <Unplug className='mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0' />
                        <span className="group-data-[collapsible=icon]:hidden">{t('mcpServers.title')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={t('search.explorePlugins')} className="group-data-[collapsible=icon]:justify-center">
                      <Link href='/search'>
                        <Blocks className='mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0' />
                        <span className="group-data-[collapsible=icon]:hidden">{t('search.explorePlugins')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  
                  {/* Add Discover Link */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Discover" className="group-data-[collapsible=icon]:justify-center">
                      <Link href='/discover'>
                        <Users className='mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0' />
                        <span className="group-data-[collapsible=icon]:hidden">Discover</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  
                  {/* TODO: Add custom MCP servers to the sidebar */}
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip={t('notifications.title')} className="group-data-[collapsible=icon]:justify-center">
                      <Link href='/notifications'>
                        <Bell className='mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0' />
                        <span className="group-data-[collapsible=icon]:hidden">{t('notifications.title')}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {/* <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href='/inspector-guide'>
                        <Terminal className='mr-2 h-4 w-4' />
                        <span>Inspector Guide</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem> */}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="mt-auto px-2 py-4">
            <SidebarSeparator />
            <div className="pt-2">
              <div className="group-data-[collapsible=icon]:hidden">
                <UserMenu />
              </div>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        {/* Secondary Sidebar */}
        {pathname?.startsWith('/editor') && (
          <Sidebar collapsible='icon' className='w-64 flex-shrink-0 border-r' style={{ '--sidebar-width-icon': '3.5rem' } as React.CSSProperties}>
            <SidebarHeader className='h-16 flex items-center px-4 mt-4'>
              <div className="flex items-center justify-between w-full">
                <h2 className='text-lg font-semibold group-data-[collapsible=icon]:hidden'>Code Files</h2>
                <div className="hidden group-data-[collapsible=icon]:block group-data-[collapsible=icon]:text-center w-full">
                  <Code2 className="h-4 w-4 mx-auto" />
                </div>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Files</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                          <SidebarMenuButton tooltip="New Code File" className="group-data-[collapsible=icon]:justify-center">
                            <Plus className='h-4 w-4 mr-2 group-data-[collapsible=icon]:mr-0' />
                            <span className="group-data-[collapsible=icon]:hidden">New Code File</span>
                          </SidebarMenuButton>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create New Code File</DialogTitle>
                            <DialogDescription>
                              Enter a name for your new code file.
                            </DialogDescription>
                          </DialogHeader>
                          <div className='py-4'>
                            <Input
                              value={fileName}
                              onChange={(e) => setFileName(e.target.value)}
                              placeholder='Enter file name'
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCreateCode();
                                }
                              }}
                            />
                          </div>
                          <DialogFooter>
                            <Button
                              variant='outline'
                              onClick={() => setOpen(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleCreateCode}>Create</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </SidebarMenuItem>
                    {codes.map((code: Code) => (
                      <SidebarMenuItem key={code.uuid}>
                        <SidebarMenuButton asChild className='w-full group-data-[collapsible=icon]:justify-center' tooltip={code.fileName}>
                          <Link
                            href={`/editor/${code.uuid}`}
                            className='flex items-center w-full group'>
                            <div className='flex-grow flex items-center'>
                              <Code2 className='mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0' />
                              <span className="group-data-[collapsible=icon]:hidden">{code.fileName}</span>
                            </div>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity group-data-[collapsible=icon]:hidden'
                              onClick={(e) => {
                                e.preventDefault();
                                setSelectedCodeUuid(code.uuid);
                                setDeleteDialogOpen(true);
                              }}>
                              <Trash2 className='h-4 w-4 text-muted-foreground hover:text-destructive' />
                            </Button>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarRail />
          </Sidebar>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Code File</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this code file? This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant='destructive'
                onClick={async () => {
                  if (selectedCodeUuid) {
                    try {
                      await deleteCode(selectedCodeUuid);
                      setDeleteDialogOpen(false);
                      setSelectedCodeUuid(null);
                    } catch (_error) {
                      console.error(_error);
                      toast({
                        variant: 'destructive',
                        title: 'Failed to delete code',
                        description:
                          'Make sure the code is not used in any Custom MCP Servers and try again.',
                      });
                    }
                  }
                }}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main Content Area */}
        <SidebarInset className='flex-grow'
          // Make content area take full width when sidebar is collapsed
          style={{
            marginLeft: sidebarExpanded ? '0' : '-2.5rem'
          }}
        >
          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-between p-2 border-b bg-background sticky top-0 z-10">
            {/* Add Logo or Title if desired */}
            <div className="flex-1"></div> {/* Spacer */}
            <SidebarTrigger />
          </div>
          {/* End Mobile Header */}
          <main className='h-full overflow-auto'>{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
