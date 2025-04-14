import { Users } from 'lucide-react';
import Link from 'next/link';

interface ProfileStatsProps {
  username: string;
  followerCount: number;
  followingCount: number;
}

export function ProfileStats({ username, followerCount, followingCount }: ProfileStatsProps) {
  return (
    <div className="flex space-x-6 mt-4">
      <Link
        href={`/to/${username}/followers`}
        className="flex items-center gap-1.5 hover:text-primary transition-colors"
      >
        <span className="font-semibold">{followerCount}</span>
        <span className="text-muted-foreground">Followers</span>
      </Link>
      
      <Link
        href={`/to/${username}/following`}
        className="flex items-center gap-1.5 hover:text-primary transition-colors"
      >
        <span className="font-semibold">{followingCount}</span>
        <span className="text-muted-foreground">Following</span>
      </Link>
      
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Social</span>
      </div>
    </div>
  );
} 