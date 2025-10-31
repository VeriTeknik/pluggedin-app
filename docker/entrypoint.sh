#!/bin/sh
set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Plugged.in Docker Container Starting..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if .env exists in persistent storage and symlink it
if [ -f /app/config/.env ]; then
    echo "✅ Found existing configuration in persistent storage"
    ln -sf /app/config/.env /app/.env
fi

# Check if .env file exists (either original or symlinked)
if [ ! -f /app/.env ]; then
    echo "⚙️  No configuration found (.env file missing)"
    echo ""
    echo "📋 Starting Setup Wizard on port 12006"
    echo "🌐 Open http://localhost:12006 in your browser"
    echo "🎯 Complete the setup to configure your installation"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Start setup wizard
    cd /app/setup-wizard
    exec node server.js

else
    echo "✅ Configuration found (.env file present)"
    echo ""
    echo "🚀 Starting Plugged.in application on port 12005"
    echo "🌐 Access the app at http://localhost:12005"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Start main application
    cd /app
    exec npm start
fi
