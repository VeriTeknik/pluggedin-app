import { users } from '@/db/schema';

/**
 * The `users` table is also the auth table: alongside the profile fields it
 * holds `password`, `two_fa_secret`, `two_fa_backup_codes`, `last_login_ip`
 * and `email`. Selecting the bare table object anywhere that feeds a public
 * surface — a profile, a follower list, a search result — ships those to the
 * client, so every such read goes through the projection below instead.
 *
 * Adding a column here makes it world-readable. Only add profile fields.
 */
export const PUBLIC_USER_COLUMN_NAMES = [
  'id',
  'username',
  'name',
  'bio',
  'avatar_url',
  'image',
  'is_public',
  'created_at',
] as const;

export type PublicUserColumn = (typeof PUBLIC_USER_COLUMN_NAMES)[number];

/** Shape returned by every public-facing user read. */
export type PublicUser = Pick<typeof users.$inferSelect, PublicUserColumn>;

/** For `db.query.users.findFirst({ columns: PUBLIC_USER_COLUMNS })`. */
export const PUBLIC_USER_COLUMNS = {
  id: true,
  username: true,
  name: true,
  bio: true,
  avatar_url: true,
  image: true,
  is_public: true,
  created_at: true,
} as const satisfies Record<PublicUserColumn, true>;

/** For `db.select(publicUserSelection)` on joined queries. */
export const publicUserSelection = {
  id: users.id,
  username: users.username,
  name: users.name,
  bio: users.bio,
  avatar_url: users.avatar_url,
  image: users.image,
  is_public: users.is_public,
  created_at: users.created_at,
};

/**
 * Narrow an already-fetched row. Defence in depth for the paths that cannot
 * push the projection into SQL — the column list above is the primary control.
 */
export function toPublicUser<T extends Partial<PublicUser> | null | undefined>(
  row: T
): T extends null | undefined ? null : PublicUser {
  if (!row) {
    return null as any;
  }

  return {
    id: row.id,
    username: row.username,
    name: row.name,
    bio: row.bio,
    avatar_url: row.avatar_url,
    image: row.image,
    is_public: row.is_public,
    created_at: row.created_at,
  } as any;
}
