# Release Notes - v2.17.0

**Release Date:** November 2, 2025

## 🎉 Major Features

### 🐳 Multi-Architecture Docker Support

**The biggest update in this release!** Plugged.in now officially supports both AMD64 and ARM64 architectures.

#### What This Means For You:
- ✅ **Works on Apple Silicon** (M1/M2/M3) natively - no more performance issues!
- ✅ **AWS Graviton support** - cost-effective cloud deployments
- ✅ **Raspberry Pi 4+** - run Plugged.in on ARM devices
- ✅ **Traditional x86/AMD64** - full compatibility maintained
- ✅ **Automatic platform detection** - Docker pulls the right architecture for your system

#### Docker Hub Official Images

Pre-built multi-architecture images are now available on Docker Hub:

```bash
# Automatically pulls the correct architecture for your platform
docker pull veriteknik/pluggedin:latest
docker pull veriteknik/pluggedin:v2.17.0
```

**Verify multi-arch support:**
```bash
docker manifest inspect veriteknik/pluggedin:latest
# Shows manifests for both linux/amd64 and linux/arm64
```

---

## 🐛 Critical Bug Fixes

### Fixed: Self-Hosted Registration Issue (#61)

**Problem:** New users couldn't register on self-hosted instances due to missing `username` column.

**Solution:** Added robust migration (`0066_fix_missing_username.sql`) that:
- ✅ Safely adds the `username` column
- ✅ Creates proper indexes for performance
- ✅ Adds unique constraints
- ✅ Works for both fresh installs and existing databases

**Impact:** Self-hosted instances can now successfully register new users without errors.

---

## 🔒 Security Enhancements

### Docker Build Security

1. **Pinned GitHub Actions to commit SHAs** - Prevents supply chain attacks
   - All third-party actions now use immutable commit references
   - Mitigates risk of backdoor injections

2. **Input Validation** - Workflow inputs validated before execution
   - Version format must match `latest` or `vX.Y.Z`
   - Prevents malformed builds

3. **Improved Error Handling**
   - Docker login failures exit immediately with clear messages
   - Platform detection errors caught early
   - Build failures don't corrupt existing tags

---

## ⚡ Performance & Infrastructure

### Optimized Docker Build Process

1. **Ephemeral Builders for CI**
   - Auto-cleanup prevents state pollution
   - Uses latest BuildKit for better performance

2. **Improved Build Cache**
   - Changed from `mode=max` to `mode=min` to prevent unbounded growth
   - Faster subsequent builds while managing disk space

3. **Manifest Verification**
   - Automatically verifies both architectures are present
   - Fails fast if platforms are missing

### Expected Build Times

- **Single architecture (local):** 5-10 minutes
- **Multi-architecture (CI):** 15-25 minutes (includes QEMU emulation)

---

## 📚 Documentation Updates

### New Documentation

1. **Multi-Architecture Guide** (`/deployment/docker`)
   - Platform verification commands
   - Build and deployment instructions
   - Troubleshooting guide

2. **Installation Guide Updates** (`/quickstart/installation`)
   - Docker Hub pre-built images section
   - Architecture-specific notes
   - Simplified quick start

3. **README Improvements**
   - Docker Compose multi-arch clarification
   - Updated badges and links
   - Build time expectations

### Rollback Strategy

Documentation now includes rollback procedures:
```bash
# If a build fails, previous tags remain unchanged
docker pull veriteknik/pluggedin:v2.15.0
```

---

## 🛠️ Developer Experience

### New Build Script

Enhanced `docker-build.sh` with:
- Reliable platform detection using `docker version -f`
- Comprehensive error handling
- Manifest verification after push
- Clear success/failure messages

**Usage:**
```bash
# Multi-arch build and push
./docker-build.sh v2.17.0

# Local build for testing
./docker-build.sh v2.17.0 --local
```

### Automated GitHub Workflows

