import fs from 'fs';
import os from 'os';
import path from 'path';

export class PackageManagerConfig {
  // Resource limits from environment
  static readonly CPU_CORES_MAX = parseFloat(process.env.MCP_CPU_CORES_MAX || '0.5');
  static readonly MEMORY_MAX_MB = parseInt(process.env.MCP_MEMORY_MAX_MB || '512');
  static readonly IO_READ_MBPS = parseInt(process.env.MCP_IO_READ_MBPS || '10');
  static readonly IO_WRITE_MBPS = parseInt(process.env.MCP_IO_WRITE_MBPS || '5');
  static readonly PROCESS_TIMEOUT_MS = parseInt(process.env.MCP_PROCESS_TIMEOUT_MS || '300000');
  static readonly STARTUP_TIMEOUT_MS = parseInt(process.env.MCP_STARTUP_TIMEOUT_MS || '10000');
  
  // Get OS-specific default directory
  private static getDefaultStoreDir(): string {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: Use /tmp or ~/Library/Caches
      return '/tmp/mcp-packages';
    } else if (platform === 'win32') {
      // Windows: Use %TEMP% or %LOCALAPPDATA%
      return path.join(os.tmpdir(), 'mcp-packages');
    } else {
      // Linux and others: Use /var/mcp-packages if writable, otherwise ~/.cache
      try {
        // Check if we're running as a service with write access to /var
        fs.accessSync('/var', fs.constants.W_OK);
        return '/var/mcp-packages';
      } catch {
        // Fallback to user's cache directory
        return path.join(os.homedir(), '.cache', 'mcp-packages');
      }
    }
  }
  
  // Package management
  static readonly PACKAGE_STORE_DIR = process.env.MCP_PACKAGE_STORE_DIR || this.getDefaultStoreDir();
  static readonly PNPM_STORE_DIR = process.env.MCP_PNPM_STORE_DIR || path.join(this.PACKAGE_STORE_DIR, 'pnpm-store');
  static readonly UV_CACHE_DIR = process.env.MCP_UV_CACHE_DIR || path.join(this.PACKAGE_STORE_DIR, 'uv-cache');
  static readonly PACKAGE_CACHE_DAYS = parseInt(process.env.MCP_PACKAGE_CACHE_DAYS || '30');
  static readonly PREWARM_COMMON_PACKAGES = process.env.MCP_PREWARM_COMMON_PACKAGES === 'true';
  
  // Isolation
  static readonly ISOLATION_TYPE = process.env.MCP_ISOLATION_TYPE || 'bubblewrap';
  static readonly ISOLATION_FALLBACK = process.env.MCP_ISOLATION_FALLBACK || 'firejail';
  static readonly ENABLE_NETWORK_ISOLATION = process.env.MCP_ENABLE_NETWORK_ISOLATION === 'true';
  
  // MCP Interpreter Paths
  static readonly NODEJS_BIN_DIR = process.env.MCP_NODEJS_BIN_DIR || this.getDefaultNodejsBinDir();
  static readonly PYTHON_BIN_DIR = process.env.MCP_PYTHON_BIN_DIR || this.getDefaultPythonBinDir();
  static readonly DOCKER_BIN_DIR = process.env.MCP_DOCKER_BIN_DIR || this.getDefaultDockerBinDir();
  
  // Static initialization block removed - was logging configuration
  
  // Get OS-specific default Node.js bin directory
  private static getDefaultNodejsBinDir(): string {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: Check Homebrew first, then system
      return '/opt/homebrew/bin';
    } else if (platform === 'win32') {
      // Windows: npm is typically in Program Files
      return 'C:\\Program Files\\nodejs';
    } else {
      // Linux: Use system bin directory
      return '/usr/local/bin';
    }
  }
  
  // Get OS-specific default Python bin directory
  private static getDefaultPythonBinDir(): string {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: Check Homebrew first, then system
      return '/opt/homebrew/bin';
    } else if (platform === 'win32') {
      // Windows: Python is typically in Scripts folder
      return 'C:\\Python\\Scripts';
    } else {
      // Linux: Use system bin directory
      return '/usr/local/bin';
    }
  }
  
  // Get OS-specific default Docker bin directory
  private static getDefaultDockerBinDir(): string {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS: Docker Desktop installs to /usr/local/bin
      return '/usr/local/bin';
    } else if (platform === 'win32') {
      // Windows: Docker Desktop installs to Program Files
      return 'C:\\Program Files\\Docker\\Docker\\resources\\bin';
    } else {
      // Linux: Use system bin directory
      return '/usr/local/bin';
    }
  }
}