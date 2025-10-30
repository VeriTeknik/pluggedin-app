const fs = require('fs');
const os = require('os');

/**
 * Detect if running inside a Docker container
 * @returns {boolean} True if running in Docker
 */
function isDocker() {
  // Check for .dockerenv file
  if (fs.existsSync('/.dockerenv')) {
    return true;
  }

  // Check for Docker in cgroup
  try {
    const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
    if (cgroup.includes('docker') || cgroup.includes('containerd')) {
      return true;
    }
  } catch (error) {
    // /proc/self/cgroup doesn't exist (not Linux) or can't be read
  }

  // Check environment variables
  if (process.env.DOCKER_CONTAINER === 'true' || process.env.KUBERNETES_SERVICE_HOST) {
    return true;
  }

  // Check hostname pattern (Docker often uses hex hostnames)
  const hostname = os.hostname();
  if (/^[0-9a-f]{12}$/.test(hostname)) {
    return true;
  }

  return false;
}

/**
 * Get Docker-specific configuration defaults
 * @param {string} dbPassword - Database password to use
 * @returns {Object} Docker configuration defaults
 */
function getDockerDefaults(dbPassword) {
  return {
    // Database connection (internal Docker network)
    DATABASE_URL: `postgresql://pluggedin:${dbPassword}@pluggedin-postgres:5432/pluggedin`,

    // Application URLs (localhost for development, override in production)
    NEXTAUTH_URL: 'http://localhost:12005',
    NEXT_PUBLIC_APP_URL: 'http://localhost:12005',

    // MCP Package Management (Docker volume paths)
    MCP_PACKAGE_STORE_DIR: '/app/.cache/mcp-packages',
    MCP_PNPM_STORE_DIR: '/app/.cache/mcp-packages/pnpm-store',
    MCP_UV_CACHE_DIR: '/app/.cache/mcp-packages/uv-cache',

    // MCP Isolation (bubblewrap works well in containers)
    MCP_ISOLATION_TYPE: 'bubblewrap',
    MCP_ISOLATION_FALLBACK: 'firejail',

    // Interpreter paths (standard Docker Node.js image paths)
    MCP_NODEJS_BIN_DIR: '/usr/local/bin',
    MCP_PYTHON_BIN_DIR: '/usr/local/bin',
    MCP_DOCKER_BIN_DIR: '/usr/local/bin',
  };
}

/**
 * Get non-Docker (local development) configuration defaults
 * @param {string} dbPassword - Database password to use
 * @returns {Object} Local development configuration defaults
 */
function getLocalDefaults(dbPassword) {
  const platform = os.platform();

  // Platform-specific binary paths
  let nodejsBinDir = '/usr/local/bin';
  let pythonBinDir = '/usr/local/bin';

  if (platform === 'darwin') {
    // macOS with Homebrew
    nodejsBinDir = '/opt/homebrew/bin';
    pythonBinDir = '/opt/homebrew/bin';
  } else if (platform === 'win32') {
    // Windows
    nodejsBinDir = 'C:\\Program Files\\nodejs';
    pythonBinDir = 'C:\\Python311';
  }

  return {
    // Database connection (localhost)
    DATABASE_URL: `postgresql://pluggedin:${dbPassword}@localhost:5432/pluggedin_prod`,

    // Application URLs
    NEXTAUTH_URL: 'http://localhost:12005',
    NEXT_PUBLIC_APP_URL: 'http://localhost:12005',

    // MCP Package Management (OS-specific paths)
    MCP_PACKAGE_STORE_DIR: platform === 'win32'
      ? 'C:\\temp\\mcp-packages'
      : '/tmp/mcp-packages',
    MCP_PNPM_STORE_DIR: platform === 'win32'
      ? 'C:\\temp\\mcp-packages\\pnpm-store'
      : '/tmp/mcp-packages/pnpm-store',
    MCP_UV_CACHE_DIR: platform === 'win32'
      ? 'C:\\temp\\mcp-packages\\uv-cache'
      : '/tmp/mcp-packages/uv-cache',

    // MCP Isolation
    MCP_ISOLATION_TYPE: platform === 'linux' ? 'bubblewrap' : 'none',
    MCP_ISOLATION_FALLBACK: platform === 'linux' ? 'firejail' : 'none',

    // Interpreter paths
    MCP_NODEJS_BIN_DIR: nodejsBinDir,
    MCP_PYTHON_BIN_DIR: pythonBinDir,
    MCP_DOCKER_BIN_DIR: '/usr/local/bin',
  };
}

/**
 * Get environment-specific defaults based on where the app is running
 * @param {string} dbPassword - Database password to use
 * @returns {Object} Environment-specific configuration defaults
 */
function getEnvironmentDefaults(dbPassword) {
  return isDocker()
    ? getDockerDefaults(dbPassword)
    : getLocalDefaults(dbPassword);
}

/**
 * Get production URL defaults (preserved as specified)
 * @returns {Object} Production URL configuration
 */
function getProductionDefaults() {
  return {
    RAG_API_URL: 'https://api.plugged.in',
    NEXT_PUBLIC_REGISTRY_URL: 'https://registry.plugged.in',
    REGISTRY_API_URL: 'https://registry.plugged.in/v0',
    REGISTRY_ENABLED: 'true',
  };
}

/**
 * Get feature flag defaults
 * @returns {Object} Feature flag configuration
 */
function getFeatureDefaults() {
  return {
    ENABLE_RAG: 'true',
    ENABLE_NOTIFICATIONS: 'true',
    ENABLE_EMAIL_VERIFICATION: 'false',
    ENABLE_WELCOME_EMAILS: 'true',
    ENABLE_FOLLOW_UP_EMAILS: 'true',
  };
}

/**
 * Get MCP resource limit defaults
 * @returns {Object} MCP resource limit configuration
 */
function getMCPDefaults() {
  return {
    MCP_CPU_CORES_MAX: '0.5',
    MCP_MEMORY_MAX_MB: '512',
    MCP_IO_READ_MBPS: '10',
    MCP_IO_WRITE_MBPS: '5',
    MCP_PROCESS_TIMEOUT_MS: '300000',
    MCP_STARTUP_TIMEOUT_MS: '10000',
    MCP_PACKAGE_CACHE_DAYS: '30',
    MCP_PREWARM_COMMON_PACKAGES: 'true',
    MCP_ENABLE_NETWORK_ISOLATION: 'false',
  };
}

module.exports = {
  isDocker,
  getDockerDefaults,
  getLocalDefaults,
  getEnvironmentDefaults,
  getProductionDefaults,
  getFeatureDefaults,
  getMCPDefaults,
};
