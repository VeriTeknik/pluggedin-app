import { createServer } from 'net';

/**
 * Port allocator for OAuth callback servers
 * Manages dynamic port allocation within a configured range
 */
export class PortAllocator {
  private static instance: PortAllocator;
  private allocatedPorts: Set<number> = new Set();
  
  // Default range if not configured
  private readonly DEFAULT_START = 30000;
  private readonly DEFAULT_END = 30100;
  
  private constructor() {}
  
  static getInstance(): PortAllocator {
    if (!PortAllocator.instance) {
      PortAllocator.instance = new PortAllocator();
    }
    return PortAllocator.instance;
  }
  
  /**
   * Get the configured port range from environment variables
   */
  private getPortRange(): { start: number; end: number } {
    const start = parseInt(process.env.OAUTH_PORT_RANGE_START || '') || this.DEFAULT_START;
    const end = parseInt(process.env.OAUTH_PORT_RANGE_END || '') || this.DEFAULT_END;
    
    // Validate range
    if (start >= end) {
      console.warn(`[PortAllocator] Invalid port range ${start}-${end}, using defaults`);
      return { start: this.DEFAULT_START, end: this.DEFAULT_END };
    }
    
    // Ensure ports are in valid range (1024-65535)
    const validStart = Math.max(1024, Math.min(65535, start));
    const validEnd = Math.max(1024, Math.min(65535, end));
    
    return { start: validStart, end: validEnd };
  }
  
  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      
      server.once('error', () => {
        resolve(false);
      });
      
      server.once('listening', () => {
        server.close(() => {
          resolve(true);
        });
      });
      
      server.listen(port, '0.0.0.0');
    });
  }
  
  /**
   * Allocate an available port within the configured range
   */
  async allocatePort(): Promise<number> {
    const { start, end } = this.getPortRange();
    
    console.log(`[PortAllocator] Searching for available port in range ${start}-${end}`);
    
    // Try random ports within the range to avoid sequential allocation
    const maxAttempts = Math.min(100, end - start + 1);
    const attemptedPorts = new Set<number>();
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate random port within range
      const port = start + Math.floor(Math.random() * (end - start + 1));
      
      // Skip if already attempted or allocated
      if (attemptedPorts.has(port) || this.allocatedPorts.has(port)) {
        continue;
      }
      
      attemptedPorts.add(port);
      
      // Check if port is available
      if (await this.isPortAvailable(port)) {
        this.allocatedPorts.add(port);
        console.log(`[PortAllocator] Allocated port ${port}`);
        return port;
      }
    }
    
    // If random allocation failed, try sequential
    console.log(`[PortAllocator] Random allocation failed, trying sequential scan`);
    
    for (let port = start; port <= end; port++) {
      if (this.allocatedPorts.has(port)) {
        continue;
      }
      
      if (await this.isPortAvailable(port)) {
        this.allocatedPorts.add(port);
        console.log(`[PortAllocator] Allocated port ${port} (sequential)`);
        return port;
      }
    }
    
    // If all ports in range are exhausted, fall back to OS-assigned port
    console.warn(`[PortAllocator] All ports in range ${start}-${end} are in use, falling back to OS assignment`);
    
    // Port 0 tells the OS to assign any available port
    return new Promise((resolve, reject) => {
      const server = createServer();
      
      server.once('error', (err) => {
        reject(new Error(`Failed to allocate any port: ${err.message}`));
      });
      
      server.once('listening', () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          const port = address.port;
          server.close(() => {
            this.allocatedPorts.add(port);
            console.log(`[PortAllocator] OS allocated port ${port}`);
            resolve(port);
          });
        } else {
          server.close();
          reject(new Error('Failed to get allocated port'));
        }
      });
      
      server.listen(0, '0.0.0.0');
    });
  }
  
  /**
   * Release a previously allocated port
   */
  releasePort(port: number): void {
    if (this.allocatedPorts.has(port)) {
      this.allocatedPorts.delete(port);
      console.log(`[PortAllocator] Released port ${port}`);
    }
  }
  
  /**
   * Get legacy hardcoded port for specific servers
   * This maintains backward compatibility
   */
  getLegacyPort(serverType: string): number | null {
    // Maintain legacy behavior for specific servers
    if (serverType.toLowerCase().includes('linear')) {
      return 14881;
    }
    
    // Default mcp-remote port
    return 3334;
  }
  
  /**
   * Clear all allocated ports (useful for cleanup)
   */
  clearAll(): void {
    this.allocatedPorts.clear();
    console.log(`[PortAllocator] Cleared all allocated ports`);
  }
}

// Export singleton instance
export const portAllocator = PortAllocator.getInstance();