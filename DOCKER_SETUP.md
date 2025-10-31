# Docker Setup Guide for Plugged.in

This guide explains how Plugged.in's smart Docker setup works with the integrated setup wizard.

## Quick Start

### First-Time Installation

1. **Clone and start:**
   ```bash
   git clone <repository-url>
   cd pluggedin-app
   docker-compose up --build
   ```

2. **Complete setup wizard:**
   - Container automatically detects no `.env` file
   - Setup wizard starts on port **12006**
   - Open your browser to: **http://localhost:12006**
   - Complete the Quick Setup (takes ~2 minutes)

3. **Automatic restart:**
   - Setup wizard creates `.env` file
   - Setup wizard exits gracefully
   - Docker automatically restarts container
   - Main application starts on port **12005**
   - Access your app at: **http://localhost:12005**

### Subsequent Runs

```bash
docker-compose up
```

- Container detects existing `.env` file
- Main application starts immediately on port **12005**
- No setup wizard needed

## How It Works

### Smart Entrypoint

The Docker container uses an intelligent entrypoint script (`docker/entrypoint.sh`) that:

1. **Checks for `.env` file** in `/app/.env`
2. **If missing:**
   - Starts setup wizard on port 12006
   - Displays helpful instructions in logs
3. **If present:**
   - Starts main application on port 12005
   - Skips setup wizard entirely

### Architecture

```
docker-compose up
     ↓
Container starts → entrypoint.sh
     ↓
Check .env exists?
     ↓
   NO ──→ Setup Wizard (port 12006)
   │           ↓
   │      User completes setup
   │           ↓
   │      .env file created
   │           ↓
   │      Setup exits (code 0)
   │           ↓
   └──────→ Docker restarts (restart: always)
               ↓
          entrypoint.sh checks again
               ↓
   YES ──→ Main App (port 12005)
```

## Setup Wizard Modes

The setup wizard offers three configuration modes:

### 1. ⚡ Quick Setup (Recommended)
- **Time:** ~2 minutes
- **Input:**
  - Admin email and password
  - Optional AI provider API key (Claude/GPT/Gemini)
- **Auto-generated:**
  - All security secrets (NEXTAUTH_SECRET, encryption keys, etc.)
  - Database configuration (Docker-optimized)
  - Production service URLs

### 2. 📁 Import Configuration
- Upload existing `.env` file
- Automatic validation
- Preview before saving
- Auto-fills missing required values

### 3. ⚙️ Detailed Setup (Advanced)
- **Time:** ~10 minutes
- **7-step wizard:**
  1. Core Settings (admin, URLs, database)
  2. Security (view/regenerate secrets)
  3. Email & Notifications (SMTP, optional)
  4. AI Providers (Anthropic, OpenAI, Google)
  5. OAuth Providers (GitHub, Google)
  6. Payments (Stripe)
  7. Advanced (MCP settings, feature flags)

## Port Configuration

- **12005** - Main Plugged.in application
- **12006** - Setup wizard (only active when `.env` is missing)

Both ports are exposed in `docker-compose.yml`, but only one service runs at a time.

## Environment Variables

The setup wizard automatically generates:

### Required Secrets (Auto-generated)
- `NEXTAUTH_SECRET` - JWT encryption
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` - MCP encryption
- `UNSUBSCRIBE_TOKEN_SECRET` - Email tokens
- `API_KEY_ENCRYPTION_SECRET` - API key encryption
- `REGISTRY_INTERNAL_API_KEY` - Registry authentication

### Docker-Optimized Defaults
- `DATABASE_URL` - Internal Docker network connection
- `MCP_PACKAGE_STORE_DIR` - `/app/.cache/mcp-packages`
- `MCP_ISOLATION_TYPE` - `bubblewrap`

### Preserved Production URLs
- `RAG_API_URL=https://api.plugged.in`
- `REGISTRY_API_URL=https://registry.plugged.in/v0`
- `NEXT_PUBLIC_REGISTRY_URL=https://registry.plugged.in`

