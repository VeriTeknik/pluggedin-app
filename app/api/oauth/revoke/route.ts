import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { oauthAccessTokensTable, oauthRefreshTokensTable } from '@/db/schema';
import { revokeFamily } from '@/lib/oauth/grants';
import { hashCredential } from '@/lib/oauth/tokens';

// RFC 7009. Always returns 200, even for an unknown token: telling a caller
// whether a token existed turns this endpoint into an oracle.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({}, { status: 200 });
  }

  const token = String(form.get('token') ?? '');
  if (!token) return NextResponse.json({}, { status: 200 });
  const hash = hashCredential(token);

  const refresh = await db
    .select()
    .from(oauthRefreshTokensTable)
    .where(eq(oauthRefreshTokensTable.token_hash, hash))
    .limit(1);

  if (refresh[0]) {
    // Revoking one refresh token revokes the whole family: the user asked for
    // this connection to end, not for one link in the chain to break.
    await revokeFamily(refresh[0].family_id, 'user_revoked');
  } else {
    await db
      .update(oauthAccessTokensTable)
      .set({ revoked_at: new Date() })
      .where(eq(oauthAccessTokensTable.token_hash, hash));
  }

  return NextResponse.json({}, { status: 200 });
}
