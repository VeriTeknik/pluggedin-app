import { sql } from 'drizzle-orm';
import { User2, Bot, MessageSquare, Target, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { LandingNavbar } from '@/components/landing-navbar';
import { db } from '@/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// Force dynamic rendering since this page queries the database
export const dynamic = 'force-dynamic';

export default async function ToDirectoryPage() {
  // Simple query for public users
  const publicUsers = await db.execute(sql`
    SELECT u.username, u.name, u.image
    FROM users u
    WHERE u.is_public = true 
    AND u.username IS NOT NULL
    LIMIT 20
  `);

  // Simple query for featured assistants
  const featuredAssistants = await db.execute(sql`
    SELECT 
      ec.uuid,
      ec.name,
      ec.slug,
      ec.description,
      ec.category,
      ec.pricing_model,
      u.username
    FROM embedded_chats ec
    INNER JOIN projects p ON ec.project_uuid = p.uuid
    INNER JOIN users u ON p.user_id = u.id
    WHERE ec.is_public = true 
    AND ec.is_active = true
    ORDER BY ec.created_at DESC
    LIMIT 6
  `);

  // Simple category count
  const categoryStats = await db.execute(sql`
    SELECT 
      category,
      COUNT(*) as count
    FROM embedded_chats
    WHERE is_public = true 
    AND is_active = true
    AND category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
  `);

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
          </p>
        </div>

        {/* Featured AI Assistants */}
        {featuredAssistants.rows.length > 0 && (
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
              {featuredAssistants.rows.map((assistant: any, idx) => (
                <Card key={assistant.uuid || idx} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="h-4 w-4 text-purple-600" />
                      <h3 className="font-semibold">{assistant.name}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {assistant.description || 'AI assistant ready to help'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        by @{assistant.username}
                      </span>
                      {assistant.pricing_model === 'free' && (
                        <Badge variant="secondary">Free</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {categoryStats.rows.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Target className="h-6 w-6 text-blue-600" />
              Browse by Category
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categoryStats.rows.map((stat: any) => (
                <Link 
                  key={stat.category} 
                  href={`/discover?tab=chats&category=${stat.category}`}
                  className="block"
                >
                  <Card className="hover:shadow-md transition-all hover:scale-105 cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium capitalize">{stat.category}</p>
                        <Badge variant="secondary">{stat.count}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
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
            {publicUsers.rows.map((user: any, idx) => (
              <Link key={user.username || idx} href={`/to/${user.username}`}>
                <Card className="hover:shadow-md transition-all">
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
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mb-3">
                          <User2 className="w-8 h-8 text-purple-600" />
                        </div>
                      )}
                      <div className="font-semibold">{user.name || user.username}</div>
                      <div className="text-sm text-gray-500">@{user.username}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}