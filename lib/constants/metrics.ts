/**
 * Fallback metrics used when database queries fail
 * These values should match production data and be updated periodically
 */
export const FALLBACK_METRICS = {
  totalUsers: 848, // Production value from /admin/emails
  totalProjects: 900,
  totalServers: 782, // Production value from /search
  newProfiles30d: 135,
  newUsers30d: 123,
} as const;

// Centralized metrics for consistent usage across landing page components
export const PLATFORM_METRICS = {
  TOOLS: {
    value: 7268,
    suffix: '+',
    label: 'Verified Tools',
    shortLabel: 'Verified Tools',
    description: 'Pre-verified with encrypted keys',
    secureText: 'Keys encrypted - no config exposure'
  },
  SERVERS: {
    value: 1500,
    suffix: '+',
    label: 'MCP Servers',
    shortLabel: 'Servers'
  },
  DEVELOPERS: {
    value: FALLBACK_METRICS.totalUsers,
    suffix: '+',
    label: 'Active Users',
    shortLabel: 'Users'
  },
  GROWTH: {
    value: FALLBACK_METRICS.newProfiles30d,
    suffix: '+',
    label: 'New Profiles (30d)',
    shortLabel: 'New'
  },
  API_CALLS: {
    value: 14000,
    suffix: '+',
    label: 'API Calls/Month',
    shortLabel: 'API Calls',
    formatted: '14K+'
  },
  PROJECTS: {
    value: 900,
    suffix: '+',
    label: 'Active Projects',
    shortLabel: 'Projects'
  },
  UPTIME: {
    value: 99.9,
    suffix: '%',
    label: 'Uptime SLA',
    shortLabel: 'Uptime',
    decimals: 1
  },
  RESPONSE_TIME: {
    value: 100,
    suffix: 'ms',
    label: 'Response Time',
    shortLabel: 'Response',
    prefix: '<'
  },
  AI_DOCUMENTS: {
    value: 87,
    suffix: '+',
    label: 'AI Documents',
    shortLabel: 'Documents'
  },
  ACTIVE_SERVERS: {
    value: 2525,
    suffix: '+',
    label: 'Configured Servers',
    shortLabel: 'Configured'
  },
  // PAP Protocol Metrics
  PAP_LATENCY: {
    value: 50,
    suffix: 'ms',
    label: 'Control Plane Latency',
    shortLabel: 'PAP Latency',
    prefix: '<',
    description: 'Sub-50ms control plane latency for PAP protocol'
  },
  PAP_REQUESTS_PER_SECOND: {
    value: 10000,
    suffix: '+',
    label: 'Requests/Second Capacity',
    shortLabel: 'RPS',
    formatted: '10K+',
    description: 'PAP protocol capacity under load'
  },
  CHAOS_UPTIME: {
    value: 99.9,
    suffix: '%',
    label: 'Uptime Under Chaos Testing',
    shortLabel: 'Chaos Uptime',
    decimals: 1,
    description: '99.9% availability under chaos testing'
  },
  TOKEN_EFFICIENCY: {
    value: 45,
    suffix: '%',
    label: 'Token Efficiency Improvement',
    shortLabel: 'Efficiency',
    description: '30-55% token efficiency vs. typical MCP proxies'
  },
  RAG_SEARCH_TIME: {
    value: 1,
    suffix: 's',
    label: 'Semantic Search Time',
    shortLabel: 'Search Time',
    prefix: '<',
    description: 'Sub-second semantic search in RAG v2'
  },
  ACADEMIC_PAPERS: {
    value: 1,
    label: 'Academic Papers',
    shortLabel: 'Papers',
    description: 'PAP protocol academic publication'
  },
  ACTIVE_USERS: {
    value: FALLBACK_METRICS.totalUsers,
    suffix: '+',
    label: 'Active Users',
    shortLabel: 'Users',
    description: 'Active users on the platform'
  },
  NEW_USERS_30D: {
    value: FALLBACK_METRICS.newUsers30d,
    suffix: '+',
    label: 'New Users (30d)',
    shortLabel: 'New Users',
    description: 'New users in the last 30 days'
  }
} as const;

