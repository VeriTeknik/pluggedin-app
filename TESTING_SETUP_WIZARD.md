# Testing the Setup Wizard with Docker

This guide shows you how to test the new setup wizard using Docker.

## Prerequisites

- Docker and Docker Compose installed
- No existing `.env` file (the wizard only runs if `.env` is missing)

## Quick Test Instructions

### 1. Remove existing .env file (if present)

```bash
# Backup your current .env if needed
cp .env .env.backup

# Remove it so setup wizard runs
rm .env
```

### 2. Start the setup wizard with Docker

```bash
docker-compose -f docker-compose.setup.yml up --build
```

This will:
- Start PostgreSQL database
- Build the setup wizard image
- Start setup wizard on port 12006

### 3. Access the setup wizard

Open your browser to:
```
http://localhost:12006
```

### 4. Complete the setup

Choose one of three setup modes:

**Quick Setup (Recommended):**
1. Enter admin email and password
2. Optionally add an AI provider API key
3. Click "Complete Setup"
4. Wait for setup to complete (~30 seconds)

**Import .env:**
1. Upload an existing .env file
2. Review and validate
3. Click "Save Configuration"

**Detailed Setup:**
1. Step through 7 configuration tabs
2. Customize all settings
3. Complete setup

### 5. Verify setup completion

After setup completes:

1. Check that `.env` file was created:
```bash
ls -la .env
```

2. Verify database was initialized:
```bash
docker-compose -f docker-compose.setup.yml exec pluggedin-postgres \
    psql -U pluggedin -d pluggedin -c "\dt"
```

3. Check that admin user was created:
```bash
docker-compose -f docker-compose.setup.yml exec pluggedin-postgres \
    psql -U pluggedin -d pluggedin -c "SELECT email, is_admin FROM users;"
```

### 6. Stop the setup wizard

```bash
docker-compose -f docker-compose.setup.yml down
```

### 7. Start the main application

```bash
# Now that .env exists, start the main app
docker-compose up
```

## Testing Different Scenarios

### Test 1: Quick Setup
- Remove .env
- Start setup wizard
- Use Quick Setup mode
- Verify .env created with auto-generated secrets

### Test 2: Import .env
- Create a sample .env file
- Start setup wizard
- Use Import mode
- Verify validation works

### Test 3: Detailed Setup
- Remove .env
- Start setup wizard
- Use Detailed Setup mode
- Step through all tabs
- Verify all options are configurable

### Test 4: Docker Detection
Check that the wizard detects Docker environment:
```bash
docker-compose -f docker-compose.setup.yml logs setup-wizard | grep Docker
```

Should show: `🐳 Docker environment: Yes`

## Troubleshooting

### Setup wizard won't start
```bash
# Check logs
docker-compose -f docker-compose.setup.yml logs setup-wizard

# Common issue: Port 12006 already in use
lsof -i :12006
```

### Database connection failed
```bash
# Check database is running
docker-compose -f docker-compose.setup.yml ps

# Check database logs
docker-compose -f docker-compose.setup.yml logs pluggedin-postgres
```

### Migrations failed
```bash
# Ensure pnpm and dependencies are available
docker-compose -f docker-compose.setup.yml exec setup-wizard ls -la /app/../node_modules/.bin/
```

### Cannot create .env file
```bash
# Check volume mounts
docker-compose -f docker-compose.setup.yml exec setup-wizard ls -la /app/../

# Check permissions
ls -la .
```

## Manual Testing (Without Docker)

If you want to test without Docker:

```bash
# 1. Remove .env
rm .env

# 2. Start local PostgreSQL (if needed)
# Make sure you have PostgreSQL running locally

# 3. Install setup wizard dependencies
cd setup-wizard
npm install

# 4. Start setup wizard
npm start

# 5. Open browser
open http://localhost:12006
```

## API Testing

Test individual API endpoints:

```bash
# Get status
curl http://localhost:12006/api/status

# Generate secrets
curl -X POST http://localhost:12006/api/generate-secrets

# Get defaults
curl http://localhost:12006/api/defaults

# Test database connection
curl -X POST http://localhost:12006/api/test-database \
    -H "Content-Type: application/json" \
    -d '{"databaseUrl":"postgresql://pluggedin:pluggedin_secure_password@pluggedin-postgres:5432/pluggedin"}'
```

## Expected Behavior

1. **On first run (no .env):**
   - Setup wizard starts on port 12006
   - User completes setup
   - .env file is created
   - Database is initialized
   - Admin user is created
   - Setup wizard exits

2. **On subsequent runs (with .env):**
   - Setup wizard should not run
   - Main application should start on port 12005

## Cleanup

To completely reset and test again:

```bash
# Stop all containers
docker-compose -f docker-compose.setup.yml down -v

# Remove .env
rm .env

# Remove database volume
docker volume rm pluggedin-app_postgres_data

# Start fresh
docker-compose -f docker-compose.setup.yml up --build
```

## Success Criteria

- ✅ Setup wizard accessible at http://localhost:12006
- ✅ All three setup modes functional
- ✅ Secrets generated securely
- ✅ .env file created with correct permissions
- ✅ Database initialized with all tables
- ✅ Admin user created successfully
- ✅ Setup wizard exits cleanly after completion
- ✅ Docker environment properly detected
