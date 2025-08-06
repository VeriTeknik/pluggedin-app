import { sql, eq, and, desc, isNotNull } from 'drizzle-orm';
import { User2, Bot, MessageSquare, MapPin, Globe, Clock, Briefcase, Target, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { LandingNavbar } from '@/components/landing-navbar';
import { db } from '@/db';
import { users, embeddedChatsTable, projectsTable } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PublicUser {
  username: string;
  name: string | null;
  image: string | null;
  assistantCount?: number;
}

// Force dynamic rendering since this page queries the database
export const dynamic = 'force-dynamic';

export default async function ToDirectoryPage() {
  try {
    // Fetch public users with their assistant counts
    const publicUsersRaw = await db
      .select({ 
        username: users.username, 
        name: users.name, 
        image: users.image,
        userId: users.id
      })
      .from(users)
      .where(sql`${users.is_public} = true AND ${users.username} IS NOT NULL`);

    // Get assistant counts for each user
    const publicUsersWithCounts = await Promise.all(
      publicUsersRaw
        .filter((user) => user.username !== null)
        .map(async (user) => {
          const assistantCount = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(embeddedChatsTable)
            .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
            .where(
              and(
                eq(projectsTable.user_id, user.userId),
                eq(embeddedChatsTable.is_public, true),
                eq(embeddedChatsTable.is_active, true)
              )
            );
          
          return {
            username: user.username as string,
            name: user.name,
            image: user.image,
            assistantCount: assistantCount[0]?.count || 0
          };
        })
    );

    // Sort users by assistant count
    const publicUsers = publicUsersWithCounts.sort((a, b) => (b.assistantCount || 0) - (a.assistantCount || 0));

    // Fetch featured AI assistants (top 6 by message count or most recent if no messages)
    const featuredAssistants = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        name: embeddedChatsTable.name,
        slug: embeddedChatsTable.slug,
        description: embeddedChatsTable.description,
        category: embeddedChatsTable.category,
        pricing_model: embeddedChatsTable.pricing_model,
        location: embeddedChatsTable.location,
        language: embeddedChatsTable.language,
        profession: embeddedChatsTable.profession,
        expertise: embeddedChatsTable.expertise,
        response_time: embeddedChatsTable.response_time,
        capabilities_summary: embeddedChatsTable.capabilities_summary,
        bot_avatar_url: embeddedChatsTable.bot_avatar_url,
        message_count: embeddedChatsTable.message_count,
        username: users.username,
        user_name: users.name,
        user_avatar: users.avatar_url,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(
        and(
          eq(embeddedChatsTable.is_public, true),
          eq(embeddedChatsTable.is_active, true)
        )
      )
      .orderBy(desc(sql`COALESCE(${embeddedChatsTable.message_count}, 0)`))
      .limit(6);

    // Get category statistics - ensure we handle null categories
    const categoryStats = await db
      .select({
        category: embeddedChatsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(embeddedChatsTable)
      .where(
        and(
          eq(embeddedChatsTable.is_public, true),
          eq(embeddedChatsTable.is_active, true),
          isNotNull(embeddedChatsTable.category)
        )
      )
      .groupBy(embeddedChatsTable.category);

    const CATEGORIES: Record<string, { label: string; icon: string }> = {
      technology: { label: 'Technology', icon: '💻' },
      healthcare: { label: 'Healthcare', icon: '🏥' },
      education: { label: 'Education', icon: '📚' },
      finance: { label: 'Finance', icon: '💰' },
      retail: { label: 'Retail', icon: '🛍️' },
      legal: { label: 'Legal', icon: '⚖️' },
      marketing: { label: 'Marketing', icon: '📣' },
      other: { label: 'Other', icon: '🔧' },
    };

    const LANGUAGES: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      zh: 'Chinese',
      hi: 'Hindi',
      fr: 'French',
      de: 'German',
      ja: 'Japanese',
      pt: 'Portuguese',
      tr: 'Turkish',
      nl: 'Dutch',
    };

    const RESPONSE_TIMES: Record<string, string> = {
      instant: 'Instant',
      '1-5min': '< 5 min',
      '15-30min': '< 30 min',
      '1-2hours': '< 2 hrs',
      '24hours': '< 24 hrs',
    };

    return (
      <>
        <LandingNavbar />
        <div className="container py-8 max-w-screen-2xl mx-auto px-4 md:px-8">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Discover AI Assistants & Experts
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Connect with specialized AI assistants created by experts around the world. 
              Find the perfect assistant for your needs or explore expert profiles.
            </p>
          </div>

          {/* Featured AI Assistants */}
          {featuredAssistants && featuredAssistants.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-purple-600" />
                  <h2 className="text-2xl font-bold">Featured AI Assistants</h2>
                </div>
                <Link href="/discover" className="text-blue-600 hover:underline text-sm font-medium">
                  Discover all →
                </Link>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featuredAssistants.map((assistant) => (
                  <Card key={assistant.uuid} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Bot className="h-4 w-4 text-purple-600" />
                            {assistant.name}
                          </CardTitle>
                          {assistant.profession && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {assistant.profession}
                            </p>
                          )}
                        </div>
                        {assistant.pricing_model && (
                          <Badge 
                            variant={assistant.pricing_model === 'free' ? 'secondary' : 'outline'}
                            className="ml-2"
                          >
                            {assistant.pricing_model === 'free' ? 'Free' : 
                             assistant.pricing_model === 'freemium' ? 'Freemium' :
                             'Paid'}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {assistant.capabilities_summary || assistant.description || 'AI assistant ready to help'}
                      </p>

                      {/* Metadata */}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {assistant.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>{assistant.location}</span>
                          </div>
                        )}
                        {assistant.language && assistant.language !== 'en' && (
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            <span>{LANGUAGES[assistant.language] || assistant.language}</span>
                          </div>
                        )}
                        {assistant.response_time && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{RESPONSE_TIMES[assistant.response_time] || assistant.response_time}</span>
                          </div>
                        )}
                      </div>

                      {/* Category and Expertise */}
                      <div className="flex flex-wrap gap-1">
                        {assistant.category && (
                          <Badge variant="secondary" className="text-xs">
                            {CATEGORIES[assistant.category]?.label || assistant.category}
                          </Badge>
                        )}
                        {assistant.expertise && Array.isArray(assistant.expertise) && 
                          assistant.expertise.slice(0, 2).map((exp: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {exp}
                            </Badge>
                          ))}
                      </div>

                      {/* Owner */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <Link 
                          href={`/to/${assistant.username}`}
                          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <span>by @{assistant.username}</span>
                        </Link>
                        <Button 
                          size="sm"
                          variant="outline"
                          asChild
                        >
                          <Link href={assistant.slug ? `/to/${assistant.username}/${assistant.slug}` : `/to/${assistant.username}/chat/${assistant.uuid}`}>
                            <MessageSquare className="h-3 w-3 mr-1" />
                            Chat
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Category Overview */}
          {categoryStats && categoryStats.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Target className="h-6 w-6 text-blue-600" />
                Browse by Category
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {categoryStats
                  .filter(stat => stat.category)
                  .sort((a, b) => b.count - a.count)
                  .map((stat) => {
                    const categoryKey = stat.category || 'other';
                    return (
                      <Link 
                        key={categoryKey} 
                        href={`/discover?category=${categoryKey}`}
                        className="group"
                      >
                        <Card className="hover:shadow-md transition-all hover:scale-105">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-2xl mr-2">
                                  {CATEGORIES[categoryKey]?.icon || '📁'}
                                </span>
                                <p className="font-medium">
                                  {CATEGORIES[categoryKey]?.label || categoryKey}
                                </p>
                              </div>
                              <Badge variant="secondary">{stat.count}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Expert Profiles */}
          <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <User2 className="h-6 w-6 text-green-600" />
              Expert Profiles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {publicUsers && publicUsers.length > 0 ? publicUsers.map((user) => (
                <Link key={user.username} href={`/to/${user.username}`}>
                  <Card className="hover:shadow-md transition-all hover:scale-105">
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center text-center">
                        {user.image ? (
                          <Image
                            src={user.image}
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
                        {user.assistantCount > 0 && (
                          <Badge variant="outline" className="mt-2">
                            <Bot className="h-3 w-3 mr-1" />
                            {user.assistantCount} {user.assistantCount === 1 ? 'Assistant' : 'Assistants'}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )) : (
                <p className="text-muted-foreground col-span-full text-center">No expert profiles available yet.</p>
              )}
            </div>
          </div>
        </div>
      </>
    );
  } catch (error) {
    console.error('Error in ToDirectoryPage:', error);
    
    // Return a simple error page
    return (
      <>
        <LandingNavbar />
        <div className="container py-8 max-w-screen-2xl mx-auto px-4 md:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-muted-foreground">We're having trouble loading this page. Please try again later.</p>
            <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
              Return to home
            </Link>
          </div>
        </div>
      </>
    );
  }
}