// Formatted strings for consistent text usage
export const METRIC_STRINGS = {
  TOOLS: `${PLATFORM_METRICS.TOOLS.value.toLocaleString()}${PLATFORM_METRICS.TOOLS.suffix} verified tools`,
  TOOLS_SECURE: `${PLATFORM_METRICS.TOOLS.value.toLocaleString()}${PLATFORM_METRICS.TOOLS.suffix} verified tools with encrypted keys`,
  SERVERS: `${PLATFORM_METRICS.SERVERS.value.toLocaleString()}${PLATFORM_METRICS.SERVERS.suffix} MCP servers`,
  DEVELOPERS: `${PLATFORM_METRICS.DEVELOPERS.value}${PLATFORM_METRICS.DEVELOPERS.suffix} developers`,
  GROWTH: `${PLATFORM_METRICS.GROWTH.value}${PLATFORM_METRICS.GROWTH.suffix} monthly growth`,
  API_CALLS: '14K+ API calls/month',
  PROJECTS: `${PLATFORM_METRICS.PROJECTS.value}${PLATFORM_METRICS.PROJECTS.suffix} projects`,
  RESPONSE_TIME: '<100ms response time',
  UPTIME: `${PLATFORM_METRICS.UPTIME.value}${PLATFORM_METRICS.UPTIME.suffix} uptime`,
  GROWTH_STORY: 'From 0 to 14,000+ API calls in 30 days',
  PAP_LATENCY: '<50ms control plane latency',
  PAP_RPS: '10,000+ requests/second',
  CHAOS_UPTIME: '99.9% uptime under chaos testing',
  TOKEN_EFFICIENCY: '30-55% token efficiency improvement',
  RAG_SEARCH: 'Sub-second semantic search',
  ACTIVE_USERS: '500+ active users'
} as const;

// Common metric combinations for sections
export const METRIC_GROUPS = {
  HERO_STATS: [
    PLATFORM_METRICS.TOOLS,
    PLATFORM_METRICS.SERVERS,
    PLATFORM_METRICS.UPTIME,
    PLATFORM_METRICS.RESPONSE_TIME
  ],
  TRUST_STATS: [
    PLATFORM_METRICS.GROWTH,
    PLATFORM_METRICS.TOOLS,
    PLATFORM_METRICS.SERVERS,
    PLATFORM_METRICS.DEVELOPERS
  ],
  COMMUNITY_STATS: [
    PLATFORM_METRICS.DEVELOPERS,
    PLATFORM_METRICS.PROJECTS,
    PLATFORM_METRICS.ACTIVE_SERVERS,
    PLATFORM_METRICS.AI_DOCUMENTS
  ],
  PERFORMANCE_STATS: [
    PLATFORM_METRICS.UPTIME,
    PLATFORM_METRICS.RESPONSE_TIME,
    PLATFORM_METRICS.API_CALLS,
    PLATFORM_METRICS.GROWTH
  ],
  PAP_STATS: [
    PLATFORM_METRICS.PAP_LATENCY,
    PLATFORM_METRICS.PAP_REQUESTS_PER_SECOND,
    PLATFORM_METRICS.CHAOS_UPTIME,
    PLATFORM_METRICS.ACADEMIC_PAPERS
  ],
  TECHNICAL_STATS: [
    PLATFORM_METRICS.PAP_LATENCY,
    PLATFORM_METRICS.RAG_SEARCH_TIME,
    PLATFORM_METRICS.TOKEN_EFFICIENCY,
    PLATFORM_METRICS.CHAOS_UPTIME
  ],
  SOCIAL_PROOF_STATS: [
    PLATFORM_METRICS.ACTIVE_USERS,
    PLATFORM_METRICS.DEVELOPERS,
    PLATFORM_METRICS.GROWTH,
    PLATFORM_METRICS.ACADEMIC_PAPERS
  ]
} as const;