1. **Multi-Arch Build Workflow** (`.github/workflows/docker-publish.yml`)
   - Triggered by tags (`v*.*.*`) or manual dispatch
   - Builds for both AMD64 and ARM64
   - Verifies manifest before completion

2. **Docker Hub README Sync** (`.github/workflows/docker-hub-readme.yml`)
   - Automatically updates Docker Hub description
   - Triggered on README.md changes

---

## 📦 What's Included

### Docker Architecture

```yaml
Services:
  - pluggedin-app: Next.js 15 application (multi-arch)
  - pluggedin-postgres: PostgreSQL 18-alpine
  - drizzle-migrate: One-time migration runner

Volumes:
  - pluggedin-postgres: Database data (persistent)
  - app-uploads: User uploaded files (persistent)
  - app-logs: Application logs (persistent)
  - mcp-cache: MCP package cache (persistent)

Supported Platforms:
  - linux/amd64 (Intel/AMD processors)
  - linux/arm64 (Apple Silicon, AWS Graviton, Raspberry Pi)
```

---

## 🔄 Migration Guide

### From v2.15.x to v2.17.0

#### Docker Users (Recommended)

```bash
# Stop current containers
docker-compose down

# Pull latest code
git pull origin main

# Rebuild with new multi-arch images
docker-compose up --build -d
```

**Or using Docker Hub:**

```bash
# Stop containers
docker-compose down

# Pull latest multi-arch image
docker pull veriteknik/pluggedin:v2.17.0

# Start services
docker-compose -f docker-compose.production.yml up -d
```

#### Manual Installation

```bash
# Pull latest code
git pull origin main

# Install dependencies
pnpm install

# Run migrations (includes username fix)
pnpm db:migrate

# Rebuild and restart
pnpm build
pnpm start
```

---

## 🎯 Breaking Changes

**None!** This release is fully backward compatible with v2.15.x.

---

## 📊 Statistics

- **Docker Image Sizes:**
  - AMD64: ~450MB (compressed)
  - ARM64: ~440MB (compressed)

- **Migration Files:** 66 total (added 1 new)
- **Supported Architectures:** 2 (AMD64, ARM64)
- **Supported Languages:** 6 (en, tr, zh, hi, ja, nl)

---

## 🙏 Contributors

Special thanks to:
- @grota - Reported self-hosted registration issue (#61)
- @simon041988 - Confirmed and helped test the fix
- @justinbadal - Requested multi-architecture support (#84)

---

## 🔗 Resources

- **Docker Hub:** https://hub.docker.com/r/veriteknik/pluggedin
- **Documentation:** https://docs.plugged.in
- **GitHub:** https://github.com/VeriTeknik/pluggedin-app
- **Issue Tracker:** https://github.com/VeriTeknik/pluggedin-app/issues

---

## 📝 Full Changelog

**Features:**
- Multi-architecture Docker support (AMD64 + ARM64) (#105)
- Official Docker Hub images with automated builds
- Docker Hub README auto-sync workflow

**Bug Fixes:**
- Fixed missing username column preventing registration (#61)
- Fixed platform detection in build script
- Fixed Docker login error handling

**Security:**
- Pinned GitHub Actions to commit SHAs
- Added workflow input validation
- Improved error handling and early failure detection

**Documentation:**
- Added multi-architecture deployment guide
- Updated installation instructions
- Added Docker Hub quick start
- Documented build times and rollback procedures

**Infrastructure:**
- Ephemeral builders for CI (prevents state pollution)
- Optimized build cache strategy
- Automated manifest verification
- Enhanced build script with better error messages

---

## 🚀 What's Next?

Stay tuned for v2.17.0 with:
- Enhanced MCP server management
- Performance optimizations
- Additional platform features

---

**Upgrade now to take advantage of multi-architecture support and improved self-hosted reliability!**

```bash
# Quick upgrade
git checkout main
git pull
docker-compose up --build -d
```

For questions or issues, visit: https://github.com/VeriTeknik/pluggedin-app/issues
