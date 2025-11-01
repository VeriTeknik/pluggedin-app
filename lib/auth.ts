import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { compare } from 'bcrypt';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NextAuthOptions } from 'next-auth';
import { AdapterUser } from 'next-auth/adapters';
import { getServerSession } from 'next-auth/next';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import TwitterProvider from 'next-auth/providers/twitter';

import { notifyAdminsOfNewUser } from './admin-notifications';
import {
  clearFailedLoginAttempts,
  isAccountLocked,
  recordFailedLoginAttempt} from './auth-security';
import { createDefaultProject } from './default-project-creation';
import log from './logger';
import { sendWelcomeEmail } from './welcome-emails';

// Extend the User type to include emailVerified
declare module 'next-auth' {
  interface User {
    emailVerified?: Date | null;
  }
}

// Extend the JWT type to include custom fields
declare module 'next-auth/jwt' {
  interface JWT {
    passwordChangedAt?: number | null;
  }
}

import { db } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';

const USER_REVALIDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Custom adapter that extends DrizzleAdapter to ensure IDs are properly generated
const createCustomAdapter = () => {
  if (process.env.NODE_ENV === 'test') {
    return {
      createUser: async (userData: Omit<AdapterUser, 'id'>) => {
        const id = randomUUID();
        return {
          id,
          name: userData.name || null,
          email: userData.email,
          emailVerified: userData.emailVerified || null,
          image: userData.image || null,
          created_at: new Date(),
          updated_at: new Date(),
        };
      },
    } as any;
  }

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
      async authorize(credentials: Record<string, string> | undefined, request: any) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          // Extract IP and user agent for security tracking
          const ipAddress = request?.headers?.['x-forwarded-for'] || 
                           request?.headers?.['x-real-ip'] || 
                           request?.connection?.remoteAddress || 
                           '127.0.0.1';
          const userAgent = request?.headers?.['user-agent'] || 'Unknown';

          // Check if account is locked
          const isLocked = await isAccountLocked(credentials.email);
          if (isLocked) {
            log.warn('Login attempt on locked account', { 
              email: credentials.email,
              ip: ipAddress 
            });
            return null;
          }

          const user = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.email, credentials.email),
          });

          if (!user || !user.password) {
            // Record failed attempt for non-existent user (security logging)
            await recordFailedLoginAttempt(credentials.email, ipAddress, userAgent);
            return null;
          }

          // Check email verification
          if (!user.emailVerified) {
            log.info('Login attempt with unverified email', { 
              email: credentials.email,
              userId: user.id 
            });
            return null;
          }

          const isPasswordValid = await compare(credentials.password, user.password);

          if (!isPasswordValid) {
            // Record failed login attempt
            const { locked, remainingAttempts: _remainingAttempts } = await recordFailedLoginAttempt(
              credentials.email,
              ipAddress,
              userAgent
            );

            if (locked) {
              log.warn('Account locked due to failed attempts', { 
                email: credentials.email,
                userId: user.id 
              });
            }
            
            return null;
          }

          // Clear failed attempts on successful login
          await clearFailedLoginAttempts(user.id, ipAddress, userAgent);

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            emailVerified: user.emailVerified,
          };
        } catch (error) {
          log.error('Authentication error', error as Error);
          return null;
        }
      }
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
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
      if (!user.email) {
        return false;
      }

      try {
        // Check if user exists with this email
        const existingUser = await db.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, user.email as string),
        });

        // If the user doesn't exist, they will be created by the adapter
        if (!existingUser) {
          // Send notifications for new OAuth user
          // Note: The actual user creation happens after this callback
          // So we schedule the notifications to be sent after a short delay
          setTimeout(async () => {
            // Get the newly created user
            const newUser = await db.query.users.findFirst({
              where: (users, { eq }) => eq(users.email, user.email as string),
            });
            
            if (newUser) {
              // Create default project and workspace for new user
              try {
                const defaultProject = await createDefaultProject(newUser.id);
                log.info('Created default project for new user', {
                  email: newUser.email,
                  projectUuid: defaultProject.uuid,
                  userId: newUser.id,
                });
              } catch (error) {
                log.error('Failed to create default project for new user', error instanceof Error ? error : undefined, {
                  email: newUser.email,
                  userId: newUser.id,
                });
                // Don't fail the sign-in if project creation fails
              }

              // Notify admins about new OAuth signup
              await notifyAdminsOfNewUser({
                name: newUser.name || 'Unknown',
                email: newUser.email,
                id: newUser.id,
                source: account?.provider as 'google' | 'github' | 'twitter',
              });

              // Send welcome email to new OAuth user
              await sendWelcomeEmail({
                name: newUser.name || 'User',
                email: newUser.email,
                signupSource: account?.provider,
                userId: newUser.id,
              });
            }
          }, 1000); // Wait 1 second for user creation to complete
        } else {
          // Update last_used timestamp for existing OAuth account
          if (account?.provider && account?.providerAccountId) {
            await db.update(accounts)
              .set({ last_used: new Date() })
              .where(
                and(
                  eq(accounts.provider, account.provider),
                  eq(accounts.providerAccountId, account.providerAccountId)
                )
              );
          }
          
          // If the user exists but this is a new OAuth account,
          // link this new account to the existing user
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
              last_used: new Date(),
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

        // Use nullish coalescing to ensure type compatibility (string | null)
        session.user.name = token.name ?? null;
        session.user.email = token.email ?? null;
        session.user.image = token.picture ?? null;
        session.user.emailVerified = token.emailVerified; // This should be Date | null
        session.user.username = token.username ?? null;
        session.user.is_admin = token.is_admin ?? false;
        session.user.show_workspace_ui = token.show_workspace_ui ?? false;
      } else {
         console.warn('Session callback: Token is missing!'); // Log if token is missing
      }

      return session;
    },
    async jwt({ token, user, trigger, session }) {
      // Define common user fields to fetch from database
      const userFieldsToFetch = { username: true, is_admin: true, show_workspace_ui: true, password_changed_at: true } as const;

      // Initial sign in or user object available
      if (user) {
        token.id = user.id;
        token.name = user.name ?? null;
       token.email = user.email ?? null;
       token.picture = user.image ?? null;
       token.emailVerified = user.emailVerified;

       // Fetch username, is_admin, show_workspace_ui, and password_changed_at from DB during initial sign-in
       try {
          const dbUser = await db.query.users.findFirst({
            where: eq(users.id, user.id),
            columns: userFieldsToFetch
          });
          // Ensure null is assigned if dbUser or dbUser.username is null/undefined
          token.username = dbUser?.username ?? null;
          token.is_admin = dbUser?.is_admin ?? false;
          token.show_workspace_ui = dbUser?.show_workspace_ui ?? false;
          // Store password change timestamp for session invalidation
          token.passwordChangedAt = dbUser?.password_changed_at?.getTime() ?? null;
       } catch (error) {
          console.error('Error fetching user details in JWT callback:', error);
          token.username = null; // Fallback to null on error
          token.is_admin = false; // Fallback to false on error
          token.show_workspace_ui = false; // Fallback to false on error
          token.passwordChangedAt = null; // Fallback to null on error
       }

       token.userValidationTs = Date.now();
       }

       // If update triggered (e.g., user updates profile), refresh fields
       // Note: This requires manually triggering an update session call from the frontend
       if (trigger === "update") {
          if (session?.username !== undefined) {
            // Ensure session.username is compatible with token.username (string | null)
            token.username = session.username ?? null;
          }
          if (session?.show_workspace_ui !== undefined) {
            token.show_workspace_ui = session.show_workspace_ui ?? false;
          }
       }

       // If token exists but username, is_admin, show_workspace_ui, or passwordChangedAt is missing (e.g., old token), try fetching it
       if (token.id && (token.username === undefined || token.is_admin === undefined || token.show_workspace_ui === undefined || token.passwordChangedAt === undefined)) {
          try {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, token.id as string),
              columns: userFieldsToFetch
            });
            // Ensure null is assigned if dbUser or dbUser.username is null/undefined
            token.username = dbUser?.username ?? null;
            token.is_admin = dbUser?.is_admin ?? false;
            token.show_workspace_ui = dbUser?.show_workspace_ui ?? false;
            token.passwordChangedAt = dbUser?.password_changed_at?.getTime() ?? null;
            token.userValidationTs = Date.now();
          } catch (error) {
            console.error('Error fetching user details in JWT callback (fallback):', error);
            token.username = null; // Fallback to null on error
            token.is_admin = false; // Fallback to false on error
            token.show_workspace_ui = false; // Fallback to false on error
            token.passwordChangedAt = null; // Fallback to null on error
          }
       }

       // Periodically revalidate that the referenced user still exists and password hasn't changed
       if (token.id) {
         const now = Date.now();
         const shouldRevalidateUser =
           !token.userValidationTs ||
           now - token.userValidationTs > USER_REVALIDATE_INTERVAL_MS;

         if (shouldRevalidateUser) {
           try {
             const dbUser = await db.query.users.findFirst({
               where: eq(users.id, token.id as string),
               columns: { id: true, password_changed_at: true },
             });

             if (!dbUser) {
               // User no longer exists - invalidate session
               delete (token as any).id;
               token.name = null;
               token.email = null;
               token.picture = null;
               token.username = null;
               token.emailVerified = null;
               delete (token as any).userValidationTs;
               delete (token as any).passwordChangedAt;
             } else {
               // Check if password was changed after this token was issued
               const dbPasswordChangedAt = dbUser.password_changed_at?.getTime() ?? null;
               const tokenPasswordChangedAt = token.passwordChangedAt as number | null;

               // If password was changed after token was created, invalidate session
               if (dbPasswordChangedAt && tokenPasswordChangedAt && dbPasswordChangedAt > tokenPasswordChangedAt) {
                 console.info('Session invalidated: password changed', { userId: token.id });
                 // Invalidate session by removing user info
                 delete (token as any).id;
                 token.name = null;
                 token.email = null;
                 token.picture = null;
                 token.username = null;
                 token.emailVerified = null;
                 delete (token as any).userValidationTs;
                 delete (token as any).passwordChangedAt;
               }
             }
           } catch (error) {
             // If the check fails, do not break auth flow; keep token as is
             console.error('JWT user existence check failed:', error);
           } finally {
             if (token.id) {
               token.userValidationTs = now;
             }
           }
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
      is_admin?: boolean;
      show_workspace_ui?: boolean;
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
    is_admin?: boolean;
    show_workspace_ui?: boolean;
    userValidationTs?: number;
  }
}
