'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { User2, Bot, MessageSquare, MapPin, Globe, Clock, Target, Sparkles, Users, Filter } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { LandingNavbar } from '@/components/landing-navbar';
import { DiscoverAssistants } from '@/components/discover/discover-assistants';
import { db } from '@/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { PaginationUi } from '@/app/(sidebar-layout)/(container)/search/components/PaginationUi';

// Client component that handles the main content
function ToPageContent() {
  const { t } = useTranslation(['discover', 'common']);
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'assistants');
  const [publicUsers, setPublicUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPagination, setUsersPagination] = useState({
    totalPages: 1,
    totalCount: 0,
    hasMore: false,
  });
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAssistants: 0,
    todayMessages: 0,
  });

  useEffect(() => {
    // Fetch public users with pagination
    async function fetchUsers() {
      setIsLoadingUsers(true);
      try {
        const usersResponse = await fetch(`/api/public/users?page=${currentPage}&limit=12`);
        
        if (usersResponse.ok) {
          const data = await usersResponse.json();
          setPublicUsers(data.users || []);
          setUsersPagination(data.pagination || {
            totalPages: 1,
            totalCount: 0,
            hasMore: false,
          });
        }
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setIsLoadingUsers(false);
      }
    }
    
    fetchUsers();
  }, [currentPage]);

  useEffect(() => {
    // Fetch stats separately
    async function fetchStats() {
      try {
        const statsResponse = await fetch('/api/public/stats');
        
        if (statsResponse.ok) {
          const data = await statsResponse.json();
          setStats(data.stats || {
            totalUsers: 0,
            totalAssistants: 0,
            todayMessages: 0,
          });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    }
    fetchStats();
  }, []);

  return (
    <>
      <LandingNavbar />
      <div className="container py-8 max-w-screen-2xl mx-auto px-4 md:px-8">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            {t('discover:title', 'Discover AI Community')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('discover:subtitle', 'Explore AI assistants and connect with creators in our community')}
          </p>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          if (value === 'experts') {
            setCurrentPage(1); // Reset to first page when switching to experts tab
          }
        }} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="assistants" className="gap-2">
              <Bot className="h-4 w-4" />
              {t('discover:tabs.chats', 'AI Assistants')}
            </TabsTrigger>
            <TabsTrigger value="experts" className="gap-2">
              <Users className="h-4 w-4" />
              {t('discover:tabs.experts', 'Creators')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assistants" className="space-y-6">
            <DiscoverAssistants />
          </TabsContent>

          <TabsContent value="experts" className="space-y-6">
            <div className="space-y-6">
              {/* Stats Card */}
              <Card>
                <CardContent className="py-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-3xl font-bold text-purple-600">{stats.totalUsers}</div>
                      <p className="text-sm text-muted-foreground mt-1">Active Creators</p>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-blue-600">{stats.totalAssistants}</div>
                      <p className="text-sm text-muted-foreground mt-1">AI Assistants</p>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-green-600">{stats.todayMessages}</div>
                      <p className="text-sm text-muted-foreground mt-1">Messages Today</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expert Profiles Grid */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <User2 className="h-6 w-6 text-green-600" />
                    Featured Creators
                  </h2>
                  {usersPagination.totalCount > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Showing {publicUsers.length} of {usersPagination.totalCount} creators
                    </p>
                  )}
                </div>
                
                {isLoadingUsers ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, idx) => (
                      <Skeleton key={idx} className="h-48" />
                    ))}
                  </div>
                ) : publicUsers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {publicUsers.map((user: any) => (
                      <Link key={user.username || user.id} href={`/to/${user.username}`}>
                        <Card className="hover:shadow-md transition-all hover:scale-105">
                          <CardContent className="p-4">
                            <div className="flex flex-col items-center text-center">
                              {user.image || user.avatar_url ? (
                                <Image
                                  src={user.image || user.avatar_url}
                                  alt={user.name || user.username}
                                  width={64}
                                  height={64}
                                  className="w-16 h-16 rounded-full mb-3"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 flex items-center justify-center mb-3">
                                  <User2 className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                                </div>
                              )}
                              <div className="font-semibold">{user.name || user.username}</div>
                              <div className="text-sm text-gray-500">@{user.username}</div>
                              {user.bio && (
                                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                  {user.bio}
                                </p>
                              )}
                              {user.assistant_count > 0 && (
                                <Badge variant="outline" className="mt-2">
                                  <Bot className="h-3 w-3 mr-1" />
                                  {user.assistant_count} {user.assistant_count === 1 ? 'Assistant' : 'Assistants'}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <User2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No creators found yet.</p>
                    </CardContent>
                  </Card>
                )}
                
                {/* Pagination */}
                {usersPagination.totalPages > 1 && (
                  <div className="mt-6">
                    <PaginationUi
                      currentPage={currentPage}
                      totalPages={usersPagination.totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* CTA Section for unauthenticated users */}
        {!session?.user && (
          <Card className="mt-12 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-purple-200 dark:border-purple-800">
            <CardContent className="py-8 text-center">
              <h3 className="text-2xl font-bold mb-3">
                {t('discover:cta.title', 'Join Our Community')}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                {t('discover:cta.description', 'Create your own AI assistants, share them with the world, and connect with other creators')}
              </p>
              <div className="flex gap-4 justify-center">
                <Button 
                  size="lg"
                  asChild
                >
                  <Link href="/register">
                    {t('discover:cta.signUp', 'Sign Up Free')}
                  </Link>
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  asChild
                >
                  <Link href="/login">
                    {t('discover:cta.logIn', 'Log In')}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

// Force dynamic rendering since this page needs client-side features
export const dynamic = 'force-dynamic';

export default function ToDirectoryPage() {
  return <ToPageContent />;
}