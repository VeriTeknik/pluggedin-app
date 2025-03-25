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

import { db } from '@/db';
import { accounts, profilesTable, projectsTable, sessions, users, verificationTokens } from '@/db/schema';

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

// Helper function to create a default project for a user
async function createDefaultProjectForUser(userId: string) {
  try {
    // First verify the user exists in the database
    const userExists = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });
    
    if (!userExists) {
      throw new Error(`User with ID ${userId} does not exist in the database`);
    }
    
    return await db.transaction(async (tx) => {
      // First create the project
      const [project] = await tx
        .insert(projectsTable)
        .values({
          name: 'Default Hub',
          active_profile_uuid: null,
          user_id: userId,
        })
        .returning();

      // Create the profile with the project UUID
      const [profile] = await tx
        .insert(profilesTable)
        .values({
          name: 'Default Workspace',
          project_uuid: project.uuid,
        })
        .returning();

      // Update the project with the correct profile UUID
      const [updatedProject] = await tx
        .update(projectsTable)
        .set({ active_profile_uuid: profile.uuid })
        .where(eq(projectsTable.uuid, project.uuid))
        .returning();

      return updatedProject;
    });
  } catch (error) {
    console.error('Error creating default project for user:', error);
    throw error;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: createCustomAdapter(),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  debug: process.env.NODE_ENV === 'development',
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : undefined
      }
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).hostname : undefined
      }
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
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
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required');
        }

        const user = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, credentials.email),
        });

        if (!user || !user.password) {
          throw new Error('User not found');
        }

        if (!user.emailVerified) {
          throw new Error('Email not verified');
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error('Invalid password');
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
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
          
          // Check if the user has any projects, if not create a default one
          const userProjects = await db
            .select()
            .from(projectsTable)
            .where(eq(projectsTable.user_id, existingUser.id));
          
          if (userProjects.length === 0) {
            try {
              await createDefaultProjectForUser(existingUser.id);
            } catch (projectError) {
              console.error('Failed to create default project for existing user:', projectError);
              // Continue with the sign-in even if project creation fails
            }
          }
        } else if (user.id) {
          // New user from OAuth - don't try to create a project here
          // The adapter will create the user first, then we can create the project 
          // in a subsequent request after the user is fully registered
          console.log('New OAuth user detected - project will be created on first access');
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
        session.user.name = token.name || '';
        session.user.email = token.email || '';
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