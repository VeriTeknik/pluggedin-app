import { relations,sql } from 'drizzle-orm'; // Import relations
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial, // Import serial
  text,
  timestamp,
  unique, // Import unique
  uuid,
} from 'drizzle-orm/pg-core';

import { locales } from '@/i18n/config';

import { enumToPgEnum } from './utils/enum-to-pg-enum';

// Define MCP Message structure for typing JSONB columns
// Based on @modelcontextprotocol/sdk/types PromptMessageContent
type McpMessageContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

type McpMessage = {
  role: "user" | "assistant" | "system"; // Added system role
  content: McpMessageContent | McpMessageContent[]; // Allow single or multiple content parts
};


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
 
 // Enum for tool/server active/inactive status
 export enum ToggleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export const toggleStatusEnum = pgEnum(
  'toggle_status',
  enumToPgEnum(ToggleStatus)
);

// Enum for profile capabilities
export enum ProfileCapability {
  TOOLS_MANAGEMENT = 'TOOLS_MANAGEMENT',
  // Add other capabilities here if needed
}
export const profileCapabilityEnum = pgEnum(
  'profile_capability',
  enumToPgEnum(ProfileCapability)
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
    // Add capabilities column
    enabled_capabilities: profileCapabilityEnum('enabled_capabilities')
      .array()
      .notNull()
      .default(sql`'{}'::profile_capability[]`),
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
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }), // Correct foreign key reference
    api_key: text('api_key').notNull(), // Assuming this column should exist based on table name
    name: text('name').default('API Key'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Removed source, external_id, notes columns
  },
  (table) => [
    index('api_keys_project_uuid_idx').on(table.project_uuid),
    unique('api_keys_key_unique_idx').on(table.api_key), // Add unique constraint if desired
  ]
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

// Table for storing discovered tools
export const toolsTable = pgTable(
  'tools',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    toolSchema: jsonb('tool_schema') // Store the inputSchema JSON
      .$type<{
        type: 'object';
        properties?: Record<string, any>;
        required?: string[]; // Add required if needed
      }>()
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    status: toggleStatusEnum('status').notNull().default(ToggleStatus.ACTIVE),
  },
  (table) => [
    index('tools_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    unique('tools_unique_tool_name_per_server_idx').on( // Ensure tool name is unique per server
      table.mcp_server_uuid,
      table.name
    ),
    index('tools_status_idx').on(table.status), // Index status for filtering
  ]
);


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


// Table for storing discovered resources (non-template)
export const resourcesTable = pgTable(
  'resources',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
    name: text('name'),
    description: text('description'),
    mime_type: text('mime_type'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Add status if needed for filtering active/inactive resources
    status: toggleStatusEnum('status').notNull().default(ToggleStatus.ACTIVE), 
  },
  (table) => [
    index('resources_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    unique('resources_unique_uri_per_server_idx').on( // Ensure URI is unique per server
      table.mcp_server_uuid,
      table.uri
    ),
    index('resources_status_idx').on(table.status), // Index status for filtering
  ]
);

// Relations for resourcesTable
export const resourcesRelations = relations(resourcesTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [resourcesTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));


// Relations for toolsTable
export const toolsRelations = relations(toolsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [toolsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// Table for storing discovered prompts
export const promptsTable = pgTable(
  'prompts',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Store arguments schema as JSONB. Matches MCP PromptArgument definition.
    arguments_schema: jsonb('arguments_schema')
      .$type<Array<{ name: string; description?: string; required?: boolean }>>() // Define expected structure
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Note: We don't store the 'messages' here, as those are retrieved dynamically via prompts/get
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('prompts_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    unique('prompts_unique_prompt_name_per_server_idx').on( // Ensure prompt name is unique per server
      table.mcp_server_uuid,
      table.name
    ),
  ]
);

// Relations for promptsTable
export const promptsRelations = relations(promptsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [promptsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// Table for storing server-specific custom instructions (structured like prompts)
// We'll store one instruction set per server for now, using a unique constraint
export const customInstructionsTable = pgTable(
  'custom_instructions',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    // name: text('name').notNull().default('custom_instructions'), // Fixed name for now
    description: text('description').default('Custom instructions for this server'),
    // arguments: jsonb('arguments').$type<Array<{ name: string; description?: string; required?: boolean }>>().notNull().default(sql`'[]'::jsonb`), // Likely no arguments needed
    messages: jsonb('messages')
      .$type<McpMessage[]>() // Use the defined McpMessage type
      .notNull()
      .default(sql`'[]'::jsonb`), // Default to empty message array
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Ensure only one set of instructions per server
    unique('custom_instructions_unique_server_idx').on(table.mcp_server_uuid),
  ]
);

// Relations for customInstructionsTable
export const customInstructionsRelations = relations(customInstructionsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [customInstructionsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// Table for Release Notes
export const releaseNotes = pgTable('release_notes', {
  id: serial('id').primaryKey(),
  repository: text('repository').notNull(), // e.g., 'pluggedin-app' or 'pluggedin-mcp'
  version: text('version').notNull(), // e.g., 'v1.2.0'
  releaseDate: timestamp('release_date', { withTimezone: true }).notNull(),
  content: jsonb('content').notNull(), // Store structured content (features, fixes, etc.)
  commitSha: text('commit_sha').notNull(), // SHA of the commit/tag associated with the release
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Relations for releaseNotes (optional, if needed later)
// export const releaseNotesRelations = relations(releaseNotes, ({ one }) => ({
//   // Example: If releases were linked to a user who published them
//   // publisher: one(users, {
//   //   fields: [releaseNotes.publisherId],
//   //   references: [users.id],
//   // }),
// }));


// Add other relations as needed for users, accounts, sessions etc. if complex queries are used elsewhere
export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projectsTable),
  codes: many(codesTable),
  // Add relation from profiles to prompts if needed (e.g., profile.prompts)
  // prompts: many(promptsTable), // This might require adjusting profile/server relations
}));

// Add relation from mcpServers to prompts
export const mcpServersPromptsRelations = relations(mcpServersTable, ({ many }) => ({
  prompts: many(promptsTable),
  // Add relation from mcpServers to customInstructions
  customInstructions: many(customInstructionsTable), // Changed from one to many, although constrained by unique index for now
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
