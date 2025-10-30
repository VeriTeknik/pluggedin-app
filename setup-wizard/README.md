# Plugged.in Setup Wizard

A lightweight, standalone installer for Plugged.in that runs before the main application starts.

## Overview

The Setup Wizard is a minimal Express.js application that:
- Runs on port 12006 (separate from main app on 12005)
- Only starts when no `.env` file exists
- Generates secure configuration
- Creates the first admin user
- Runs database migrations
- Exits after setup completes

## Features

### Three Setup Modes

1. **Quick Setup** (Recommended)
   - Admin email and password
   - Optional AI provider API key
   - Auto-generates all security secrets
   - Uses Docker-optimized defaults

2. **Import Existing .env**
   - Upload existing .env file
   - Validates and shows warnings
   - Auto-fills missing required values
   - Merges with Docker defaults

3. **Detailed Setup** (Advanced)
   - 7-step wizard with all configuration options
   - Core settings, security, email, AI providers, OAuth, payments, advanced
   - Full control over every setting
   - Helpful tooltips and defaults

## Usage

### Standalone Mode
```bash
cd setup-wizard
npm install
npm start
# Open http://localhost:12006
```

### Docker Mode
The setup wizard runs automatically in Docker if no `.env` file exists:
```bash
docker-compose up
# If no .env: Opens setup wizard on port 12006
# If .env exists: Starts main app on port 12005
```

## Architecture

- **No Framework Dependencies**: Pure Express.js with vanilla JavaScript frontend
- **Fast Startup**: < 1 second boot time
- **Minimal Bundle**: < 5MB total size
- **Zero Impact**: Completely separate from main Next.js application

## Security

- Generates cryptographically secure secrets (32+ bytes)
- Creates `.env` file with 0600 permissions (owner read/write only)
- Hashes admin password with bcrypt
- Validates all inputs server-side with Zod
- Never logs sensitive information

## Environment Variables Generated

### Required (Auto-generated)
- `NEXTAUTH_SECRET` - JWT encryption key
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` - MCP server encryption
- `UNSUBSCRIBE_TOKEN_SECRET` - Email unsubscribe tokens

### Required (User-provided or defaults)
- `DATABASE_URL` - PostgreSQL connection
- `NEXTAUTH_URL` - Application URL
- `NEXT_PUBLIC_APP_URL` - Public app URL

### Preserved Production URLs
- `RAG_API_URL=https://api.plugged.in`
- `NEXT_PUBLIC_REGISTRY_URL=https://registry.plugged.in`
- `REGISTRY_API_URL=https://registry.plugged.in/v0`
- `REGISTRY_ENABLED=true`

### Optional
- AI provider API keys (Anthropic, OpenAI, Google)
- OAuth credentials (GitHub, Google)
- SMTP email configuration
- Stripe payment keys
- MCP resource limits and settings

## Workflow

1. User accesses setup wizard
2. User selects setup mode (Quick/Import/Detailed)
3. User provides required information
4. Wizard validates input
5. Wizard generates `.env` file
6. Wizard tests database connection
7. Wizard runs database migrations
8. Wizard creates admin user
9. Wizard displays success message
10. Wizard exits (process.exit(0))
11. Docker/systemd restarts and starts main application
12. User logs in with admin credentials

## Files

```
setup-wizard/
├── package.json          # Minimal dependencies
├── server.js             # Express server
├── lib/
│   ├── secret-generator.js    # Generate crypto secrets
│   ├── env-generator.js       # Create .env file
│   ├── docker-detector.js     # Detect Docker environment
│   ├── db-migrator.js         # Run Drizzle migrations
│   └── admin-creator.js       # Create first admin user
├── public/
│   ├── index.html        # Landing page
│   ├── quick.html        # Quick setup form
│   ├── import.html       # Import .env form
│   ├── detailed.html     # Detailed wizard
│   ├── css/
│   │   └── setup.css     # Minimal styling
│   └── js/
│       ├── setup.js      # Frontend logic
│       └── validator.js  # Client validation
└── templates/
    └── env.template      # .env template with placeholders
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Test setup wizard
open http://localhost:12006
```

## License

MIT
