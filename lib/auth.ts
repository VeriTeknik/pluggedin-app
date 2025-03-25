import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import EmailProvider from 'next-auth/providers/email';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';

import { db } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens
  }),
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/login',
    verifyRequest: '/verify-request',
    newUser: '/register',
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT ? parseInt(process.env.EMAIL_SERVER_PORT) : 587,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) return false;

      try {
        // Check if user exists with this email
        const existingUser = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, user.email as string),
        });

        if (existingUser) {
          // User exists - check if this OAuth account is already linked
          const linkedAccount = await db.query.accounts.findFirst({
            where: (accounts, { eq, and }) => and(
              eq(accounts.userId, existingUser.id),
              eq(accounts.provider, account?.provider || '')
            ),
          });

          if (!linkedAccount && account) {
            // Link this OAuth account to the existing user
            await db.insert(accounts).values({
              userId: existingUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state: account.session_state,
            });
          }

          // Set the id to the existing user id to ensure we use that account
          user.id = existingUser.id;
        }

        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },
    async session({ token, session }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture;
      }

      return session;
    },
    async jwt({ token, user }) {
      const dbUser = user ? { 
        id: user.id, 
        name: user.name || '', 
        email: user.email || '' 
      } : undefined;

      if (dbUser) {
        token.id = dbUser.id;
        token.name = dbUser.name;
        token.email = dbUser.email;
      }

      return token;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}

// Extend the next-auth types to include user id
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    name: string;
    email: string;
    picture?: string;
  }
} 