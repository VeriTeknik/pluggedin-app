# Ubuntu Staging Server Setup for MCP Discovery

This document outlines the required setup for MCP discovery to work on Ubuntu staging servers.

## Prerequisites

### 1. Node.js with npm
```bash
# Ensure Node.js includes npm
node --version  # Should be v20+
npm --version   # Should be available
npx --version   # Should be available
```

If `npx` is missing:
```bash
npm install -g npx
```

### 2. Python and uv (for Python MCP servers)
```bash
# Install Python 3
sudo apt-get update
sudo apt-get install python3 python3-pip python3-venv

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add to PATH (add to ~/.bashrc or /etc/environment)
export PATH="$HOME/.local/bin:$PATH"
```

### 3. Systemd Service Configuration

If running as a systemd service, ensure the service file includes proper PATH:

```ini
[Service]
Environment="PATH=/usr/local/bin:/usr/bin:/bin:/home/ubuntu/.local/bin"
Environment="NODE_ENV=production"
User=ubuntu
WorkingDirectory=/home/ubuntu/pluggedin-app
```

### 4. Permissions

Ensure the service user has access to:
- The application directory
- Node modules
- Package manager cache directories

```bash
# Create necessary directories
mkdir -p ~/.cache/mcp-packages
mkdir -p ~/.local/bin

# Set permissions
chmod 755 ~/.cache/mcp-packages
chmod 755 ~/.local/bin
```

### 5. Environment Variables

Set these in your `.env` file or systemd service:

```bash
# Package manager paths
MCP_PACKAGE_STORE_DIR=/home/ubuntu/.cache/mcp-packages
MCP_PNPM_STORE_DIR=/home/ubuntu/.cache/mcp-packages/pnpm-store
MCP_UV_CACHE_DIR=/home/ubuntu/.cache/mcp-packages/uv-cache

# Isolation configuration (if using sandboxing)
MCP_ISOLATION_TYPE=none  # Disable sandboxing if not needed
# Or install firejail/bubblewrap:
# sudo apt-get install firejail bubblewrap
```

### 6. Testing Discovery

Test if commands are available:
```bash
# As the service user
sudo -u ubuntu bash
which npx
which uv
which python3
echo $PATH
```

## Common Issues

### Issue: "Command 'npx' not found"
**Solution**: Install npm globally or ensure Node.js installation includes npm

### Issue: "Command 'uvx' not found" 
**Solution**: Install uv and add to PATH

### Issue: Discovery works as root but not as service user
**Solution**: Check PATH and permissions for the service user

### Issue: "EACCES: permission denied"
**Solution**: Check file ownership and permissions in cache directories

## Debugging

Enable debug logging by setting:
```bash
DEBUG=mcp:*
```

Check logs for:
- `[MCP Wrapper] Environment info`
- `[MCP Wrapper] Command not found`
- `[MCP Wrapper] Current PATH`