## Common Tasks

### View Logs

**Setup wizard logs:**
```bash
docker-compose logs -f pluggedin-app
```

Look for:
- "Starting Setup Wizard on port 12006" (no .env)
- "Starting Plugged.in application on port 12005" (.env exists)

### Reset Configuration

```bash
# Remove .env file
rm .env

# Restart container
docker-compose restart

# Setup wizard will start automatically
```

### Manual Restart After Setup

Setup wizard normally triggers automatic restart, but if needed:

```bash
docker-compose restart pluggedin-app
```

### Check Database

```bash
# Access PostgreSQL
docker-compose exec pluggedin-postgres psql -U pluggedin -d pluggedin

# List tables
\dt

# Check admin user
SELECT email, is_admin FROM users;

# Exit
\q
```

### Complete Clean Start

```bash
# Stop and remove all containers and volumes
docker-compose down -v

# Remove .env file
rm .env

# Start fresh
docker-compose up --build
```

## Troubleshooting

### Setup Wizard Won't Start

**Check logs:**
```bash
docker-compose logs pluggedin-app
```

**Common issues:**
- `.env` file exists (remove it if you want setup wizard)
- Port 12006 already in use (stop conflicting service)
- Database not ready (check postgres logs)

### Can't Access Setup Wizard

**Verify container is running:**
```bash
docker-compose ps
```

**Check port mapping:**
```bash
docker-compose port pluggedin-app 12006
```

Should show: `0.0.0.0:12006`

### Setup Completes But App Won't Start

**Check .env file was created:**
```bash
ls -la .env
```

**Manually restart:**
```bash
docker-compose restart pluggedin-app
```

**Check logs for errors:**
```bash
docker-compose logs -f pluggedin-app
```

### Database Connection Failed

**Check database is running:**
```bash
docker-compose ps pluggedin-postgres
```

**Check database health:**
```bash
docker-compose exec pluggedin-postgres pg_isready -U pluggedin
```

**View database logs:**
```bash
docker-compose logs pluggedin-postgres
```

### Migrations Failed

Setup wizard runs migrations automatically. If they fail:

**Check migration logs in setup wizard output**

**Manually run migrations:**
```bash
docker-compose run --rm pluggedin-app sh -c "cd /app && pnpm db:migrate"
```

## Production Deployment

### Using .env File

For production, create `.env` before starting:

```bash
# Copy example
cp .env.example .env

# Edit with your production values
nano .env

# Start application (skips setup wizard)
docker-compose up -d
```

### Using Environment Variables

Override in `docker-compose.yml` or pass via command:

```bash
docker-compose up -d \
  -e DATABASE_URL=postgresql://... \
  -e NEXTAUTH_SECRET=... \
  -e OPENAI_API_KEY=...
```

### Security Best Practices

1. **Never commit `.env` to version control**
2. **Use strong passwords** (setup wizard validates)
3. **Keep secrets secure** (all auto-generated are 32+ bytes)
4. **Update regularly** (rebuild with `--build` flag)
5. **Monitor logs** (check for security warnings)

## Advanced Configuration

### Custom Ports

Edit `docker-compose.yml`:

```yaml
ports:
  - '8080:3000'    # Main app on port 8080
  - '8081:12006'   # Setup wizard on port 8081
```

### External Database

Update `DATABASE_URL` in `docker-compose.yml`:

```yaml
environment:
  - DATABASE_URL=postgresql://user:pass@external-host:5432/dbname
```

### Volume Management

**Persistent MCP packages:**
```yaml
volumes:
  - mcp-cache:/app/.cache
```

**Persistent uploads:**
```yaml
volumes:
  - app-uploads:/app/uploads
```

**Backup volumes:**
```bash
docker run --rm \
  -v pluggedin-postgres:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data
```

## Support

- **Documentation:** https://docs.plugged.in
- **Issues:** https://github.com/VeriTeknik/pluggedin-app/issues
- **Docker Hub:** (coming soon)

## License

MIT License - See LICENSE file for details
