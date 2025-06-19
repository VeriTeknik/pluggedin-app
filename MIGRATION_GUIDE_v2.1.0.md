# Migration Guide: v1.0.0 to v2.1.0

This guide helps you upgrade your plugged.in App installation from v1.0.0 to v2.1.0.

## Pre-Upgrade Checklist

- [ ] Backup your database
- [ ] Backup your `.env` file
- [ ] Note any custom configurations
- [ ] Ensure you have at least 30 minutes for the upgrade

## Upgrade Steps

### 1. Stop the Application

#### Systemd Service
```bash
sudo systemctl stop pluggedin
```

#### Docker
```bash
docker-compose down
```

#### Manual Process
```bash
# Find and stop the Node.js process
ps aux | grep "node.*pluggedin"
kill <process_id>
```

### 2. Backup Your Data

```bash
# Backup PostgreSQL database
pg_dump -U your_db_user -h localhost your_db_name > backup_v1.0.0_$(date +%Y%m%d).sql

# Backup environment file
cp .env .env.backup.v1.0.0

# Backup uploaded files (if using local storage)
cp -r uploads/ uploads_backup_v1.0.0/
```

### 3. Update the Code

```bash
# If using git
git fetch origin
git checkout v2.1.0

# Or pull latest changes
git pull origin main

# Install new dependencies
pnpm install
```

### 4. Environment Variables

No new environment variables are required for v2.1.0. However, ensure these optional variables are set if you want to use new features:

```bash
# For email notifications (optional)
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@example.com
EMAIL_SERVER_PASSWORD=your-password
EMAIL_FROM=noreply@example.com

# For RAG feature (optional, uses defaults if not set)
RAG_API_URL=http://localhost:8000
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
```

### 5. Run Database Migrations

```bash
# Generate any new migrations
pnpm db:generate

# Apply migrations
pnpm db:migrate

# If using auth tables
pnpm db:migrate:auth
```

### 6. Build the Application

```bash
# Clean build directory
pnpm clean

# Build for production
pnpm build
```

### 7. Start the Application

#### Systemd Service
```bash
sudo systemctl start pluggedin
sudo systemctl status pluggedin
```

#### Docker
```bash
docker-compose up -d
docker-compose logs -f
```

#### Manual
```bash
pnpm start
```

## Post-Upgrade Verification

### 1. Check Application Health
- Visit your application URL
- Log in with your existing credentials
- Check that the version shows as 2.1.0 in settings

### 2. Test New Features
- **Document Library**: Navigate to Library page and try uploading a document
- **Notifications**: Check the notification bell icon in the navigation
- **RAG in Playground**: Enable RAG in playground settings and test with uploaded documents

### 3. Verify Existing Features
- Test MCP server connections
- Run a playground session
- Check API key functionality
- Verify profile switching

## Rollback Procedure

If you encounter issues and need to rollback:

1. Stop the application
2. Restore database:
   ```bash
   psql -U your_db_user -h localhost your_db_name < backup_v1.0.0_YYYYMMDD.sql
   ```
3. Checkout previous version:
   ```bash
   git checkout v1.0.0
   pnpm install
   pnpm build
   ```
4. Restore environment file:
   ```bash
   cp .env.backup.v1.0.0 .env
   ```
5. Start the application

## Troubleshooting

### Issue: Database migration fails
**Solution**: Check PostgreSQL logs and ensure your database user has proper permissions:
```sql
GRANT ALL PRIVILEGES ON DATABASE your_db_name TO your_db_user;
```

### Issue: Build fails with module errors
**Solution**: Clear node_modules and reinstall:
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Issue: Notifications not working
**Solution**: Check that your profile has the notification capability enabled:
1. Go to Settings
2. Check profile capabilities
3. Ensure "Notifications" is enabled

### Issue: Document upload fails
**Solution**: Check file permissions and disk space:
```bash
# Check disk space
df -h

# Check upload directory permissions
ls -la uploads/
```

## Need Help?

- 📖 [Documentation](https://docs.plugged.in)
- 🐛 [Report Issues](https://github.com/VeriTeknik/pluggedin-app/issues)
- 💬 [Community Support](https://github.com/VeriTeknik/pluggedin-app/discussions)