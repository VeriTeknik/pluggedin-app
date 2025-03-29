import { sql, relations } from 'drizzle-orm'; // Import relations
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
  boolean,
} from 'drizzle-orm/pg-core';

import { locales } from '@/i18n/config';

import { enumToPgEnum } from './utils/enum-to-pg-enum';

export const languageEnum = pgEnum('language', locales);

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

export enum McpServerSource {
  PLUGGEDIN = 'PLUGGEDIN',
  SMITHERY = 'SMITHERY',
  NPM = 'NPM',
  GITHUB = 'GITHUB',
}

export const mcpServerStatusEnum = pgEnum(
  'mcp_server_status',
  enumToPgEnum(McpServerStatus)
);

export const mcpServerTypeEnum = pgEnum(
  'mcp_server_type',
  enumToPgEnum(McpServerType)
);

export const mcpServerSourceEnum = pgEnum(
  'mcp_server_source',
  enumToPgEnum(McpServerSource)
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

// Relations for projectsTable
export const projectsRelations = relations(projectsTable, ({ one, many }) => ({
  user: one(users, {
    fields: [projectsTable.user_id],
    references: [users.id],
  }),
  profiles: many(profilesTable),
  apiKeys: many(apiKeysTable),
  activeProfile: one(profilesTable, {
    fields: [projectsTable.active_profile_uuid],
    references: [profilesTable.uuid],
    relationName: 'activeProfile', // Optional: Define a name if needed
  }),
}));


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
    language: languageEnum('language').default('en'),
  },
  (table) => [
    index('profiles_project_uuid_idx').on(table.project_uuid)
  ]
);

// Relations for profilesTable
export const profilesRelations = relations(profilesTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [profilesTable.project_uuid],
    references: [projectsTable.uuid],
  }),
  mcpServers: many(mcpServersTable),
  customMcpServers: many(customMcpServersTable),
  playgroundSettings: one(playgroundSettingsTable, { // Assuming one-to-one or one-to-many where profile is unique
    fields: [profilesTable.uuid],
    references: [playgroundSettingsTable.profile_uuid],
  }),
  serverInstallations: many(serverInstallationsTable),
  serverRatings: many(serverRatingsTable),
  auditLogs: many(auditLogsTable),
  notifications: many(notificationsTable),
  logRetentionPolicies: many(logRetentionPoliciesTable), // Assuming one profile can have multiple policies over time? Or one-to-one?
}));


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
    source: mcpServerSourceEnum('source')
      .notNull()
      .default(McpServerSource.PLUGGEDIN),
    external_id: text('external_id'),
    notes: text('notes'), // Added notes column
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

// Relations for mcpServersTable
export const mcpServersRelations = relations(mcpServersTable, ({ one, many }) => ({
  profile: one(profilesTable, {
    fields: [mcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  resourceTemplates: many(resourceTemplatesTable),
  serverInstallations: many(serverInstallationsTable),
  serverRatings: many(serverRatingsTable),
  auditLogs: many(auditLogsTable),
}));


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

// Table for caching search results from external sources
export const searchCacheTable = pgTable(
  'search_cache',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    source: mcpServerSourceEnum('source').notNull(),
    query: text('query').notNull(),
    results: jsonb('results').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true })
      .notNull(),
  },
  (table) => [
    index('search_cache_source_query_idx').on(table.source, table.query),
    index('search_cache_expires_at_idx').on(table.expires_at),
  ]
);

// Table for tracking server installations
export const serverInstallationsTable = pgTable(
  'server_installations',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    server_uuid: uuid('server_uuid')
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    external_id: text('external_id'),
    source: mcpServerSourceEnum('source').notNull(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('server_installations_server_uuid_idx').on(table.server_uuid),
    index('server_installations_external_id_source_idx').on(table.external_id, table.source),
    index('server_installations_profile_uuid_idx').on(table.profile_uuid),
  ]
);

// Table for tracking server ratings
export const serverRatingsTable = pgTable(
  'server_ratings',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    server_uuid: uuid('server_uuid')
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    external_id: text('external_id'),
    source: mcpServerSourceEnum('source').notNull(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // 1-5 stars
    comment: text('comment'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('server_ratings_server_uuid_idx').on(table.server_uuid),
    index('server_ratings_external_id_source_idx').on(table.external_id, table.source),
    index('server_ratings_profile_uuid_idx').on(table.profile_uuid),
    // Each user can only rate a server once (by server_uuid or external_id + source)
    index('server_ratings_unique_idx').on(
      table.profile_uuid, 
      table.server_uuid
    ),
    index('server_ratings_unique_external_idx').on(
      table.profile_uuid, 
      table.external_id,
      table.source
    ),
  ]
);

// Audit log tablosu
export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  type: text("type").notNull(), // API_CALL, MCP_REQUEST, AUTH_ACTION, etc.
  action: text("action").notNull(),
  request_path: text("request_path"),
  request_method: text("request_method"),
  request_body: jsonb("request_body"),
  response_status: integer("response_status"),
  response_time_ms: integer("response_time_ms"),
  user_agent: text("user_agent"),
  ip_address: text("ip_address"),
  server_uuid: uuid("server_uuid").references(() => mcpServersTable.uuid),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata"),
},
(table) => [
  index('audit_logs_profile_uuid_idx').on(table.profile_uuid),
  index('audit_logs_type_idx').on(table.type),
  index('audit_logs_created_at_idx').on(table.created_at),
]);

// Notification tablosu
export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  type: text("type").notNull(), // SYSTEM, ALERT, INFO, SUCCESS, WARNING
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  link: text("link"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }),
},
(table) => [
  index('notifications_profile_uuid_idx').on(table.profile_uuid),
  index('notifications_read_idx').on(table.read),
  index('notifications_created_at_idx').on(table.created_at),
]);

// Sistem loglama tablosu
export const systemLogsTable = pgTable("system_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  level: text("level").notNull(), // ERROR, WARN, INFO, DEBUG
  source: text("source").notNull(), // SYSTEM, MCP_SERVER, DATABASE, etc.
  message: text("message").notNull(),
  details: jsonb("details"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
},
(table) => [
  index('system_logs_level_idx').on(table.level),
  index('system_logs_source_idx').on(table.source),
  index('system_logs_created_at_idx').on(table.created_at),
]);

// Log retention policy tablosu
export const logRetentionPoliciesTable = pgTable("log_retention_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  retention_days: integer("retention_days").default(7).notNull(),
  // max_log_size_mb: integer("max_log_size_mb").default(100).notNull(), // Removed unused column
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
},
(table) => [
  index('log_retention_policies_profile_uuid_idx').on(table.profile_uuid),
]);

// Table for storing discovered resource templates
export const resourceTemplatesTable = pgTable(
  'resource_templates',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    uri_template: text('uri_template').notNull(),
    name: text('name'),
    description: text('description'),
    mime_type: text('mime_type'),
    template_variables: jsonb('template_variables') // Store extracted variables as JSON array
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('resource_templates_mcp_server_uuid_idx').on(table.mcp_server_uuid),
  ]
);

// Relations for resourceTemplatesTable
export const resourceTemplatesRelations = relations(resourceTemplatesTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [resourceTemplatesTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// Add other relations as needed for users, accounts, sessions etc. if complex queries are used elsewhere
export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projectsTable),
  codes: many(codesTable),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
