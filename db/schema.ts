import { relations, sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { locales } from '@/i18n/config';
import type { NotificationMetadata } from '@/lib/types/notifications';

import { enumToPgEnum } from './utils/enum-to-pg-enum';

// Define MCP Message structure for typing JSONB columns
type McpMessageContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

type McpMessage = {
  role: "user" | "assistant" | "system";
  content: McpMessageContent | McpMessageContent[];
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
  STREAMABLE_HTTP = 'STREAMABLE_HTTP',
}

export enum McpServerSource {
  PLUGGEDIN = 'PLUGGEDIN',
  COMMUNITY = 'COMMUNITY',
  REGISTRY = 'REGISTRY',
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

export enum ToggleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export const toggleStatusEnum = pgEnum(
  'toggle_status',
  enumToPgEnum(ToggleStatus)
);

export enum ProfileCapability {
  TOOLS_MANAGEMENT = 'TOOLS_MANAGEMENT',
}
export const profileCapabilityEnum = pgEnum(
  'profile_capability',
  enumToPgEnum(ProfileCapability)
);

// Feature request enums for roadmap
export enum FeatureRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  COMPLETED = 'completed',
  IN_PROGRESS = 'in_progress',
}
export const featureRequestStatusEnum = pgEnum(
  'feature_request_status',
  enumToPgEnum(FeatureRequestStatus)
);

export enum FeatureRequestCategory {
  MCP_SERVERS = 'mcp_servers',
  UI_UX = 'ui_ux',
  PERFORMANCE = 'performance',
  API = 'api',
  SOCIAL = 'social',
  LIBRARY = 'library',
  ANALYTICS = 'analytics',
  SECURITY = 'security',
  MOBILE = 'mobile',
  OTHER = 'other',
}
export const featureRequestCategoryEnum = pgEnum(
  'feature_request_category',
  enumToPgEnum(FeatureRequestCategory)
);

export enum VoteType {
  YES = 'YES',
  NO = 'NO',
}
export const voteTypeEnum = pgEnum(
  'vote_type',
  enumToPgEnum(VoteType)
);

// Blog enums
export enum BlogPostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}
export const blogPostStatusEnum = pgEnum(
  'blog_post_status',
  enumToPgEnum(BlogPostStatus)
);

export enum BlogPostCategory {
  ANNOUNCEMENT = 'announcement',
  TECHNICAL = 'technical',
  PRODUCT = 'product',
  TUTORIAL = 'tutorial',
  CASE_STUDY = 'case-study',
}
export const blogPostCategoryEnum = pgEnum(
  'blog_post_category',
  enumToPgEnum(BlogPostCategory)
);

// Auth.js / NextAuth.js schema
export const users = pgTable('users', {
  id: text('id').notNull().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  password: text('password'),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  username: text('username').unique(),
  // Add social fields to users table
  bio: text('bio'),
  is_public: boolean('is_public').default(false).notNull(),
  language: languageEnum('language').default('en'),
  avatar_url: text('avatar_url'),
  // Security fields
  failed_login_attempts: integer('failed_login_attempts').default(0),
  account_locked_until: timestamp('account_locked_until', { mode: 'date' }),
  last_login_at: timestamp('last_login_at', { mode: 'date' }),
  last_login_ip: text('last_login_ip'),
  password_changed_at: timestamp('password_changed_at', { mode: 'date' }),
  // Admin and 2FA fields
  is_admin: boolean('is_admin').default(false).notNull(),
  requires_2fa: boolean('requires_2fa').default(false).notNull(),
  two_fa_secret: text('two_fa_secret'),
  two_fa_backup_codes: text('two_fa_backup_codes'),
  // Workspace UI visibility flag for gradual deprecation
  show_workspace_ui: boolean('show_workspace_ui').default(false).notNull(),
},
  (table) => ({
    usersUsernameIdx: index('users_username_idx').on(table.username),
    usersEmailIdx: index('users_email_idx').on(table.email),
    usersShowWorkspaceUiIdx: index('users_show_workspace_ui_idx').on(table.show_workspace_ui),
  }));


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
    last_used: timestamp('last_used', { withTimezone: true }),
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
  (table) => ({ // Use object syntax for indexes
    projectsUserIdIdx: index('projects_user_id_idx').on(table.user_id),
  })
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
    language: languageEnum('language').default('en'),
    enabled_capabilities: profileCapabilityEnum('enabled_capabilities')
      .array()
      .notNull()
      .default(sql`'{}'::profile_capability[]`),
    // Removed bio, is_public, avatar_url, language from profiles
  },
  (table) => ({ // Use object syntax for indexes
    profilesProjectUuidIdx: index('profiles_project_uuid_idx').on(table.project_uuid),
  })
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
    relationName: 'activeProfile',
  }),
}));

// Relations for profilesTable
export const profilesRelations = relations(profilesTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [profilesTable.project_uuid],
    references: [projectsTable.uuid],
  }),
  mcpServers: many(mcpServersTable),
  customMcpServers: many(customMcpServersTable),
  docs: many(docsTable),
  playgroundSettings: one(playgroundSettingsTable, {
    fields: [profilesTable.uuid],
    references: [playgroundSettingsTable.profile_uuid],
  }),
  serverInstallations: many(serverInstallationsTable),
  auditLogs: many(auditLogsTable),
  notifications: many(notificationsTable),
  logRetentionPolicies: many(logRetentionPoliciesTable),
  // Removed followers/following relations from profiles
  sharedMcpServers: many(sharedMcpServersTable),
  sharedCollections: many(sharedCollectionsTable),
  embeddedChats: many(embeddedChatsTable),
}));


// Define the foreign key relationship after both tables are defined
export const projectsToProfilesRelation = {
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
  (table) => ({ // Use object syntax for indexes
    codesUserIdIdx: index('codes_user_id_idx').on(table.user_id),
  })
);

export const codesRelations = relations(codesTable, ({ one }) => ({
  user: one(users, {
    fields: [codesTable.user_id],
    references: [users.id],
    relationName: 'codes',
  }),
}));

export const apiKeysTable = pgTable(
  'api_keys',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    project_uuid: uuid('project_uuid')
      .notNull()
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    api_key: text('api_key').notNull().unique(),
    name: text('name').default('API Key'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => ({ // Use object syntax for indexes
    apiKeysProjectUuidIdx: index('api_keys_project_uuid_idx').on(table.project_uuid),
    apiKeysLastUsedAtIdx: index('api_keys_last_used_at_idx').on(table.last_used_at),
  })
);

export const apiKeysRelations = relations(apiKeysTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [apiKeysTable.project_uuid],
    references: [projectsTable.uuid],
    relationName: 'apiKeys',
  }),
}));

export const mcpServersTable = pgTable(
  'mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    type: mcpServerTypeEnum('type').notNull().default(McpServerType.STDIO),
    command: text('command'),
    args: text('args')
      .array(),
    env: jsonb('env')
      .$type<{ [key: string]: string }>(),
    url: text('url'),
    // Encrypted fields
    command_encrypted: text('command_encrypted'),
    args_encrypted: text('args_encrypted'),
    env_encrypted: text('env_encrypted'),
    url_encrypted: text('url_encrypted'),
    transport_encrypted: text('transport_encrypted'),
    streamable_http_options_encrypted: text('streamable_http_options_encrypted'),
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
    notes: text('notes'),
    config: jsonb('config'),
    slug: text('slug'), // URL-friendly identifier for slug-based tool prefixing
    // Registry data preservation (Phase 1)
    registry_data: jsonb('registry_data'), // Complete registry data (no transformation)
    registry_version: text('registry_version'), // Schema version (e.g., "2025-10-17")
    registry_release_date: timestamp('registry_release_date', { withTimezone: true }),
    registry_status: text('registry_status'),
    // Repository information
    repository_url: text('repository_url'),
    repository_source: text('repository_source'),
    repository_id: text('repository_id'),
    // Installation metadata (package isolation)
    install_path: text('install_path'), // e.g., /var/mcp-packages/servers/{uuid}
    install_status: text('install_status'), // 'pending', 'installing', 'completed', 'failed'
    installed_at: timestamp('installed_at', { withTimezone: true }),
    // Encryption salt for this server's sensitive data
    encryption_salt: text('encryption_salt'),
  },
  (table) => ({ // Use object syntax for indexes
    mcpServersStatusIdx: index('mcp_servers_status_idx').on(table.status),
    mcpServersProfileUuidIdx: index('mcp_servers_profile_uuid_idx').on(table.profile_uuid),
    mcpServersTypeIdx: index('mcp_servers_type_idx').on(table.type),
    // Composite index for profile + status queries
    mcpServersProfileStatusIdx: index('idx_mcp_servers_profile_status').on(table.profile_uuid, table.status),
    // Profile-scoped unique constraint for slugs (allows different profiles to use same slug names)
    mcpServersProfileSlugUnique: unique('mcp_servers_profile_slug_unique').on(table.profile_uuid, table.slug),
    // GIN index for registry_data JSONB queries
    mcpServersRegistryDataGinIdx: index('idx_mcp_servers_registry_data_gin').using('gin', sql`${table.registry_data}`),
  })
);

