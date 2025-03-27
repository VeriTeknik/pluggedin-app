# Plugged.in Service Scripts

This directory contains scripts for deploying and managing the Plugged.in application.

## Structure

- `start-pluggedin.sh` - Main setup and deployment script
- `fix-service.sh` - Helper script to fix/reconfigure the systemd service
- `utils/helpers.sh` - Common utility functions used by the scripts
- `apply-migrations.js` - Database migration script

## Usage

### Initial Setup

To set up the application from scratch or update an existing deployment:

```bash
./scripts/start-pluggedin.sh
```

Or use the symlink in the root directory:

```bash
./start.sh
```

### Fixing the Service

If the systemd service needs to be reconfigured:

```bash
./scripts/fix-service.sh
```

### Database Migrations

Database migrations are handled automatically by the start script, but can be run manually:

```bash
pnpm db:migrate:auth
pnpm db:generate
pnpm db:migrate
``` 