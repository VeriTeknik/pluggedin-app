import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { enumToPgEnum } from './utils/enum-to-pg-enum';

export enum McpServerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUGGESTED = 'SUGGESTED',
  DECLINED = 'DECLINED',
}

export enum McpServerType {
  STDIO = 'STDIO',
  SSE = 'SSE',
}

export const mcpServerStatusEnum = pgEnum(
  'mcp_server_status',
  enumToPgEnum(McpServerStatus)
);

export const mcpServerTypeEnum = pgEnum(
  'mcp_server_type',
  enumToPgEnum(McpServerType)
);

// Auth.js / NextAuth.js schema
export const users = pgTable('users', {
  id: text('id').notNull().primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  password: text('password'),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index('accounts_user_id_idx').on(account.userId),
  })
);

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').notNull().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (session) => ({
    userIdIdx: index('sessions_user_id_idx').on(session.userId),
  })
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({
      columns: [vt.identifier, vt.token],
    }),
  })
);

// Declare tables in an order that avoids circular references
export const projectsTable = pgTable(
  'projects', 
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    active_profile_uuid: uuid('active_profile_uuid'),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('projects_user_id_idx').on(table.user_id)
  ]
);

export const profilesTable = pgTable(
  'profiles',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    project_uuid: uuid('project_uuid')
      .notNull()
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('profiles_project_uuid_idx').on(table.project_uuid)
  ]
);

// Define the foreign key relationship after both tables are defined
// This will be applied in a separate migration
export const projectsToProfilesRelation = {
  // This should be run in a migration after both tables exist
  addActiveProfileForeignKey: () => sql`
    ALTER TABLE "projects" ADD CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk" 
    FOREIGN KEY ("active_profile_uuid") REFERENCES "profiles"("uuid") ON DELETE set null;
  `,
};

export const codesTable = pgTable(
  'codes', 
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    code: text('code').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('codes_user_id_idx').on(table.user_id)
  ]
);

export const apiKeysTable = pgTable(
  'api_keys',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    project_uuid: uuid('project_uuid')
      .notNull()
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    api_key: text('api_key').notNull(),
    name: text('name').default('API Key'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('api_keys_project_uuid_idx').on(table.project_uuid)]
);

export const mcpServersTable = pgTable(
  'mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    type: mcpServerTypeEnum('type').notNull().default(McpServerType.STDIO),
    command: text('command'),
    args: text('args')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    env: jsonb('env')
      .$type<{ [key: string]: string }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    url: text('url'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    status: mcpServerStatusEnum('status')
      .notNull()
      .default(McpServerStatus.ACTIVE),
  },
  (table) => [
    index('mcp_servers_status_idx').on(table.status),
    index('mcp_servers_profile_uuid_idx').on(table.profile_uuid),
    index('mcp_servers_type_idx').on(table.type),
    sql`CONSTRAINT mcp_servers_url_check CHECK (
      (type = 'SSE' AND url IS NOT NULL AND command IS NULL AND url ~ '^https?://[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*(:[0-9]+)?(/[a-zA-Z0-9-._~:/?#\[\]@!$&''()*+,;=]*)?$') OR
      (type = 'STDIO' AND url IS NULL AND command IS NOT NULL)
    )`,
  ]
);

export const customMcpServersTable = pgTable(
  'custom_mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    code_uuid: uuid('code_uuid')
      .notNull()
      .references(() => codesTable.uuid, { onDelete: 'cascade' }),
    additionalArgs: text('additional_args')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    env: jsonb('env')
      .$type<{ [key: string]: string }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    status: mcpServerStatusEnum('status')
      .notNull()
      .default(McpServerStatus.ACTIVE),
  },
  (table) => [
    index('custom_mcp_servers_status_idx').on(table.status),
    index('custom_mcp_servers_profile_uuid_idx').on(table.profile_uuid),
  ]
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: 'date' }).notNull(),
});

// Add playground settings table
export const playgroundSettingsTable = pgTable(
  'playground_settings',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('anthropic'),
    model: text('model').notNull().default('claude-3-7-sonnet-20250219'),
    temperature: integer('temperature').notNull().default(0),
    max_tokens: integer('max_tokens').notNull().default(1000),
    log_level: text('log_level').notNull().default('info'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('playground_settings_profile_uuid_idx').on(table.profile_uuid),
  ]
);