export const mcpServersRelations = relations(mcpServersTable, ({ one, many }) => ({
  profile: one(profilesTable, {
    fields: [mcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  resourceTemplates: many(resourceTemplatesTable),
  serverInstallations: many(serverInstallationsTable),
  auditLogs: many(auditLogsTable),
  tools: many(toolsTable),
  resources: many(resourcesTable),
  prompts: many(promptsTable),
  customInstructions: one(customInstructionsTable, {
    fields: [mcpServersTable.uuid],
    references: [customInstructionsTable.mcp_server_uuid],
  }),
  // Phase 1: MCP Schema Alignment
  remoteHeaders: many(mcpServerRemoteHeadersTable),
  oauthConfig: one(mcpServerOAuthConfigTable, {
    fields: [mcpServersTable.uuid],
    references: [mcpServerOAuthConfigTable.server_uuid],
  }),
  oauthTokens: many(mcpServerOAuthTokensTable),
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
  (table) => ({ // Use object syntax for indexes
    customMcpServersStatusIdx: index('custom_mcp_servers_status_idx').on(table.status),
    customMcpServersProfileUuidIdx: index('custom_mcp_servers_profile_uuid_idx').on(table.profile_uuid),
  })
);

export const customMcpServersRelations = relations(customMcpServersTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [customMcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  code: one(codesTable, {
    fields: [customMcpServersTable.code_uuid],
    references: [codesTable.uuid],
  }),
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().primaryKey(),
  expires: timestamp("expires", { mode: 'date' }).notNull(),
});

export const playgroundSettingsTable = pgTable(
  'playground_settings',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' })
      .unique(),
    provider: text('provider').notNull().default('anthropic'),
    model: text('model').notNull().default('claude-3-7-sonnet-20250219'),
    temperature: integer('temperature').notNull().default(0),
    max_tokens: integer('max_tokens').notNull().default(1000),
    log_level: text('log_level').notNull().default('info'),
    rag_enabled: boolean('rag_enabled').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    playgroundSettingsProfileUuidIdx: index('playground_settings_profile_uuid_idx').on(table.profile_uuid),
  })
);

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
  (table) => ({ // Use object syntax for indexes
    searchCacheSourceQueryIdx: index('search_cache_source_query_idx').on(table.source, table.query),
    searchCacheExpiresAtIdx: index('search_cache_expires_at_idx').on(table.expires_at),
  })
);

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
  (table) => ({ // Use object syntax for indexes
    serverInstallationsServerUuidIdx: index('server_installations_server_uuid_idx').on(table.server_uuid),
    serverInstallationsExternalIdSourceIdx: index('server_installations_external_id_source_idx').on(table.external_id, table.source),
    serverInstallationsProfileUuidIdx: index('server_installations_profile_uuid_idx').on(table.profile_uuid),
    // Composite index for profile + server queries
    serverInstallationsProfileServerIdx: index('idx_server_installations_profile_server').on(table.profile_uuid, table.server_uuid),
  })
);

export const serverInstallationsRelations = relations(serverInstallationsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [serverInstallationsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
  profile: one(profilesTable, {
    fields: [serverInstallationsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

// --- MCP Activity Table ---
// Tracks all MCP server activity for trending calculations
export const mcpActivityTable = pgTable(
  'mcp_activity',
  {
    id: serial('id').primaryKey(),
    profile_uuid: uuid('profile_uuid').notNull(),
    server_uuid: uuid('server_uuid'), // For local servers
    external_id: text('external_id'), // For registry servers
    source: text('source').notNull(), // 'REGISTRY' or 'COMMUNITY'
    action: text('action').notNull(), // 'install', 'uninstall', 'tool_call', 'resource_read', 'prompt_get', 'document_view', 'document_rag_query', 'document_download'
    item_name: text('item_name'), // Name of tool/resource/prompt
    status: text('status').default('success'), // 'success', 'error', or 'timeout'
    error_message: text('error_message'), // Error message for failed activities
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      serverActivityIdx: index('idx_server_activity').on(
        table.server_uuid,
        table.source,
        table.created_at
      ),
      externalActivityIdx: index('idx_external_activity').on(
        table.external_id,
        table.source,
        table.created_at
      ),
      actionTimeIdx: index('idx_action_time').on(
        table.action,
        table.created_at
      ),
      // Analytics query optimization indexes
      profileCreatedIdx: index('idx_profile_created').on(
        table.profile_uuid,
        table.created_at
      ),
      profileActionCreatedIdx: index('idx_profile_action_created').on(
        table.profile_uuid,
        table.action,
        table.created_at
      ),
      // Index for success/failure rate analytics
      profileActionStatusIdx: index('idx_profile_action_status').on(
        table.profile_uuid,
        table.action,
        table.status
      ),
    };
  }
);

export const mcpActivityRelations = relations(mcpActivityTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [mcpActivityTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  mcpServer: one(mcpServersTable, {
    fields: [mcpActivityTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// --- Server Reviews Table ---
export const serverReviews = pgTable(
  'server_reviews',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    server_source: mcpServerSourceEnum('server_source').notNull(),
    server_external_id: text('server_external_id').notNull(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // Assuming 1-5 rating
    comment: text('comment'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    serverReviewsSourceExternalIdIdx: index('server_reviews_source_external_id_idx').on(table.server_source, table.server_external_id),
    serverReviewsUserIdIdx: index('server_reviews_user_id_idx').on(table.user_id),
    // Unique constraint per user per server (identified by source+external_id)
    serverReviewsUniqueUserServerIdx: unique('server_reviews_unique_user_server_idx').on(
      table.user_id,
      table.server_source,
      table.server_external_id
    ),
  })
);

export const serverReviewsRelations = relations(serverReviews, ({ one }) => ({
  user: one(users, {
    fields: [serverReviews.user_id],
    references: [users.id],
  }),
  // Optional: Add relation back to mcpServers if needed, though linking via source/external_id might be sufficient
  // mcpServer: one(mcpServersTable, { ... }) // This would require adding a server_uuid FK potentially
}));


export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  type: text("type").notNull(),
  action: text("action").notNull(),
  request_path: text("request_path"),
  request_method: text("request_method"),
  request_body: jsonb("request_body"),
  response_status: integer("response_status"),
  response_time_ms: integer("response_time_ms"),
  user_agent: text("user_agent"),
  ip_address: text("ip_address"),
  server_uuid: uuid("server_uuid"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata"),
},
  (table) => ({ // Use object syntax for indexes
    auditLogsProfileUuidIdx: index('audit_logs_profile_uuid_idx').on(table.profile_uuid),
    auditLogsTypeIdx: index('audit_logs_type_idx').on(table.type),
    auditLogsCreatedAtIdx: index('audit_logs_created_at_idx').on(table.created_at),
  }));

export const auditLogsRelations = relations(auditLogsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [auditLogsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  mcpServer: one(mcpServersTable, {
    fields: [auditLogsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  link: text("link"),
  severity: text("severity"), // For MCP notifications: INFO, SUCCESS, WARNING, ALERT
  completed: boolean("completed").default(false).notNull(), // For todo-style checkmarks on custom notifications
  metadata: jsonb("metadata").default({}).$type<NotificationMetadata>(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }),
},
  (table) => ({ // Use object syntax for indexes
    notificationsProfileUuidIdx: index('notifications_profile_uuid_idx').on(table.profile_uuid),
    notificationsReadIdx: index('notifications_read_idx').on(table.read),
    notificationsCreatedAtIdx: index('notifications_created_at_idx').on(table.created_at),
    // Composite index for profile + read + created queries
    notificationsProfileReadCreatedIdx: index('idx_notifications_profile_read_created').on(table.profile_uuid, table.read, table.created_at),
  }));

export const notificationsRelations = relations(notificationsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [notificationsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const systemLogsTable = pgTable("system_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  level: text("level").notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
},
  (table) => ({ // Use object syntax for indexes
    systemLogsLevelIdx: index('system_logs_level_idx').on(table.level),
    systemLogsSourceIdx: index('system_logs_source_idx').on(table.source),
    systemLogsCreatedAtIdx: index('system_logs_created_at_idx').on(table.created_at),
  }));

export const logRetentionPoliciesTable = pgTable("log_retention_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  retention_days: integer("retention_days").default(7).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
},
  (table) => ({ // Use object syntax for indexes
    logRetentionPoliciesProfileUuidIdx: index('log_retention_policies_profile_uuid_idx').on(table.profile_uuid),
  }));

export const logRetentionPoliciesRelations = relations(logRetentionPoliciesTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [logRetentionPoliciesTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const toolsTable = pgTable(
  'tools',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    toolSchema: jsonb('tool_schema')
      .$type<{
        type: 'object';
        properties?: Record<string, any>;
        required?: string[];
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
  (table) => ({ // Use object syntax for indexes
    toolsMcpServerUuidIdx: index('tools_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    toolsUniqueToolNamePerServerIdx: unique('tools_unique_tool_name_per_server_idx').on(
      table.mcp_server_uuid,
      table.name
    ),
    toolsStatusIdx: index('tools_status_idx').on(table.status),
  })
);

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
    template_variables: jsonb('template_variables')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    resourceTemplatesMcpServerUuidIdx: index('resource_templates_mcp_server_uuid_idx').on(table.mcp_server_uuid),
  })
);

export const resourceTemplatesRelations = relations(resourceTemplatesTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [resourceTemplatesTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

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
    status: toggleStatusEnum('status').notNull().default(ToggleStatus.ACTIVE),
  },
  (table) => ({ // Use object syntax for indexes
    resourcesMcpServerUuidIdx: index('resources_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    resourcesUniqueUriPerServerIdx: unique('resources_unique_uri_per_server_idx').on(
      table.mcp_server_uuid,
      table.uri
    ),
    resourcesStatusIdx: index('resources_status_idx').on(table.status),
  })
);

export const resourcesRelations = relations(resourcesTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [resourcesTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const toolsRelations = relations(toolsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [toolsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const promptsTable = pgTable(
  'prompts',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    arguments_schema: jsonb('arguments_schema')
      .$type<Array<{ name: string; description?: string; required?: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    promptsMcpServerUuidIdx: index('prompts_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    promptsUniquePromptNamePerServerIdx: unique('prompts_unique_prompt_name_per_server_idx').on(
      table.mcp_server_uuid,
      table.name
    ),
  })
);

export const promptsRelations = relations(promptsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [promptsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const customInstructionsTable = pgTable(
  'custom_instructions',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' })
      .unique(),
    description: text('description').default('Custom instructions for this server'),
    messages: jsonb('messages')
      .$type<McpMessage[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    // Index handled by unique constraint on mcp_server_uuid
  })
);

export const customInstructionsRelations = relations(customInstructionsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [customInstructionsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const docsTable = pgTable(
  'docs',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    project_uuid: uuid('project_uuid')
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    profile_uuid: uuid('profile_uuid')
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    file_name: text('file_name').notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: text('mime_type').notNull(),
    file_path: text('file_path').notNull(),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    rag_document_id: text('rag_document_id'),
    // New fields for AI Document Exchange
    source: text('source').notNull().default('upload'), // 'upload', 'ai_generated', 'api'
    ai_metadata: jsonb('ai_metadata')
      .$type<{
        model?: { name: string; provider: string; version?: string };
        context?: string;
        timestamp?: string;
        sessionId?: string;
        prompt?: string;
        updateReason?: string;
        changesFromPrompt?: string;
        changeSummary?: string;
        conversationContext?: Array<{ role: string; content: string }> | string[];
        sourceDocuments?: string[];
        generationParams?: {
          temperature?: number;
          maxTokens?: number;
          topP?: number;
        };
        visibility?: string;
        [key: string]: any; // Allow any additional fields
      }>(),
    upload_metadata: jsonb('upload_metadata')
      .$type<{
        purpose?: string;
        relatedTo?: string;
        notes?: string;
        uploadMethod?: 'drag-drop' | 'file-picker' | 'api' | 'paste';
        userAgent?: string;
        uploadedAt?: string;
        originalFileName?: string;
        fileLastModified?: string;
      }>(),
    content_hash: text('content_hash'), // For deduplication
    visibility: text('visibility').notNull().default('private'), // 'private', 'workspace', 'public'
    version: integer('version').notNull().default(1),
    parent_document_id: uuid('parent_document_id'), // For version tracking
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    docsUserIdIdx: index('docs_user_id_idx').on(table.user_id),
    docsProjectUuidIdx: index('docs_project_uuid_idx').on(table.project_uuid),
    docsProfileUuidIdx: index('docs_profile_uuid_idx').on(table.profile_uuid),
    docsNameIdx: index('docs_name_idx').on(table.name),
    docsCreatedAtIdx: index('docs_created_at_idx').on(table.created_at),
    // New indexes for AI document features
    docsSourceIdx: index('docs_source_idx').on(table.source),
    docsVisibilityIdx: index('docs_visibility_idx').on(table.visibility),
    docsContentHashIdx: index('docs_content_hash_idx').on(table.content_hash),
    docsParentDocumentIdIdx: index('docs_parent_document_id_idx').on(table.parent_document_id),
  })
);

export const docsRelations = relations(docsTable, ({ one, many }) => ({
  user: one(users, {
    fields: [docsTable.user_id],
    references: [users.id],
  }),
  project: one(projectsTable, {
    fields: [docsTable.project_uuid],
    references: [projectsTable.uuid],
  }),
  profile: one(profilesTable, {
    fields: [docsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  versions: many(documentVersionsTable),
  modelAttributions: many(documentModelAttributionsTable),
}));

// New table for document versions
export const documentVersionsTable = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    document_id: uuid('document_id')
      .notNull()
      .references(() => docsTable.uuid, { onDelete: 'cascade' }),
    version_number: integer('version_number').notNull(),
    content: text('content').notNull(),
    file_path: text('file_path'), // Path to the version file
    is_current: boolean('is_current').default(false), // Whether this is the current version
    rag_document_id: text('rag_document_id'), // RAG ID for this specific version
    content_diff: jsonb('content_diff')
      .$type<{
        additions?: number;
        deletions?: number;
        changes?: Array<{ type: string; content: string }>
      }>(),
    created_by_model: jsonb('created_by_model')
      .$type<{
        name: string;
        provider: string;
        version?: string;
      }>()
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    change_summary: text('change_summary'),
  },
  (table) => ({
    documentVersionsDocumentIdIdx: index('document_versions_document_id_idx').on(table.document_id),
    documentVersionsCompositeIdx: index('document_versions_composite_idx').on(table.document_id, table.version_number),
  })
);

export const documentVersionsRelations = relations(documentVersionsTable, ({ one }) => ({
  document: one(docsTable, {
    fields: [documentVersionsTable.document_id],
    references: [docsTable.uuid],
  }),
}));

// New table for tracking model attributions
export const documentModelAttributionsTable = pgTable(
  'document_model_attributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    document_id: uuid('document_id')
      .notNull()
      .references(() => docsTable.uuid, { onDelete: 'cascade' }),
    model_name: text('model_name').notNull(),
    model_provider: text('model_provider').notNull(),
    contribution_type: text('contribution_type').notNull(), // 'created', 'updated', 'reviewed'
    contribution_timestamp: timestamp('contribution_timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
    contribution_metadata: jsonb('contribution_metadata')
      .$type<{
        version?: string;
        changes_summary?: string;
        tokens_used?: number;
        [key: string]: any;
      }>(),
  },
  (table) => ({
    documentModelAttributionsDocumentIdIdx: index('document_model_attributions_document_id_idx').on(table.document_id),
    documentModelAttributionsModelIdx: index('document_model_attributions_model_idx').on(table.model_name, table.model_provider),
    documentModelAttributionsTimestampIdx: index('document_model_attributions_timestamp_idx').on(table.contribution_timestamp),
  })
);

export const documentModelAttributionsRelations = relations(documentModelAttributionsTable, ({ one }) => ({
  document: one(docsTable, {
    fields: [documentModelAttributionsTable.document_id],
    references: [docsTable.uuid],
  }),
}));

// ===== Clipboard Storage Table =====

export const clipboardsTable = pgTable(
  'clipboards',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    // Named access: clipboard["customer_context"]
    name: varchar('name', { length: 255 }),
    // Indexed access: clipboard[0] - using "idx" to avoid reserved word conflicts
    idx: integer('idx'),
    // Content storage
    value: text('value').notNull(),
    content_type: varchar('content_type', { length: 256 }).notNull().default('text/plain'),
    encoding: varchar('encoding', { length: 20 }).notNull().default('utf-8'),
    size_bytes: integer('size_bytes').notNull(),
    // Visibility: private, workspace, public
    visibility: varchar('visibility', { length: 20 }).notNull().default('private'),
    // Attribution
    created_by_tool: varchar('created_by_tool', { length: 255 }),
    created_by_model: varchar('created_by_model', { length: 255 }),
    // Source: ui (web app), sdk (SDKs), mcp (MCP proxy tools)
    source: varchar('source', { length: 20 }).notNull().default('ui'),
    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    // Index on profile for filtering
    clipboardsProfileUuidIdx: index('clipboards_profile_uuid_idx').on(table.profile_uuid),
    // Index on expiration for cleanup job
    clipboardsExpiresAtIdx: index('clipboards_expires_at_idx').on(table.expires_at),
    // Index on content type for filtering
    clipboardsContentTypeIdx: index('clipboards_content_type_idx').on(table.content_type),
    // Composite index on visibility for filtering shared/public entries
    clipboardsVisibilityIdx: index('clipboards_visibility_idx').on(table.profile_uuid, table.visibility),
    // Unique constraint on (profile_uuid, name) for named entries
    clipboardsProfileNameUniqueIdx: unique('clipboards_profile_name_unique_idx').on(
      table.profile_uuid,
      table.name
    ),
    // Unique constraint on (profile_uuid, idx) for indexed entries
    clipboardsProfileIdxUniqueIdx: unique('clipboards_profile_idx_unique_idx').on(
      table.profile_uuid,
      table.idx
    ),
  })
);

export const clipboardsRelations = relations(clipboardsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [clipboardsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const releaseNotes = pgTable('release_notes', {
  id: serial('id').primaryKey(),
  repository: text('repository').notNull(),
  version: text('version').notNull(),
  releaseDate: timestamp('release_date', { withTimezone: true }).notNull(),
  content: jsonb('content').notNull(),
  commitSha: text('commit_sha').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projectsTable),
  codes: many(codesTable),
  docs: many(docsTable),
  // Add followers/following relations to users
  followers: many(followersTable, { relationName: 'followers' }),
  following: many(followersTable, { relationName: 'following' }),
  // Feature requests and votes
  featureRequestsCreated: many(featureRequestsTable, { relationName: 'featureRequestsCreated' }),
  featureRequestsAccepted: many(featureRequestsTable, { relationName: 'featureRequestsAccepted' }),
  featureVotes: many(featureVotesTable),
}));

export const mcpServersPromptsRelations = relations(mcpServersTable, ({ one, many }) => ({
  prompts: many(promptsTable),
  customInstructions: one(customInstructionsTable, {
    fields: [mcpServersTable.uuid],
    references: [customInstructionsTable.mcp_server_uuid],
  }),
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

// ===== Social Feature Tables =====

export const followersTable = pgTable(
  'followers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    // Change to reference users table
    follower_user_id: text('follower_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followed_user_id: text('followed_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes and update names
    followersFollowerUserIdIdx: index('followers_follower_user_id_idx').on(table.follower_user_id),
    followersFollowedUserIdIdx: index('followers_followed_user_id_idx').on(table.followed_user_id),
    followersUniqueUserRelationshipIdx: unique('followers_unique_user_relationship_idx').on(
      table.follower_user_id,
      table.followed_user_id
    ),
  })
);

export const followersRelations = relations(followersTable, ({ one }) => ({
  // Update relations to point to users table
  followerUser: one(users, {
    fields: [followersTable.follower_user_id],
    references: [users.id],
    relationName: 'following' // User is following others
  }),
  followedUser: one(users, {
    fields: [followersTable.followed_user_id],
    references: [users.id],
    relationName: 'followers' // User is followed by others
  }),
}));

export const sharedMcpServersTable = pgTable(
  'shared_mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    server_uuid: uuid('server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    is_public: boolean('is_public').default(true).notNull(),
    template: jsonb('template')
      .$type<any>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    requires_credentials: boolean('requires_credentials').default(false).notNull(),
    // Claim fields
    is_claimed: boolean('is_claimed').default(false).notNull(),
    claimed_by_user_id: text('claimed_by_user_id')
      .references(() => users.id, { onDelete: 'cascade' }), // GDPR: cascade for complete data deletion
    claimed_at: timestamp('claimed_at', { withTimezone: true }),
    registry_server_uuid: uuid('registry_server_uuid')
      .references(() => registryServersTable.uuid, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    sharedMcpServersProfileUuidIdx: index('shared_mcp_servers_profile_uuid_idx').on(table.profile_uuid),
    sharedMcpServersServerUuidIdx: index('shared_mcp_servers_server_uuid_idx').on(table.server_uuid),
    sharedMcpServersIsPublicIdx: index('shared_mcp_servers_is_public_idx').on(table.is_public),
    sharedMcpServersIsClaimedIdx: index('shared_mcp_servers_is_claimed_idx').on(table.is_claimed),
    sharedMcpServersClaimedByIdx: index('shared_mcp_servers_claimed_by_idx').on(table.claimed_by_user_id),
    // Composite indexes for performance
    sharedMcpServersPublicProfileIdx: index('idx_shared_mcp_servers_public_profile').on(table.is_public, table.profile_uuid),
    sharedMcpServersPublicCreatedIdx: index('idx_shared_mcp_servers_public_created').on(table.is_public, table.created_at),
  })
);

export const sharedMcpServersRelations = relations(sharedMcpServersTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [sharedMcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  server: one(mcpServersTable, {
    fields: [sharedMcpServersTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
  claimedBy: one(users, {
    fields: [sharedMcpServersTable.claimed_by_user_id],
    references: [users.id],
  }),
  registryServer: one(registryServersTable, {
    fields: [sharedMcpServersTable.registry_server_uuid],
    references: [registryServersTable.uuid],
  }),
}));

export const sharedCollectionsTable = pgTable(
  'shared_collections',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    content: jsonb('content').notNull(),
    is_public: boolean('is_public').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    sharedCollectionsProfileUuidIdx: index('shared_collections_profile_uuid_idx').on(table.profile_uuid),
    sharedCollectionsIsPublicIdx: index('shared_collections_is_public_idx').on(table.is_public),
  })
);

export const sharedCollectionsRelations = relations(sharedCollectionsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [sharedCollectionsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const embeddedChatsTable = pgTable(
  'embedded_chats',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    settings: jsonb('settings')
      .$type<{ [key: string]: any }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    is_public: boolean('is_public').default(true).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    embeddedChatsProfileUuidIdx: index('embedded_chats_profile_uuid_idx').on(table.profile_uuid),
    embeddedChatsIsPublicIdx: index('embedded_chats_is_public_idx').on(table.is_public),
    embeddedChatsIsActiveIdx: index('embedded_chats_is_active_idx').on(table.is_active),
  })
);

export const embeddedChatsRelations = relations(embeddedChatsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [embeddedChatsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

// Removed duplicate profilesRelationsWithSocial definition

// ===== Registry Servers Tables =====

export const registryServersTable = pgTable(
  'registry_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    registry_id: text('registry_id').unique(), // Official registry ID when published
    name: text('name').notNull(), // e.g., "io.github.owner/repo"
    github_owner: text('github_owner').notNull(),
    github_repo: text('github_repo').notNull(),
    repository_url: text('repository_url').notNull(),
    description: text('description'),
    is_claimed: boolean('is_claimed').default(false).notNull(),
    is_published: boolean('is_published').default(false).notNull(), // Whether it's in official registry
    claimed_by_user_id: text('claimed_by_user_id')
      .references(() => users.id, { onDelete: 'cascade' }), // GDPR: cascade for complete data deletion
    claimed_at: timestamp('claimed_at', { withTimezone: true }),
    published_at: timestamp('published_at', { withTimezone: true }),
    metadata: jsonb('metadata'), // Full server data
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    registryServersGithubIdx: index('registry_servers_github_idx').on(table.github_owner, table.github_repo),
    registryServersClaimedByIdx: index('registry_servers_claimed_by_idx').on(table.claimed_by_user_id),
    registryServersIsPublishedIdx: index('registry_servers_is_published_idx').on(table.is_published),
  })
);

export const serverClaimRequestsTable = pgTable(
  'server_claim_requests',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    server_uuid: uuid('server_uuid')
      .notNull()
      .references(() => registryServersTable.uuid, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // 'pending', 'approved', 'rejected'
    github_username: text('github_username'), // From OAuth account
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processed_at: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    serverClaimRequestsServerIdx: index('server_claim_requests_server_idx').on(table.server_uuid),
    serverClaimRequestsUserIdx: index('server_claim_requests_user_idx').on(table.user_id),
    serverClaimRequestsStatusIdx: index('server_claim_requests_status_idx').on(table.status),
  })
);

// Relations for registry servers
export const registryServersRelations = relations(registryServersTable, ({ one, many }) => ({
  claimedBy: one(users, {
    fields: [registryServersTable.claimed_by_user_id],
    references: [users.id],
  }),
  claimRequests: many(serverClaimRequestsTable),
}));

export const serverClaimRequestsRelations = relations(serverClaimRequestsTable, ({ one }) => ({
  server: one(registryServersTable, {
    fields: [serverClaimRequestsTable.server_uuid],
    references: [registryServersTable.uuid],
  }),
  user: one(users, {
    fields: [serverClaimRequestsTable.user_id],
    references: [users.id],
  }),
}));

// ===== MCP Sessions Tables (for Streamable HTTP) =====

export const mcpSessionsTable = pgTable(
  'mcp_sessions',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    server_uuid: uuid('server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    session_data: jsonb('session_data').notNull().default({}),
    last_activity: timestamp('last_activity', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true })
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    mcpSessionsServerIdx: index('idx_mcp_sessions_server_uuid').on(table.server_uuid),
    mcpSessionsExpiresIdx: index('idx_mcp_sessions_expires_at').on(table.expires_at),
    mcpSessionsProfileIdx: index('idx_mcp_sessions_profile_uuid').on(table.profile_uuid),
  })
);

export const transportConfigsTable = pgTable(
  'transport_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    server_uuid: uuid('server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    transport_type: varchar('transport_type', { length: 50 }).notNull(),
    config: jsonb('config').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    transportConfigsServerIdx: index('idx_transport_configs_server_uuid').on(table.server_uuid),
  })
);

// Relations for MCP sessions
export const mcpSessionsRelations = relations(mcpSessionsTable, ({ one }) => ({
  server: one(mcpServersTable, {
    fields: [mcpSessionsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
  profile: one(profilesTable, {
    fields: [mcpSessionsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const transportConfigsRelations = relations(transportConfigsTable, ({ one }) => ({
  server: one(mcpServersTable, {
    fields: [transportConfigsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// OAuth sessions table for MCP server OAuth flows
export const mcpOauthSessionsTable = pgTable(
  'mcp_oauth_sessions',
  {
    id: serial('id').primaryKey(),
    state: text('state').notNull().unique(),
    server_uuid: uuid('server_uuid').notNull(),
    profile_uuid: uuid('profile_uuid').notNull(),
    callback_url: text('callback_url').notNull(),
    provider: text('provider').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true })
      .notNull(),
  },
  (table) => ({
    mcpOauthSessionsStateIdx: index('idx_mcp_oauth_sessions_state').on(table.state),
    mcpOauthSessionsExpiresIdx: index('idx_mcp_oauth_sessions_expires_at').on(table.expires_at),
  })
);

// Relations for OAuth sessions
export const mcpOauthSessionsRelations = relations(mcpOauthSessionsTable, ({ one }) => ({
  server: one(mcpServersTable, {
    fields: [mcpOauthSessionsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
  profile: one(profilesTable, {
    fields: [mcpOauthSessionsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

// Registry OAuth sessions table for secure token storage
export const registryOAuthSessions = pgTable(
  'registry_oauth_sessions',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionTokenHash: varchar('session_token_hash', { length: 64 }).notNull().unique(),
    oauthToken: text('oauth_token').notNull(), // Consider encrypting in production
    githubUsername: varchar('github_username', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => ({
    registryOAuthSessionsUserIdx: index('idx_registry_oauth_sessions_user_id').on(table.userId),
    registryOAuthSessionsTokenIdx: index('idx_registry_oauth_sessions_token_hash').on(table.sessionTokenHash),
    registryOAuthSessionsExpiresIdx: index('idx_registry_oauth_sessions_expires_at').on(table.expiresAt),
  })
);

// Relations for registry OAuth sessions
export const registryOAuthSessionsRelations = relations(registryOAuthSessions, ({ one }) => ({
  user: one(users, {
    fields: [registryOAuthSessions.userId],
    references: [users.id],
  }),
}));

// Email tracking table for monitoring email engagement
export const emailTrackingTable = pgTable(
  'email_tracking',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emailType: text('email_type').notNull(), // 'welcome', 'follow_up_2', 'follow_up_5', 'admin_notification'
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    segment: text('segment'), // 'developer', 'business', 'enterprise'
    variant: text('variant'), // For A/B testing (e.g., 'A', 'B')
    subject: text('subject'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    emailTrackingUserIdx: index('idx_email_tracking_user_id').on(table.userId),
    emailTrackingTypeIdx: index('idx_email_tracking_email_type').on(table.emailType),
    emailTrackingSentIdx: index('idx_email_tracking_sent_at').on(table.sentAt),
  })
);

// User email preferences table
export const userEmailPreferencesTable = pgTable(
  'user_email_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    welcomeEmails: boolean('welcome_emails').default(true),
    productUpdates: boolean('product_updates').default(true),
    marketingEmails: boolean('marketing_emails').default(false),
    adminNotifications: boolean('admin_notifications').default(true),
    notificationSeverity: text('notification_severity').default('ALERT,CRITICAL'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

// Scheduled emails table for follow-up automation
export const scheduledEmailsTable = pgTable(
  'scheduled_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emailType: text('email_type').notNull(), // 'follow_up_2', 'follow_up_5', etc.
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    sent: boolean('sent').default(false),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    cancelled: boolean('cancelled').default(false),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    scheduledEmailsScheduledIdx: index('idx_scheduled_emails_scheduled_for')
      .on(table.scheduledFor)
      .where(sql`sent = false AND cancelled = false`),
    scheduledEmailsUserIdx: index('idx_scheduled_emails_user_id').on(table.userId),
  })
);

// Relations for email tracking
export const emailTrackingRelations = relations(emailTrackingTable, ({ one }) => ({
  user: one(users, {
    fields: [emailTrackingTable.userId],
    references: [users.id],
  }),
}));

// Relations for user email preferences
export const userEmailPreferencesRelations = relations(userEmailPreferencesTable, ({ one }) => ({
  user: one(users, {
    fields: [userEmailPreferencesTable.userId],
    references: [users.id],
  }),
}));

// Relations for scheduled emails
export const scheduledEmailsRelations = relations(scheduledEmailsTable, ({ one }) => ({
  user: one(users, {
    fields: [scheduledEmailsTable.userId],
    references: [users.id],
  }),
}));

// Email templates table for admin email management
export const emailTemplatesTable = pgTable(
  'email_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    subject: text('subject').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull().default('other'), // 'product_update', 'feature_announcement', 'newsletter', 'other'
    variables: jsonb('variables').default([]), // List of template variables like ['firstName', 'email']
    isActive: boolean('is_active').default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedBy: text('updated_by')
      .references(() => users.id, { onDelete: 'restrict' }),
    version: integer('version').default(1).notNull(),
    parentId: uuid('parent_id'), // For versioning - reference to parent template
    metadata: jsonb('metadata').default({}), // Additional metadata like usage stats
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailTemplatesCategoryIdx: index('idx_email_templates_category').on(table.category),
    emailTemplatesActiveIdx: index('idx_email_templates_active').on(table.isActive),
    emailTemplatesCreatedByIdx: index('idx_email_templates_created_by').on(table.createdBy),
    emailTemplatesParentIdx: index('idx_email_templates_parent_id').on(table.parentId),
  })
);

// Relations for email templates
export const emailTemplatesRelations = relations(emailTemplatesTable, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [emailTemplatesTable.createdBy],
    references: [users.id],
    relationName: 'emailTemplateCreator',
  }),
  updatedBy: one(users, {
    fields: [emailTemplatesTable.updatedBy],
    references: [users.id],
    relationName: 'emailTemplateUpdater',
  }),
  parent: one(emailTemplatesTable, {
    fields: [emailTemplatesTable.parentId],
    references: [emailTemplatesTable.id],
    relationName: 'templateVersions',
  }),
  versions: many(emailTemplatesTable, {
    relationName: 'templateVersions',
  }),
}));

// Secure unsubscribe tokens table
export const unsubscribeTokensTable = pgTable(
  'unsubscribe_tokens',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    tokenHash: text('token_hash').notNull(), // HMAC hash for verification
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    unsubscribeTokensTokenIdx: index('idx_unsubscribe_tokens_token').on(table.token),
    unsubscribeTokensUserIdx: index('idx_unsubscribe_tokens_user').on(table.userId),
    unsubscribeTokensExpiresIdx: index('idx_unsubscribe_tokens_expires').on(table.expiresAt),
  })
);

// Admin audit log table
export const adminAuditLogTable = pgTable(
  'admin_audit_log',
  {
    id: serial('id').primaryKey(),
    adminId: text('admin_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(), // e.g., 'send_email', 'update_user_role', 'delete_content'
    targetType: text('target_type'), // e.g., 'user', 'email', 'server'
    targetId: text('target_id'), // ID of affected entity
    details: jsonb('details').default({}), // Additional action details
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    adminAuditLogAdminIdx: index('idx_admin_audit_log_admin').on(table.adminId),
    adminAuditLogActionIdx: index('idx_admin_audit_log_action').on(table.action),
    adminAuditLogCreatedIdx: index('idx_admin_audit_log_created').on(table.createdAt),
  })
);

// Relations for unsubscribe tokens
export const unsubscribeTokensRelations = relations(unsubscribeTokensTable, ({ one }) => ({
  user: one(users, {
    fields: [unsubscribeTokensTable.userId],
    references: [users.id],
  }),
}));

// Relations for admin audit log
export const adminAuditLogRelations = relations(adminAuditLogTable, ({ one }) => ({
  admin: one(users, {
    fields: [adminAuditLogTable.adminId],
    references: [users.id],
  }),
}));

// ===== Community Roadmap Tables =====

export const featureRequestsTable = pgTable(
  'feature_requests',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    category: featureRequestCategoryEnum('category').notNull().default(FeatureRequestCategory.OTHER),
    status: featureRequestStatusEnum('status').notNull().default(FeatureRequestStatus.PENDING),
    created_by_user_id: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    accepted_by_admin_id: text('accepted_by_admin_id')
      .references(() => users.id, { onDelete: 'set null' }),
    declined_at: timestamp('declined_at', { withTimezone: true }),
    declined_reason: text('declined_reason'),
    roadmap_priority: integer('roadmap_priority'), // 1-5 for accepted items (1 = highest)
    votes_yes_count: integer('votes_yes_count').notNull().default(0),
    votes_no_count: integer('votes_no_count').notNull().default(0),
    votes_yes_weight: integer('votes_yes_weight').notNull().default(0),
    votes_no_weight: integer('votes_no_weight').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    featureRequestsStatusIdx: index('feature_requests_status_idx').on(table.status),
    featureRequestsCreatedByIdx: index('feature_requests_created_by_idx').on(table.created_by_user_id),
    featureRequestsCategoryIdx: index('feature_requests_category_idx').on(table.category),
    featureRequestsCreatedAtIdx: index('feature_requests_created_at_idx').on(table.created_at),
    featureRequestsStatusCreatedIdx: index('feature_requests_status_created_idx').on(table.status, table.created_at),
    featureRequestsPendingVotesIdx: index('feature_requests_pending_votes_idx')
      .on(table.status, table.votes_yes_weight)
      .where(sql`${table.status} = 'pending'`),
    featureRequestsRoadmapIdx: index('feature_requests_roadmap_idx')
      .on(table.status, table.roadmap_priority)
      .where(sql`${table.status} IN ('accepted', 'in_progress', 'completed')`),
  })
);

export const featureVotesTable = pgTable(
  'feature_votes',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    feature_request_uuid: uuid('feature_request_uuid')
      .notNull()
      .references(() => featureRequestsTable.uuid, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vote: voteTypeEnum('vote').notNull(),
    vote_weight: integer('vote_weight').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    featureVotesFeatureIdx: index('feature_votes_feature_idx').on(table.feature_request_uuid),
    featureVotesUserIdx: index('feature_votes_user_idx').on(table.user_id),
    featureVotesCreatedAtIdx: index('feature_votes_created_at_idx').on(table.created_at),
    featureVotesUniqueUserFeature: unique('feature_votes_unique_user_feature').on(
      table.feature_request_uuid,
      table.user_id
    ),
  })
);

// Relations for feature requests
export const featureRequestsRelations = relations(featureRequestsTable, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [featureRequestsTable.created_by_user_id],
    references: [users.id],
    relationName: 'featureRequestsCreated',
  }),
  acceptedBy: one(users, {
    fields: [featureRequestsTable.accepted_by_admin_id],
    references: [users.id],
    relationName: 'featureRequestsAccepted',
  }),
  votes: many(featureVotesTable),
}));

// Relations for feature votes
export const featureVotesRelations = relations(featureVotesTable, ({ one }) => ({
  featureRequest: one(featureRequestsTable, {
    fields: [featureVotesTable.feature_request_uuid],
    references: [featureRequestsTable.uuid],
  }),
  user: one(users, {
    fields: [featureVotesTable.user_id],
    references: [users.id],
  }),
}));

// ============================================================================
// MCP Schema Alignment Tables (Phase 1)
// ============================================================================

// Remote headers table (OAuth configuration from registry)
export const mcpServerRemoteHeadersTable = pgTable('mcp_server_remote_headers', {
  uuid: uuid('uuid').primaryKey().defaultRandom(),
  server_uuid: uuid('server_uuid')
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
  header_name: text('header_name').notNull(),
  header_value_encrypted: text('header_value_encrypted'), // AES-256-GCM encrypted (if is_secret=true)
  description: text('description'),
  is_required: boolean('is_required').default(false),
  is_secret: boolean('is_secret').default(false),
  default_value: text('default_value'), // Only for non-secret headers
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  serverUuidIdx: index('idx_remote_headers_server_uuid').on(table.server_uuid),
  nameIdx: index('idx_remote_headers_name').on(table.server_uuid, table.header_name),
}));

export const mcpServerRemoteHeadersRelations = relations(mcpServerRemoteHeadersTable, ({ one }) => ({
  server: one(mcpServersTable, {
    fields: [mcpServerRemoteHeadersTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// OAuth configuration table (discovered or manual)
export const mcpServerOAuthConfigTable = pgTable('mcp_server_oauth_config', {
  uuid: uuid('uuid').primaryKey().defaultRandom(),
  server_uuid: uuid('server_uuid')
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
  authorization_endpoint: text('authorization_endpoint').notNull(),
  token_endpoint: text('token_endpoint').notNull(),
  registration_endpoint: text('registration_endpoint'), // For Dynamic Client Registration (RFC7591)
  authorization_server: text('authorization_server').notNull(),
  resource_identifier: text('resource_identifier'), // RFC8707 resource parameter
  client_id: text('client_id'),
  client_secret_encrypted: text('client_secret_encrypted'), // AES-256-GCM encrypted
  scopes: text('scopes').array(),
  supports_pkce: boolean('supports_pkce').default(true),
  discovery_method: text('discovery_method'), // 'rfc9728', 'www-authenticate', 'manual'
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  serverUuidIdx: index('idx_oauth_config_server_uuid').on(table.server_uuid),
  serverUuidUnique: unique('mcp_server_oauth_config_server_uuid_unique').on(table.server_uuid),
}));

export const mcpServerOAuthConfigRelations = relations(mcpServerOAuthConfigTable, ({ one }) => ({
  server: one(mcpServersTable, {
    fields: [mcpServerOAuthConfigTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// OAuth tokens table (encrypted storage)
export const mcpServerOAuthTokensTable = pgTable('mcp_server_oauth_tokens', {
  uuid: uuid('uuid').primaryKey().defaultRandom(),
  server_uuid: uuid('server_uuid')
    .notNull()
    .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
  access_token_encrypted: text('access_token_encrypted').notNull(), // AES-256-GCM encrypted
  refresh_token_encrypted: text('refresh_token_encrypted'), // AES-256-GCM encrypted
  token_type: text('token_type').default('Bearer'),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  scopes: text('scopes').array(),
  refresh_token_used_at: timestamp('refresh_token_used_at', { withTimezone: true }), // OAuth 2.1: Track refresh token usage for rotation
  refresh_token_locked_at: timestamp('refresh_token_locked_at', { withTimezone: true }), // Atomic lock for refresh operations
  version: integer('version').notNull().default(1), // Optimistic locking to prevent race conditions
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  serverUuidIdx: index('idx_oauth_tokens_server_uuid').on(table.server_uuid),
  expiresAtIdx: index('idx_oauth_tokens_expires_at').on(table.expires_at),
  // P0 Performance: Composite index for efficient expiration checks per server
  serverExpiresIdx: index('idx_oauth_tokens_server_expires').on(table.server_uuid, table.expires_at),
  serverUuidUnique: unique('mcp_server_oauth_tokens_server_uuid_unique').on(table.server_uuid), // P0 Security: One token per server
}));

export const mcpServerOAuthTokensRelations = relations(mcpServerOAuthTokensTable, ({ one }) => ({
  server: one(mcpServersTable, {
    fields: [mcpServerOAuthTokensTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

// MCP Telemetry table (privacy-preserving observability)
export const mcpTelemetryTable = pgTable('mcp_telemetry', {
  uuid: uuid('uuid').primaryKey().defaultRandom(),
  event_name: text('event_name').notNull(),
  event_data: jsonb('event_data')
    .$type<{
      event: string;
      server_id?: string;
      workspace_id_hash?: string;
      install_id?: string;
      transport?: string;
      saw_mcp_protocol_version_header?: boolean;
      saw_mcp_session_id_header?: boolean;
      saw_www_authenticate_header?: boolean;
      status_class?: string;
      content_type?: string;
      retry_count?: number;
      page_count?: number;
      tool_count?: number;
      resource_count?: number;
      prompt_count?: number;
      latency_ms?: number;
      duration_ms?: number;
      error?: {
        kind: string;
        rpc_code?: number;
      };
    }>()
    .notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventNameIdx: index('idx_telemetry_event_name').on(table.event_name),
  createdAtIdx: index('idx_telemetry_created_at').on(table.created_at),
}));

// Data Integrity Traces (DEVELOPMENT ONLY)
export const dataIntegrityTracesTable = pgTable('data_integrity_traces', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  trace_id: uuid('trace_id').notNull(),
  hop: text('hop').notNull(), // 'registry', 'registry-proxy', 'app-receive', 'app-transform', 'app-persist', 'database', 'integrity_report'
  server_name: text('server_name'),
  server_uuid: uuid('server_uuid'),
  event_data: jsonb('event_data')
    .$type<{
      trace_id: string;
      hop: string;
      timestamp: string;
      server_name: string;
      checksum_full?: string;
      checksum_remotes?: string;
      checksum_headers?: string;
      checksum_packages?: string;
      counts?: {
        remotes: number;
        headers_total: number;
        headers_required: number;
        headers_secret: number;
        headers_with_default: number;
        packages: number;
        package_args?: number;
        runtime_args?: number;
        env_vars?: number;
      };
      sample?: any; // Development only
      diff?: {
        checksum_match: boolean;
        fields_added?: string[];
        fields_removed?: string[];
        count_changes?: Record<string, { before: number; after: number }>;
      };
      [key: string]: any; // Allow additional fields
    }>()
    .notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  traceIdIdx: index('idx_data_integrity_traces_trace_id').on(table.trace_id),
  hopIdx: index('idx_data_integrity_traces_hop').on(table.hop),
  timestampIdx: index('idx_data_integrity_traces_timestamp').on(table.timestamp),
  serverUuidIdx: index('idx_data_integrity_traces_server_uuid').on(table.server_uuid),
}));

// Data Integrity Errors (DEVELOPMENT ONLY)
export const dataIntegrityErrorsTable = pgTable('data_integrity_errors', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  error_type: text('error_type').notNull(), // 'DATA_LOSS_DETECTED', 'HEADERS_DROPPED_IN_TRANSFORM', 'NO_HEADERS_PERSISTED', 'DATA_LOSS_END_TO_END'
  trace_id: uuid('trace_id').notNull(),
  server_name: text('server_name'),
  server_uuid: uuid('server_uuid'),
  error_data: jsonb('error_data')
    .$type<{
      trace_id: string;
      server_name?: string;
      server_uuid?: string;
      [key: string]: any;
    }>()
    .notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  errorTypeIdx: index('idx_data_integrity_errors_error_type').on(table.error_type),
  traceIdIdx: index('idx_data_integrity_errors_trace_id').on(table.trace_id),
  createdAtIdx: index('idx_data_integrity_errors_created_at').on(table.created_at),
}));


// OAuth PKCE state storage (temporary, auto-expires after 5 minutes per OAuth 2.1)
export const oauthPkceStatesTable = pgTable('oauth_pkce_states', {
  state: text('state').primaryKey(), // OAuth state parameter
  server_uuid: uuid('server_uuid').notNull().references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
  user_id: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // P0 Security: Bind PKCE state to user
  code_verifier: text('code_verifier').notNull(), // PKCE code verifier
  redirect_uri: text('redirect_uri').notNull(),
  integrity_hash: text('integrity_hash').notNull(), // OAuth 2.1: HMAC binding of state parameters
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(), // Auto-expire after 5 minutes (OAuth 2.1)
}, (table) => ({
  expiresAtIdx: index('idx_oauth_pkce_states_expires_at').on(table.expires_at),
  serverUuidIdx: index('idx_oauth_pkce_states_server_uuid').on(table.server_uuid),
  userIdIdx: index('idx_oauth_pkce_states_user_id').on(table.user_id),
  stateUserIdx: index('idx_oauth_pkce_states_state_user').on(table.state, table.user_id), // Composite for validation query
}));

// Blog posts table - Global marketing blog (no project scoping)
export const blogPostsTable = pgTable(
  'blog_posts',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    author_id: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    status: blogPostStatusEnum('status').notNull().default(BlogPostStatus.DRAFT),
    published_at: timestamp('published_at', { withTimezone: true }),
    category: blogPostCategoryEnum('category').notNull(),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    header_image_url: text('header_image_url'),
    header_image_alt: text('header_image_alt'),
    meta_title: text('meta_title'),
    meta_description: text('meta_description'),
    og_image_url: text('og_image_url'),
    reading_time_minutes: integer('reading_time_minutes'),
    view_count: integer('view_count').notNull().default(0),
    is_featured: boolean('is_featured').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugIdx: index('blog_posts_slug_idx').on(table.slug),
    authorIdx: index('blog_posts_author_idx').on(table.author_id),
    statusIdx: index('blog_posts_status_idx').on(table.status),
    categoryIdx: index('blog_posts_category_idx').on(table.category),
    publishedAtIdx: index('blog_posts_published_at_idx').on(table.published_at),
    featuredIdx: index('blog_posts_featured_idx').on(table.is_featured),
  })
);

// Blog post translations table - Separate table for multi-language support
export const blogPostTranslationsTable = pgTable(
  'blog_post_translations',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    blog_post_uuid: uuid('blog_post_uuid')
      .notNull()
      .references(() => blogPostsTable.uuid, { onDelete: 'cascade' }),
    language: languageEnum('language').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull(),
    content: text('content').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    blogPostIdx: index('blog_post_translations_blog_post_idx').on(table.blog_post_uuid),
    languageIdx: index('blog_post_translations_language_idx').on(table.language),
    blogPostLanguageUnique: unique('blog_post_translations_unique').on(
      table.blog_post_uuid,
      table.language
    ),
  })
);

// Blog relations
export const blogPostsRelations = relations(blogPostsTable, ({ one, many }) => ({
  author: one(users, {
    fields: [blogPostsTable.author_id],
    references: [users.id],
  }),
  translations: many(blogPostTranslationsTable),
}));

export const blogPostTranslationsRelations = relations(blogPostTranslationsTable, ({ one }) => ({
  blogPost: one(blogPostsTable, {
    fields: [blogPostTranslationsTable.blog_post_uuid],
    references: [blogPostsTable.uuid],
  }),
}));

// ============================================================================
// PAP (Plugged.in Agent Protocol) Tables
// ============================================================================
//
// TIMEZONE CONVENTION:
// All timestamps in PAP tables use `WITH TIME ZONE` (timestamptz).
// - Storage: Timestamps stored as UTC internally
// - Display: PostgreSQL converts to client's timezone on retrieval
// - Comparison: Accurate cross-timezone comparisons
// - DST Safety: No ambiguity during daylight saving transitions
//
// Application code should:
// - Use timezone-aware datetime objects (Date with UTC, dayjs, luxon)
// - Store timestamps in UTC or let the database handle conversion
// - Use ISO 8601 format for API responses (e.g., "2024-01-15T10:30:00Z")
// ============================================================================

// PAP Agent State Enum - Normative lifecycle states per PAP-RFC-001 v1.0
export enum AgentState {
  NEW = 'NEW',                     // Initial state, not yet provisioned
  PROVISIONED = 'PROVISIONED',     // Infrastructure ready, not yet active
  ACTIVE = 'ACTIVE',               // Running and accepting requests
  DRAINING = 'DRAINING',           // Gracefully shutting down
  TERMINATED = 'TERMINATED',       // Cleanly shut down
  KILLED = 'KILLED',               // Forcefully terminated by Station
}
export const agentStateEnum = pgEnum(
  'agent_state',
  enumToPgEnum(AgentState)
);

/**
 * PAP Heartbeat Mode Enum - Per PAP-RFC-001 §8.2
 *
 * Heartbeat intervals by mode:
 * - EMERGENCY: 5 seconds (critical operations)
 * - IDLE: 30 seconds (default, normal operation)
 * - SLEEP: 15 minutes (low activity, battery saving)
 *
 * @see HEARTBEAT_INTERVALS for numeric constants (milliseconds)
 */
export enum HeartbeatMode {
  EMERGENCY = 'EMERGENCY',  // 5s interval
  IDLE = 'IDLE',           // 30s interval (default)
  SLEEP = 'SLEEP',         // 15min interval
}

/**
 * Heartbeat interval constants in milliseconds.
 * Use these for application-level timeout calculations.
 */
export const HEARTBEAT_INTERVALS = {
  [HeartbeatMode.EMERGENCY]: 5_000,      // 5 seconds
  [HeartbeatMode.IDLE]: 30_000,          // 30 seconds
  [HeartbeatMode.SLEEP]: 15 * 60_000,    // 15 minutes
} as const;
export const heartbeatModeEnum = pgEnum(
  'heartbeat_mode',
  enumToPgEnum(HeartbeatMode)
);

// PAP Access Level Enum - Agent visibility
export enum AccessLevel {
  PRIVATE = 'PRIVATE',     // Only hub API key can access
  PUBLIC = 'PUBLIC',       // Anyone with URL (link sharing)
}
export const accessLevelEnum = pgEnum(
  'access_level',
  enumToPgEnum(AccessLevel)
);

// PAP Deployment Status Enum
export enum DeploymentStatus {
  PENDING = 'PENDING',       // Waiting to be deployed
  DEPLOYING = 'DEPLOYING',   // Deployment in progress
  RUNNING = 'RUNNING',       // Successfully deployed and running
  FAILED = 'FAILED',         // Deployment failed
  STOPPED = 'STOPPED',       // Manually stopped
}
export const deploymentStatusEnum = pgEnum(
  'deployment_status',
  enumToPgEnum(DeploymentStatus)
);

// ============================================================================
// Agent Marketplace Tables
// ============================================================================

// Agent Templates - Marketplace catalog
export const agentTemplatesTable = pgTable(
  'agent_templates',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),

    // Identity (namespace/name pattern like npm/docker)
    namespace: text('namespace').notNull(),        // 'veriteknik'
    name: text('name').notNull(),                  // 'compass'
    version: text('version').notNull(),            // '1.0.0'

    // Display
    display_name: text('display_name').notNull(),  // 'Compass - AI Jury'
    description: text('description'),              // Short description
    long_description: text('long_description'),    // Markdown content
    icon_url: text('icon_url'),
    banner_url: text('banner_url'),

    // Technical
    docker_image: text('docker_image').notNull(),  // 'ghcr.io/veriteknik/compass-agent:v1.0.0'
    container_port: integer('container_port').default(3000),
    health_endpoint: text('health_endpoint').default('/health'),
    env_schema: jsonb('env_schema').$type<{
      required?: string[];
      optional?: string[];
      defaults?: Record<string, string>;
    }>(),

    // Template-driven configuration (ADL v0.2)
    configurable: jsonb('configurable').$type<Record<string, any>>().default({}),

    // Metadata
    tags: text('tags').array(),                    // ['ai', 'research', 'consensus']
    category: text('category'),                    // 'research', 'productivity', etc.

    // Publishing
    is_public: boolean('is_public').default(false),
    is_verified: boolean('is_verified').default(false),
    is_featured: boolean('is_featured').default(false),
    publisher_id: text('publisher_id'),            // User ID of publisher
    repository_url: text('repository_url'),        // GitHub repo URL
    documentation_url: text('documentation_url'),

    // Stats
    install_count: integer('install_count').default(0),

    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    namespaceNameVersionUnique: unique('agent_templates_namespace_name_version_unique').on(
      table.namespace,
      table.name,
      table.version
    ),
    namespaceIdx: index('agent_templates_namespace_idx').on(table.namespace),
    categoryIdx: index('agent_templates_category_idx').on(table.category),
    isPublicIdx: index('agent_templates_is_public_idx').on(table.is_public),
  })
);

// Main agents table (agent instances deployed by users)
export const agentsTable = pgTable(
  'agents',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(), // DNS-safe subdomain (e.g., 'oracle', 'my-compass')
    dns_name: text('dns_name').notNull().unique(), // DNS label only (e.g., 'oracle'), full FQDN constructed in Kubernetes
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),

    // Marketplace - Link to template (optional for custom agents)
    template_uuid: uuid('template_uuid')
      .references(() => agentTemplatesTable.uuid, { onDelete: 'set null' }),

    // Access control
    access_level: accessLevelEnum('access_level').notNull().default(AccessLevel.PRIVATE),

    // PAP State
    state: agentStateEnum('state').notNull().default(AgentState.NEW),
    heartbeat_mode: heartbeatModeEnum('heartbeat_mode').notNull().default(HeartbeatMode.IDLE),
    deployment_status: deploymentStatusEnum('deployment_status').notNull().default(DeploymentStatus.PENDING),

    // Kubernetes
    kubernetes_namespace: text('kubernetes_namespace').default('agents'),
    kubernetes_deployment: text('kubernetes_deployment'), // Deployment name in K8s

    // Model Router assignment
    model_router_service_uuid: uuid('model_router_service_uuid')
      .references(() => modelRouterServicesTable.uuid, { onDelete: 'set null' }),
    model_router_token: text('model_router_token'), // JWT token for model router auth
    model_router_token_issued_at: timestamp('model_router_token_issued_at', { withTimezone: true }),
    model_router_token_revoked: boolean('model_router_token_revoked').default(false),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    provisioned_at: timestamp('provisioned_at', { withTimezone: true }),
    activated_at: timestamp('activated_at', { withTimezone: true }),
    terminated_at: timestamp('terminated_at', { withTimezone: true }),
    last_heartbeat_at: timestamp('last_heartbeat_at', { withTimezone: true }),

    // Metadata
    metadata: jsonb('metadata').$type<{
      description?: string;
      image?: string; // Container image (overrides template if set)
      resources?: {
        cpu_request?: string;
        memory_request?: string;
        cpu_limit?: string;
        memory_limit?: string;
      };
      env_overrides?: Record<string, string>; // Custom env vars
      [key: string]: any;
    }>(),

    // Template configuration values (user's selections from template.configurable)
    config_values: jsonb('config_values').$type<Record<string, any>>().default({}),
  },
  (table) => ({
    profileUuidIdx: index('agents_profile_uuid_idx').on(table.profile_uuid),
    templateUuidIdx: index('agents_template_uuid_idx').on(table.template_uuid),
    stateIdx: index('agents_state_idx').on(table.state),
    dnsNameIdx: index('agents_dns_name_idx').on(table.dns_name),
    accessLevelIdx: index('agents_access_level_idx').on(table.access_level),
    deploymentStatusIdx: index('agents_deployment_status_idx').on(table.deployment_status),
    // Index for zombie detection queries (agents with stale heartbeats)
    lastHeartbeatAtIdx: index('agents_last_heartbeat_at_idx').on(table.last_heartbeat_at),
    // Index for model router queries
    modelRouterServiceUuidIdx: index('agents_model_router_service_uuid_idx').on(table.model_router_service_uuid),
  })
);

// Agent heartbeats - CRITICAL: Liveness only, no metrics (PAP Zombie Prevention)
export const agentHeartbeatsTable = pgTable(
  'agent_heartbeats',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    agent_uuid: uuid('agent_uuid')
      .notNull()
      .references(() => agentsTable.uuid, { onDelete: 'cascade' }),
    mode: heartbeatModeEnum('mode').notNull().default(HeartbeatMode.IDLE),
    uptime_seconds: integer('uptime_seconds').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentUuidIdx: index('agent_heartbeats_agent_uuid_idx').on(table.agent_uuid),
    timestampIdx: index('agent_heartbeats_timestamp_idx').on(table.timestamp),
    // Composite index for efficient "heartbeats for agent X in time range" queries
    agentTimestampIdx: index('agent_heartbeats_agent_timestamp_idx').on(table.agent_uuid, table.timestamp),
  })
);

// Agent metrics - Separate from heartbeats per PAP-RFC-001 §8.2
export const agentMetricsTable = pgTable(
  'agent_metrics',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    agent_uuid: uuid('agent_uuid')
      .notNull()
      .references(() => agentsTable.uuid, { onDelete: 'cascade' }),
    cpu_percent: integer('cpu_percent'), // 0-100
    memory_mb: integer('memory_mb'),
    requests_handled: integer('requests_handled'),
    custom_metrics: jsonb('custom_metrics').$type<Record<string, number>>(),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentUuidIdx: index('agent_metrics_agent_uuid_idx').on(table.agent_uuid),
    timestampIdx: index('agent_metrics_timestamp_idx').on(table.timestamp),
    // Composite index for efficient "metrics for agent X in time range" queries
    agentTimestampIdx: index('agent_metrics_agent_timestamp_idx').on(table.agent_uuid, table.timestamp),
  })
);

// Agent lifecycle events - Immutable audit trail
export const agentLifecycleEventsTable = pgTable(
  'agent_lifecycle_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    agent_uuid: uuid('agent_uuid')
      .notNull()
      .references(() => agentsTable.uuid, { onDelete: 'cascade' }),
    event_type: text('event_type').notNull(), // CREATED, PROVISIONED, ACTIVATED, DRAINING, TERMINATED, KILLED, ERROR
    from_state: agentStateEnum('from_state'),
    to_state: agentStateEnum('to_state'),
    metadata: jsonb('metadata').$type<{
      reason?: string;
      triggered_by?: string; // user_id or 'system'
      error_code?: string;
      error_message?: string;
      [key: string]: any;
    }>(),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentUuidIdx: index('agent_lifecycle_events_agent_uuid_idx').on(table.agent_uuid),
    timestampIdx: index('agent_lifecycle_events_timestamp_idx').on(table.timestamp),
    eventTypeIdx: index('agent_lifecycle_events_event_type_idx').on(table.event_type),
    // Composite index for efficient "events for agent X ordered by time" queries
    agentTimestampIdx: index('agent_lifecycle_events_agent_timestamp_idx').on(table.agent_uuid, table.timestamp),
  })
);

/**
 * Agent model assignments - For future implementation
 *
 * NOTE: A partial unique index exists via migration to ensure only ONE model
 * per agent can have is_default=true:
 *   CREATE UNIQUE INDEX "agent_models_one_default_per_agent"
 *   ON "agent_models" ("agent_uuid") WHERE "is_default" = true;
 */
export const agentModelsTable = pgTable(
  'agent_models',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    agent_uuid: uuid('agent_uuid')
      .notNull()
      .references(() => agentsTable.uuid, { onDelete: 'cascade' }),
    model_name: text('model_name').notNull(), // e.g., 'claude-3-sonnet', 'gpt-4'
    model_provider: text('model_provider').notNull(), // e.g., 'anthropic', 'openai'
    // Only one model per agent can be default (enforced by partial unique index)
    is_default: boolean('is_default').default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentUuidIdx: index('agent_models_agent_uuid_idx').on(table.agent_uuid),
    agentModelUnique: unique('agent_models_agent_model_unique').on(
      table.agent_uuid,
      table.model_name,
      table.model_provider
    ),
    // Note: Partial unique index for is_default=true is in migration 0083
  })
);

// Relations for agent templates
export const agentTemplatesRelations = relations(agentTemplatesTable, ({ many }) => ({
  instances: many(agentsTable),
}));

// Relations for agents (instances)
export const agentsRelations = relations(agentsTable, ({ one, many }) => ({
  profile: one(profilesTable, {
    fields: [agentsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  template: one(agentTemplatesTable, {
    fields: [agentsTable.template_uuid],
    references: [agentTemplatesTable.uuid],
  }),
  heartbeats: many(agentHeartbeatsTable),
  metrics: many(agentMetricsTable),
  lifecycleEvents: many(agentLifecycleEventsTable),
  models: many(agentModelsTable),
}));

export const agentHeartbeatsRelations = relations(agentHeartbeatsTable, ({ one }) => ({
  agent: one(agentsTable, {
    fields: [agentHeartbeatsTable.agent_uuid],
    references: [agentsTable.uuid],
  }),
}));

export const agentMetricsRelations = relations(agentMetricsTable, ({ one }) => ({
  agent: one(agentsTable, {
    fields: [agentMetricsTable.agent_uuid],
    references: [agentsTable.uuid],
  }),
}));

export const agentLifecycleEventsRelations = relations(agentLifecycleEventsTable, ({ one }) => ({
  agent: one(agentsTable, {
    fields: [agentLifecycleEventsTable.agent_uuid],
    references: [agentsTable.uuid],
  }),
}));

export const agentModelsRelations = relations(agentModelsTable, ({ one }) => ({
  agent: one(agentsTable, {
    fields: [agentModelsTable.agent_uuid],
    references: [agentsTable.uuid],
  }),
}));

// ============================================================================
// PAP Heartbeat Collector - Cluster and Alert Tables
// ============================================================================

// Cluster status enum for tracking cluster health
export enum ClusterStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}
export const clusterStatusEnum = pgEnum(
  'cluster_status',
  enumToPgEnum(ClusterStatus)
);

// Alert types from collectors
export enum ClusterAlertType {
  AGENT_DEATH = 'AGENT_DEATH',
  EMERGENCY_MODE = 'EMERGENCY_MODE',
  RESTART_DETECTED = 'RESTART_DETECTED',
}
export const clusterAlertTypeEnum = pgEnum(
  'cluster_alert_type',
  enumToPgEnum(ClusterAlertType)
);

/**
 * Alert severity levels for cluster alerts.
 *
 * Uses lowercase values to match standard monitoring conventions
 * (Prometheus, Grafana, PagerDuty, etc.) for easier integration.
 */
export enum AlertSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}
export const alertSeverityEnum = pgEnum(
  'alert_severity',
  enumToPgEnum(AlertSeverity)
);

/**
 * Clusters Table - Registry of PAP Heartbeat Collectors
 *
 * Each cluster has its own local collector that:
 * - Receives heartbeats from agents
 * - Performs local zombie detection
 * - Pushes alerts to central on problems
 */
export const clustersTable = pgTable(
  'clusters',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    // Unique cluster identifier (e.g., 'is.plugged.in', 'prod-us-east')
    cluster_id: text('cluster_id').notNull().unique(),
    // Human-readable name
    name: text('name').notNull(),
    // Description of the cluster
    description: text('description'),
    // Internal collector URL for proxying requests
    collector_url: text('collector_url'),
    // Cluster status
    status: clusterStatusEnum('status').default(ClusterStatus.ACTIVE),
    // Last time an alert was received from this cluster
    last_alert_at: timestamp('last_alert_at', { withTimezone: true }),
    // Last time we successfully communicated with the collector
    last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
    // Total agents tracked by this cluster (updated periodically)
    agent_count: integer('agent_count').default(0),
    // Healthy agents count
    healthy_agent_count: integer('healthy_agent_count').default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clusterIdIdx: index('clusters_cluster_id_idx').on(table.cluster_id),
    statusIdx: index('clusters_status_idx').on(table.status),
  })
);

/**
 * Cluster Alerts Table - Alerts received from collectors
 *
 * Collectors push alerts here when:
 * - An agent dies (missed heartbeat deadline)
 * - An agent enters EMERGENCY mode
 * - An agent restart is detected
 */
export const clusterAlertsTable = pgTable(
  'cluster_alerts',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    // Which cluster sent this alert
    cluster_uuid: uuid('cluster_uuid')
      .references(() => clustersTable.uuid, { onDelete: 'cascade' }),
    // Alert type
    alert_type: clusterAlertTypeEnum('alert_type').notNull(),
    // Which agent this alert is about (FK with SET NULL to preserve alerts after agent deletion)
    agent_uuid: uuid('agent_uuid')
      .references(() => agentsTable.uuid, { onDelete: 'set null' }),
    // Agent name (for display when agent may be deleted)
    agent_name: text('agent_name'),
    // Alert severity
    severity: alertSeverityEnum('severity').notNull(),
    // Additional details (missed intervals, previous mode, etc.)
    details: jsonb('details'),
    // Has the alert been acknowledged?
    acknowledged: boolean('acknowledged').default(false),
    // Who acknowledged it
    acknowledged_by: text('acknowledged_by'),
    acknowledged_at: timestamp('acknowledged_at', { withTimezone: true }),
    // Alert timestamp from collector
    alert_timestamp: timestamp('alert_timestamp', { withTimezone: true }),
    // When we received it
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clusterUuidIdx: index('cluster_alerts_cluster_uuid_idx').on(table.cluster_uuid),
    alertTypeIdx: index('cluster_alerts_alert_type_idx').on(table.alert_type),
    agentUuidIdx: index('cluster_alerts_agent_uuid_idx').on(table.agent_uuid),
    acknowledgedIdx: index('cluster_alerts_acknowledged_idx').on(table.acknowledged),
    createdAtIdx: index('cluster_alerts_created_at_idx').on(table.created_at),
    // Composite index for efficient unacknowledged alerts queries
    clusterAckCreatedIdx: index('cluster_alerts_cluster_ack_created_idx').on(
      table.cluster_uuid,
      table.acknowledged,
      table.created_at
    ),
  })
);

// Relations for clusters
export const clustersRelations = relations(clustersTable, ({ many }) => ({
  alerts: many(clusterAlertsTable),
}));

// Relations for cluster alerts
export const clusterAlertsRelations = relations(clusterAlertsTable, ({ one }) => ({
  cluster: one(clustersTable, {
    fields: [clusterAlertsTable.cluster_uuid],
    references: [clustersTable.uuid],
  }),
}));

// ============================================================================
// AI Models - Model Router Configuration
// ============================================================================

/**
 * AI Model Provider enum
 */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  XAI = 'xai',
  DEEPSEEK = 'deepseek',
}
export const modelProviderEnum = pgEnum(
  'model_provider',
  enumToPgEnum(ModelProvider)
);

/**
 * AI Models Table - Registry of available AI models
 *
 * Stores model configuration including:
 * - Identity and provider
 * - Pricing per million tokens
 * - Capabilities (vision, streaming, function calling)
 * - Admin controls (enable/disable, default selection)
 */
export const aiModelsTable = pgTable(
  'ai_models',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),

    // Identity
    model_id: text('model_id').notNull().unique(), // e.g., "gpt-4o", "claude-opus-4-5-20251101"
    display_name: text('display_name').notNull(), // e.g., "GPT-4o", "Claude Opus 4.5"
    provider: modelProviderEnum('provider').notNull(),

    // Pricing (per 1M tokens in USD)
    // Using real for simplicity; production could use decimal for precision
    input_price: real('input_price').notNull(), // e.g., 2.50 = $2.50 per 1M input tokens
    output_price: real('output_price').notNull(), // e.g., 10.00 = $10.00 per 1M output tokens

    // Capabilities
    context_length: integer('context_length').default(128000),
    supports_streaming: boolean('supports_streaming').default(true),
    supports_vision: boolean('supports_vision').default(false),
    supports_function_calling: boolean('supports_function_calling').default(true),

    // Configuration
    is_enabled: boolean('is_enabled').default(true), // Admin can disable models
    is_default: boolean('is_default').default(false), // Default for new agents
    is_featured: boolean('is_featured').default(false), // Featured models shown first in UI
    sort_order: integer('sort_order').default(0), // UI display order

    // Aliases (for backwards compatibility with older model names)
    aliases: text('aliases').array(), // e.g., ["gpt-4", "chatgpt"]

    // Metadata
    description: text('description'),
    release_date: date('release_date'),
    deprecated_at: timestamp('deprecated_at', { withTimezone: true }),

    // Test status (persisted across page reloads)
    last_test_status: text('last_test_status'), // 'pass' | 'fail' | null
    last_tested_at: timestamp('last_tested_at', { withTimezone: true }),

    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    modelIdIdx: index('ai_models_model_id_idx').on(table.model_id),
    providerIdx: index('ai_models_provider_idx').on(table.provider),
    enabledIdx: index('ai_models_enabled_idx').on(table.is_enabled),
    // Composite index for listing enabled models by provider
    providerEnabledIdx: index('ai_models_provider_enabled_idx').on(
      table.provider,
      table.is_enabled,
      table.sort_order
    ),
  })
);

/**
 * Health Status Enum for Model Router Services
 */
export const serviceHealthStatusEnum = pgEnum('service_health_status', [
  'healthy',
  'unhealthy',
  'degraded',
  'unknown',
]);

/**
 * Model Sync Status Enum
 */
export const modelSyncStatusEnum = pgEnum('model_sync_status', [
  'synced',
  'pending',
  'partial',
  'failed',
]);

/**
 * Model Router Services Table
 *
 * Registry of model router microservices that can handle LLM requests.
 * Services are registered via admin panel, health-checked periodically,
 * and agents are routed to optimal services based on health/latency/load.
 */
export const modelRouterServicesTable = pgTable(
  'model_router_services',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),

    // Identity
    name: text('name').notNull(), // "US East Router", "Vision Router"
    url: text('url').notNull().unique(), // "https://us-east.models.plugged.in"
    region: text('region'), // "us-east", "eu-west", "asia-pacific"

    // Endpoints (configurable per service)
    health_endpoint: text('health_endpoint').default('/health'),
    models_endpoint: text('models_endpoint').default('/v1/models'),
    sync_endpoint: text('sync_endpoint').default('/v1/models/sync'),
    metrics_endpoint: text('metrics_endpoint').default('/metrics'),

    // Capabilities (what the service supports)
    capabilities: text('capabilities').array(), // ['streaming', 'vision', 'function-calling']

    // Authentication
    auth_type: text('auth_type').default('jwt'), // 'jwt', 'api-key', 'mtls'
    auth_secret_name: text('auth_secret_name'), // K8s secret name if api-key auth

    // Health & Performance (updated by background health monitor)
    is_enabled: boolean('is_enabled').default(true),
    health_status: serviceHealthStatusEnum('health_status').default('unknown'),
    last_health_check: timestamp('last_health_check', { withTimezone: true }),
    last_health_error: text('last_health_error'),
    avg_latency_ms: integer('avg_latency_ms'), // Rolling average from health checks
    current_load_percent: integer('current_load_percent'), // From /metrics endpoint
    success_rate_percent: real('success_rate_percent'), // Rolling success rate

    // Routing configuration
    priority: integer('priority').default(100), // Lower = higher priority
    weight: integer('weight').default(100), // For weighted load balancing

    // Model sync state
    last_model_sync: timestamp('last_model_sync', { withTimezone: true }),
    model_sync_status: modelSyncStatusEnum('model_sync_status').default('pending'),

    // Metadata
    description: text('description'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    urlIdx: index('model_router_services_url_idx').on(table.url),
    regionIdx: index('model_router_services_region_idx').on(table.region),
    healthIdx: index('model_router_services_health_idx').on(
      table.is_enabled,
      table.health_status
    ),
    enabledHealthyIdx: index('model_router_services_enabled_healthy_idx').on(
      table.is_enabled,
      table.health_status,
      table.priority
    ),
  })
);

/**
 * Model Service Mappings Table
 *
 * Junction table linking AI models to the router services that support them.
 * Created when models are synced to a service. Used for routing decisions.
 */
export const modelServiceMappingsTable = pgTable(
  'model_service_mappings',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),

    // Foreign keys
    model_uuid: uuid('model_uuid')
      .notNull()
      .references(() => aiModelsTable.uuid, { onDelete: 'cascade' }),
    service_uuid: uuid('service_uuid')
      .notNull()
      .references(() => modelRouterServicesTable.uuid, { onDelete: 'cascade' }),

    // Per-mapping configuration
    is_enabled: boolean('is_enabled').default(true),
    priority: integer('priority').default(100), // Override service priority for this model

    // Stats (per model-service pair, updated on requests)
    requests_total: integer('requests_total').default(0),
    errors_total: integer('errors_total').default(0),
    avg_latency_ms: integer('avg_latency_ms'),

    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    modelIdx: index('model_service_mappings_model_idx').on(table.model_uuid),
    serviceIdx: index('model_service_mappings_service_idx').on(table.service_uuid),
    // Unique constraint: one mapping per model-service pair
    modelServiceUnique: uniqueIndex('model_service_mappings_unique_idx').on(
      table.model_uuid,
      table.service_uuid
    ),
    // For routing queries: find enabled mappings for a model
    routingIdx: index('model_service_mappings_routing_idx').on(
      table.model_uuid,
      table.is_enabled,
      table.priority
    ),
  })
);

// Type exports for new tables
export type ModelRouterService = typeof modelRouterServicesTable.$inferSelect;
export type NewModelRouterService = typeof modelRouterServicesTable.$inferInsert;
export type ModelServiceMapping = typeof modelServiceMappingsTable.$inferSelect;
export type NewModelServiceMapping = typeof modelServiceMappingsTable.$inferInsert;
