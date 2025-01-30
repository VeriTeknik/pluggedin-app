'use client';

import { Key, Server, Settings, Wrench } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';

import { ProfileSwitcher } from './profile-switcher';
import { ProjectSwitcher } from './project-switcher';

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className='flex flex-1 h-screen'>
        <Sidebar>
          <SidebarHeader className='flex items-center justify-center'>
            <div className='flex items-center gap-4 px-2 py-4'>
              <Image
                src='/favicon.ico'
                alt='MetaTool Logo'
                width={256}
                height={256}
                className='h-12 w-12'
              />
              <span className='text-2xl font-bold'>MetaTool</span>
            </div>
            <div className='flex flex-col w-full'>
              <ProjectSwitcher />
              <ProfileSwitcher />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className='p-2'>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href='/mcp-servers'>
                    <Server className='mr-2 h-4 w-4' />
                    <span>MCP Servers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href='/custom-mcp-servers'>
                    <Wrench className='mr-2 h-4 w-4' />
                    <span>Custom MCP Servers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href='/api-keys'>
                    <Key className='mr-2 h-4 w-4' />
                    <span>API Keys</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href='/settings'>
                    <Settings className='mr-2 h-4 w-4' />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {/* Add more menu items here as needed */}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <div className='flex-1 overflow-auto'>
          <main>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
