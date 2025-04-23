import { sql } from 'drizzle-orm';
import { User2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import CardGrid from '@/app/(sidebar-layout)/(container)/search/components/CardGrid';
import { getTopCommunitySharedServers } from '@/app/actions/shared-content';
import { LandingNavbar } from '@/components/landing-navbar';
import { db } from '@/db';
import { users } from '@/db/schema';

interface PublicUser {
  username: string;
  name: string | null;
  image: string | null;
}

export default async function ToDirectoryPage() {
  // Fetch top 6 public community MCP servers
  const communityServers = await getTopCommunitySharedServers(6);

  const publicUsersRaw = await db
    .select({ username: users.username, name: users.name, image: users.image })
    .from(users)
    .where(sql`${users.is_public} = true AND ${users.username} IS NOT NULL`);

  // Filter out any with null username and cast username as string
  const publicUsers: PublicUser[] = publicUsersRaw
    .filter((user) => user.username !== null)
    .map((user) => ({ ...user, username: user.username as string }));

  return (
    <>
      <LandingNavbar />
      <div className="container py-8 max-w-screen-2xl mx-auto px-4 md:px-8">
        {/* Featured Community MCP Servers */}
        {Object.keys(communityServers).length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Featured Community MCP Servers</h2>
              <Link href="/discover" className="text-blue-600 hover:underline text-sm font-medium">See more</Link>
            </div>
            <CardGrid
              items={communityServers}
              installedServerMap={new Map()}
              currentUsername={null}
            />
          </div>
        )}
        <h1 className="text-3xl font-bold mb-6">Public Profiles</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {publicUsers.map((user) => (
            <Link key={user.username} href={`/to/${user.username}`}>
              <div className="p-4 border rounded hover:shadow flex flex-col items-center">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt={user.name || user.username}
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-full mb-2"
                    unoptimized
                  />
                ) : (
                  <User2 className="w-16 h-16 text-gray-400 mb-2" />
                )}
                <div className="font-semibold">{user.name || user.username}</div>
                <div className="text-sm text-gray-500">@{user.username}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
} 