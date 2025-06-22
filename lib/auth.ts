import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { compare } from 'bcrypt';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextAuthOptions } from 'next-auth';
import { AdapterUser } from 'next-auth/adapters';
import { getServerSession } from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import TwitterProvider from 'next-auth/providers/twitter';

// Extend the User type to include emailVerified
declare module 'next-auth' {
  interface User {
    emailVerified?: Date | null;
  }
}

import { db } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';

// Custom adapter that extends DrizzleAdapter to ensure IDs are properly generated
const createCustomAdapter = () => {
  const adapter = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens
  });

  return {
    ...adapter,
    createUser: async (userData: Omit<AdapterUser, "id">) => {
      // Ensure user has an ID
      const user = { ...userData, id: randomUUID() };
      
      await db.insert(users).values({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      });
      
      return {
        id: user.id,
        name: user.name || null,
        email: user.email,
        emailVerified: user.emailVerified || null,
        image: user.image || null,
        created_at: new Date(),
        updated_at: new Date(),
      };
    },
  };
};


export const authOptions: NextAuthOptions = {
  adapter: createCustomAdapter(),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === 'development',
  cookies: process.env.NODE_ENV === 'development' 
    ? undefined // Use default cookie options in development
    : {
        sessionToken: {
          name: `__Secure-next-auth.session-token`,
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true,
            domain: process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : undefined
          }
        },
        callbackUrl: {
          name: `__Secure-next-auth.callback-url`,
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true,
            domain: process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : undefined
          }
        },
        csrfToken: {
          name: `__Host-next-auth.csrf-token`,
          options: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: true
          }
        }
      },
  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/login',
    verifyRequest: '/verify-request',
    newUser: '/register',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials: Record<string, string> | undefined) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log('Missing credentials');
            return null;
          }

          const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.email, credentials.email),
          });

          if (!user || !user.password) {
            console.log('User not found or no password');
            return null;
          }

          // Check email verification
          if (!user.emailVerified) {
            console.log('Email not verified');
            return null;
          }

          const isPasswordValid = await compare(credentials.password, user.password);

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            emailVerified: user.emailVerified,
          };
        } catch (error) {
          return null;
        }
      }
    }),
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0",
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
    async signIn({ user, account }) {
      // Allow credential login even if email not verified
      // The authorize function above already handles email verification
      if (account?.provider === 'credentials') {
        return true;
      }

      // For OAuth logins, check email
      if (!user.email) return false;

      try {
        // Check if user exists with this email
        const existingUser = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, user.email as string),
        });

        // If the user exists but this is a new OAuth account,
        // link this new account to the existing user
        if (existingUser) {
          // Check if this provider+providerAccountId combination exists already
          const existingAccount = await db.query.accounts.findFirst({
            where: (accounts, { and, eq }) => and(
              eq(accounts.provider, account?.provider as string),
              eq(accounts.providerAccountId, account?.providerAccountId as string)
            ),
          });

          // If this exact account doesn't exist yet, create it
          if (!existingAccount && account) {
            await db.insert(accounts).values({
              userId: existingUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              refresh_token: account.refresh_token,
              access_token: account.access_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              session_state: account.session_state,
            });
            
            // Update user information if needed
            if (user.image && !existingUser.image) {
              await db.update(users)
                .set({ image: user.image, updated_at: new Date() })
                .where(eq(users.id, existingUser.id));
            }
          }

          // Override the user.id to ensure it matches our database
          user.id = existingUser.id;
        }

        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
    async session({ token, session }) {
      // Ensure session.user exists before assigning properties
      if (!session.user) {
        session.user = {} as any; // Initialize if it doesn't exist (shouldn't happen with JWT strategy)
      }
      
      if (token) {
        // Explicitly assign ID from token, even if session object might already have it
        session.user.id = token.id as string; 
        // console.log(`Session callback: Assigning ID: ${session.user.id}`); // Add logging
        
        // Use nullish coalescing to ensure type compatibility (string | null)
        session.user.name = token.name ?? null; 
        session.user.email = token.email ?? null;
        session.user.image = token.picture ?? null;
        session.user.emailVerified = token.emailVerified; // This should be Date | null
        session.user.username = token.username ?? null;
        // console.log(`Session callback: Assigning username: ${session.user.username}`); // Add logging
      } else {
         console.warn('Session callback: Token is missing!'); // Log if token is missing
      }

      // console.log('Session callback: Returning session:', session); // Log the final session object
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      // Initial sign in or user object available
      if (user) {
        token.id = user.id;
        token.name = user.name ?? null;
        token.email = user.email ?? null;
        token.picture = user.image ?? null;
        token.emailVerified = user.emailVerified;
        
       // Fetch username from DB during initial sign-in
       try {
          const dbUser = await db.query.users.findFirst({
            where: eq(users.id, user.id),
            columns: { username: true }
          });
          // Ensure null is assigned if dbUser or dbUser.username is null/undefined
          token.username = dbUser?.username ?? null;
          // console.log('JWT callback - username fetched:', token.username);
       } catch (error) {
          console.error('Error fetching username in JWT callback:', error);
          token.username = null; // Fallback to null on error
       }
       }
       
       // If update triggered (e.g., user updates profile), refresh username
       // Note: This requires manually triggering an update session call from the frontend
       if (trigger === "update" && session?.username) {
          // Ensure session.username is compatible with token.username (string | null)
          token.username = session.username ?? null; 
       }
       
       // If token exists but username is missing (e.g., old token), try fetching it
       if (token.id && token.username === undefined) { // Check specifically for undefined or null if needed
          try {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, token.id as string),
              columns: { username: true }
            });
            // Ensure null is assigned if dbUser or dbUser.username is null/undefined
            token.username = dbUser?.username ?? null;
            // console.log('JWT callback - username fetched (fallback):', token.username);
          } catch (error) {
            console.error('Error fetching username in JWT callback (fallback):', error);
            token.username = null; // Fallback to null on error
          }
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
      name: string | null; // Match JWT type
      email: string | null; // Match JWT type
      username: string | null; // Consistent type
      image?: string | null; // Match JWT type
      emailVerified?: Date | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    name: string | null;
    email: string | null;
    username: string | null; // Consistent type
    picture?: string | null;
    emailVerified?: Date | null;
  }
}
