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
    value: 620,
    suffix: '+',
    label: 'Active Developers',
    shortLabel: 'Developers'
  },
  GROWTH: {
    value: 718,
    suffix: '%',
    label: 'Monthly Growth',
    shortLabel: 'Growth'
  },
  API_CALLS: {
    value: 14000,
    suffix: '+',
    label: 'API Calls/Month',
    shortLabel: 'API Calls',
    formatted: '14K+'
  },
  PROJECTS: {
    value: 650,
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
    value: 460,
    suffix: '+',
    label: 'Active Servers',
    shortLabel: 'Servers'
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
  GROWTH_STORY: 'From 0 to 14,000+ API calls in 30 days'
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
  ]
} as const;