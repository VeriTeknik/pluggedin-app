import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { User2 } from 'lucide-react';
import { db } from '@/db';
import { users } from '@/db/schema';

interface PublicUser {
  username: string;
  name: string | null;
  image: string | null;
}

export default async function ToDirectoryPage() {
  const publicUsersRaw = await db
    .select({ username: users.username, name: users.name, image: users.image })
    .from(users)
    .where(sql`${users.is_public} = true AND ${users.username} IS NOT NULL`);

  // Filter out any with null username and cast username as string
  const publicUsers: PublicUser[] = publicUsersRaw
    .filter((user) => user.username !== null)
    .map((user) => ({ ...user, username: user.username as string }));

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Public Profiles</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {publicUsers.map((user) => (
          <Link key={user.username} href={`/to/${user.username}`}>
            <div className="p-4 border rounded hover:shadow flex flex-col items-center">
              {user.image ? (
                <img src={user.image} alt={user.name || user.username} className="w-16 h-16 rounded-full mb-2" />
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
  );
} 