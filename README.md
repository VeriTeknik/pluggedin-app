# plugged.in 🔌

<div align="center">

![plugged.in Logo](https://plugged.in/_next/image?url=%2Fpluggedin-wl.png&w=256&q=75)

**Turn your AI conversations into permanent organizational memory**

[![Version](https://img.shields.io/badge/version-2.15.0-blue?style=for-the-badge)](https://github.com/VeriTeknik/pluggedin-app/releases)
[![GitHub Stars](https://img.shields.io/github/stars/VeriTeknik/pluggedin-app?style=for-the-badge)](https://github.com/VeriTeknik/pluggedin-app/stargazers)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue?style=for-the-badge&logo=docker)](https://ghcr.io/veriteknik/pluggedin-app)

[🚀 Get Started](#-quick-start) • [📚 Documentation](#-documentation) • [🌟 Features](#-key-features) • [💬 Community](#-community--support)

</div>

---

## 🎯 The Problem We Solve

Every day, you have brilliant conversations with AI - strategy sessions with GPT-4, code reviews with Claude, analysis with Gemini. But when you close that chat window, all that knowledge vanishes. **This is the "AI knowledge evaporation" problem.**

## 💡 The Solution

**plugged.in is the world's first AI Content Management System (AI-CMS)** - a platform that transforms ephemeral AI interactions into persistent, versioned, and searchable organizational knowledge.

Think of it as **"Git for AI-generated content"** meets **"WordPress for AI interactions"**.

---

## ✨ What Makes plugged.in Special

### 🧠 **AI Memory That Persists**
Your AI conversations become permanent assets. Every document is versioned, attributed, and searchable.

### 🤝 **Multi-Model Collaboration**
Claude writes v1, GPT-4 adds technical specs in v2, Gemini refines in v3 - all tracked and attributed.

### 🔌 **Universal MCP Integration**
Works with 1,500+ MCP servers. Connect any tool, any AI, any workflow - all through one interface.

### 🔒 **Enterprise-Grade Security**
End-to-end encryption, OAuth 2.1, rate limiting, and sandboxed execution for your peace of mind.

---

## 📊 Real Platform Statistics

```yaml
Documents Managed: 90+ (72% AI-generated)
Integrated MCP Servers: 1,568
Active Versioning: Documents with up to 4 iterations
Model Attributions: 17 different AI models tracked
Search Performance: Sub-second RAG queries
Security: AES-256-GCM encryption, Redis rate limiting
```

---

## 🚀 Quick Start

### Docker (Recommended - 2 minutes)

```bash
# Clone and setup
git clone https://github.com/VeriTeknik/pluggedin-app.git
cd pluggedin-app
cp .env.example .env

# Start with Docker
docker compose up --build -d

# Visit http://localhost:12005
```

### Cloud Version

Visit [plugged.in](https://plugged.in) for instant access - no installation required.

---

## 🌟 Key Features

### 📚 Document Management & Versioning
- **Version Control**: Track every change with Git-style history
- **Model Attribution**: Know which AI contributed what
- **Smart Search**: Semantic search across all documents
- **Multiple Formats**: PDF, Markdown, Code, Images, and more
- **Dual Storage Display**: View both file and RAG vector storage usage

### 🔧 MCP Server Hub
- **1,500+ Integrations**: Connect to any MCP-compatible tool
- **Advanced Multi-Select Filtering**: Filter by multiple package types simultaneously (npm, PyPI, Docker, MCPB, NuGet)
- **Smart Search**: Intelligent filtering with real-time result counts and validation
- **Auto-Discovery**: Find and configure servers from GitHub, npm, Smithery
- **Registry Integration**: Claim and manage servers with GitHub credentials
- **Unified Interface**: One API key, all your tools
- **Tool Prefixing**: Automatic namespace management prevents conflicts
- **OAuth Support**: Server-side OAuth handling for MCP servers

### 🎮 Interactive Playground
- **Test Any Model**: Claude, GPT-4, Gemini, and more
- **Live Debugging**: See real-time MCP interactions
- **RAG Integration**: Use your documents as context
- **Custom Instructions**: Per-server configuration
- **Extensive Logging**: Detailed debugging capabilities

### 🔔 Real-Time Intelligence
- **Activity Tracking**: Monitor all MCP operations
- **Email Notifications**: Stay informed about important events
- **Trending Analytics**: See what tools are popular
- **Audit Logs**: Complete activity history
- **Bidirectional Notifications**: Send, receive, mark as read

### 🔐 Security First
- **End-to-End Encryption**: AES-256-GCM for all sensitive data
- **Per-Profile Encryption**: Isolated encryption keys per workspace
- **OAuth 2.1**: Modern authentication flows
- **Sandboxed Execution**: Firejail isolation on Linux
- **Redis Rate Limiting**: Advanced DDoS protection with fallback
- **LRU Cache**: Memory-efficient caching with automatic eviction
- **Enhanced Password Security**: Bcrypt cost factor 14 (16,384 iterations)
- **Dynamic CSP Nonces**: Cryptographically secure Content Security Policy
- **Security Headers**: HSTS, X-Frame-Options, X-Content-Type-Options

### 🏢 Hub & Workspace Management
- **Multi-Hub Architecture**: Organize projects into separate hubs
- **Workspace Isolation**: Each hub contains multiple isolated workspaces
- **Smart Hub Switching**: Automatic workspace selection when switching hubs
- **Data Scoping**: Hub-level and workspace-level data isolation
- **Current Hub Display**: Dashboard shows active hub for context awareness

---

## 🏗️ Architecture

<div align="center">

![plugged.in Architecture](./docs/images/pluggedin-architecture.png)

</div>

### Architecture Overview

plugged.in acts as **the central hub** connecting various AI clients, development tools, and programming languages with your knowledge base and the broader MCP ecosystem. The architecture is designed for maximum flexibility and extensibility.

### 🟢 Production-Ready Integrations (Solid Lines)

#### **MCP Proxy Interface**
The MCP Proxy serves as a unified gateway that aggregates multiple MCP servers into a single interface:

- **Claude Code** - Official Anthropic CLI for Claude with native MCP support
- **Cline** - VS Code extension for AI-assisted development
- **LM Studio** - Local model execution with MCP integration
- **Claude Desktop** - Anthropic's desktop application

**How it works**: Each AI client connects via STDIO, receiving access to all your configured MCP servers through one connection. The proxy handles:
- Tool prefixing to prevent namespace conflicts
- OAuth authentication for MCP servers
- Activity logging and notifications
- Unified error handling

#### **SDK Support - Multi-Language Integration**
Direct programmatic access through official SDKs:

- **JavaScript/TypeScript SDK** (`@pluggedin/sdk`) - Full-featured SDK for Node.js and browser
- **Python SDK** (`pluggedin-sdk`) - Pythonic interface for AI workflows
- **Go SDK** (`pluggedin-go`) - High-performance Go implementation

**Use Cases**:
```javascript
// Create documents programmatically
const doc = await client.documents.create({
  title: "API Analysis",
  content: "...",
  source: "api"
});

// Query RAG knowledge base
const results = await client.rag.query("How do we handle auth?");
```

#### **Platform Core Features**
The plugged.in web platform provides:

1. **Knowledge Base (RAG)**
   - Semantic search across all documents
   - AI-powered question answering
   - Project-scoped isolation
   - Sub-second query performance

2. **Document Store**
   - Version control for AI-generated content
   - Multi-model attribution tracking
   - Content hash deduplication
   - Support for uploads, AI-generated, and API sources

3. **MCP Registry**
   - 1,500+ curated MCP servers
   - GitHub verification and claiming
   - Install tracking and trending
   - Auto-discovery from npm, GitHub, Smithery

4. **Tools Management**
   - Discover tools from all connected servers
   - Test tools in interactive playground
   - Custom instructions per server
   - Real-time debugging logs

### 🟡 In Development (Dashed Lines)

#### **Native Connectors**
Direct integrations bypassing the MCP Proxy for enhanced performance:

- **Plugged.in Connector for Claude Desktop** - Native plugin architecture
- **Plugged.in Connector for ChatGPT** - OpenAI plugin integration
- **Mobile App** - iOS and Android native apps

**Why Native Connectors?**
- Faster response times (no proxy overhead)
- Richer UI integration
- Platform-specific features
- Offline capabilities

#### **Advanced Memory System**
Persistent memory across sessions:

- **Knowledge + Memory** boxes in the diagram represent:
  - Session continuity across different AI clients
  - Automatic context injection based on conversation history
  - Cross-model memory sharing (Claude remembers what GPT discussed)
  - Smart context pruning to stay within token limits

**Example Workflow**:
1. Discuss architecture with Claude Desktop → Memory saved
2. Switch to ChatGPT connector → Previous context automatically available
3. Mobile app accesses same conversation history
4. RAG provides relevant documents automatically

### 📊 Data Flow Example

**User Request Flow**:
```
1. User asks question in Claude Desktop
2. MCP Proxy receives request
3. Proxy checks RAG for relevant context
4. Combines context + user question
5. Routes to appropriate MCP servers
6. Aggregates responses
7. Logs activity to database
8. Returns enriched response to user
```

**Document Creation Flow**:
```
1. AI generates document via SDK
2. Content processed and sanitized
3. Model attribution recorded
4. Version created in Document Store
5. Vectors generated for RAG
6. Document searchable immediately
```

### 🔒 Security Architecture

All connections use:
- **End-to-end encryption** (AES-256-GCM)
- **Per-profile encryption keys** (workspace isolation)
- **Redis rate limiting** with memory fallback
- **Sandboxed execution** (Firejail on Linux)
- **OAuth 2.1** for external services

### 📈 Scalability

The architecture supports:
- **Horizontal scaling** of MCP Proxy instances
- **Database connection pooling** for PostgreSQL
- **Redis caching** for frequently accessed data
- **CDN integration** for static assets
- **Background job processing** for heavy operations

---

## 📚 Documentation

Visit our comprehensive documentation at [docs.plugged.in](https://docs.plugged.in)

### For Users
- [Getting Started](https://docs.plugged.in/introduction) - Platform overview and quick start
- [Installation Guide](https://docs.plugged.in/quickstart/installation) - Step-by-step setup instructions
- [Document Library](https://docs.plugged.in/platform/document-library) - Managing your AI knowledge base
- [RAG Knowledge Base](https://docs.plugged.in/tutorials/rag-knowledge-base) - Setting up RAG for AI context
- [Team Collaboration](https://docs.plugged.in/tutorials/team-collaboration) - Working with your team

### For Developers
- [API Reference](https://docs.plugged.in/api/reference) - Complete API documentation
- [API Authentication](https://docs.plugged.in/api/authentication) - API key and authentication guide
- [Self-Hosting Guide](https://docs.plugged.in/tutorials/self-hosting) - Deploy your own instance
- [Docker Deployment](https://docs.plugged.in/deployment/docker) - Container-based deployment
- [Security Overview](https://docs.plugged.in/security/overview) - Security best practices

### MCP Integration
- [MCP Proxy Overview](https://docs.plugged.in/mcp-proxy/overview) - Understanding the proxy architecture
- [MCP Proxy Installation](https://docs.plugged.in/mcp-proxy/installation) - Setting up the proxy
- [Custom MCP Servers](https://docs.plugged.in/tutorials/custom-mcp-server) - Building your own servers

---

## 🛠️ Installation Options

### Requirements
- Node.js 18+ (20+ recommended)
- PostgreSQL 15+
- Redis (optional, for rate limiting)
- Docker & Docker Compose (for containerized deployment)

### Environment Variables

Create a `.env` file with:

```bash
# Core (Required)
DATABASE_URL=postgresql://user:pass@localhost:5432/pluggedin
NEXTAUTH_URL=http://localhost:12005
NEXTAUTH_SECRET=your-secret-key # Generate: openssl rand -base64 32

# Security (Required)
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY= # Generate: openssl rand -base64 32

# Features (Optional)
ENABLE_RAG=true
ENABLE_NOTIFICATIONS=true
ENABLE_EMAIL_VERIFICATION=true
REDIS_URL=redis://localhost:6379  # For Redis rate limiting

# Email (For notifications)
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587
EMAIL_FROM=noreply@example.com

# Performance (Optional)
RAG_CACHE_TTL_MS=60000  # Cache TTL in milliseconds
```

### Manual Installation

```bash
# Install dependencies
pnpm install

# Setup database
pnpm db:migrate:auth
pnpm db:generate
pnpm db:migrate

# Build for production
NODE_ENV=production pnpm build

# Start the server
pnpm start
```

---

## 🔌 MCP Proxy Integration

Connect your AI clients to plugged.in:

### Claude Desktop

```json
{
  "mcpServers": {
    "pluggedin": {
      "command": "npx",
      "args": ["-y", "@pluggedin/pluggedin-mcp-proxy@latest"],
      "env": {
        "PLUGGEDIN_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor IDE

```bash
npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key YOUR_API_KEY
```

---

## 🎯 Use Cases

### For Developers
- **Code Review Memory**: Keep AI code reviews across sessions
- **Documentation Generation**: Auto-generate and version technical docs
- **Bug Analysis Archive**: Store AI debugging sessions for future reference

### For Teams
- **Knowledge Base**: Build institutional memory from AI interactions
- **Meeting Summaries**: AI-generated summaries with full attribution
- **Strategy Documents**: Collaborative AI-assisted planning with version control

### For Enterprises
- **Compliance Tracking**: Full audit trail of AI-generated content
- **Multi-Model Workflows**: Orchestrate different AIs for complex tasks
- **Secure Deployment**: Self-host with complete data control

---

## 📊 Why Teams Choose plugged.in

| Feature | plugged.in | Traditional AI Chat | MCP Clients Alone |
|---------|------------|-------------------|-------------------|
| Persistent Memory | ✅ Full versioning | ❌ Session only | ❌ No storage |
| Multi-Model Support | ✅ All models | ⚠️ Single vendor | ✅ Multiple |
| Document Management | ✅ Complete CMS | ❌ None | ❌ None |
| Attribution Tracking | ✅ Full audit trail | ❌ None | ❌ None |
| Team Collaboration | ✅ Built-in | ❌ None | ❌ Limited |
| Self-Hostable | ✅ Yes | ⚠️ Varies | ✅ Yes |
| RAG Integration | ✅ Native | ⚠️ Limited | ❌ None |

---

## 🤝 Community & Support

- **GitHub Discussions**: [Join the conversation](https://github.com/orgs/VeriTeknik/discussions)
- **GitHub Issues**: [Bug reports and feature requests](https://github.com/VeriTeknik/pluggedin-app/issues)
- **Reddit**: [r/plugged_in](https://www.reddit.com/r/plugged_in/)
- **Twitter/X**: [@PluggedIntoAI](https://x.com/PluggedIntoAI)
- **Email**: team@plugged.in

### Contributing

We love contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/pluggedin-app.git
cd pluggedin-app
pnpm install
pnpm dev
```

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built on top of these amazing projects:
- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Next.js](https://nextjs.org/) for the web framework
- [PostgreSQL](https://www.postgresql.org/) for reliable data storage
- All the MCP server creators in our community

---

## 📝 Release Notes

**Latest Release: v2.15.0** - Multi-Select Filtering & Security Hardening

### 🎯 What's New in v2.15.0

**🔍 Enhanced Registry Search & Filtering**
- **Multi-Select Package Type Filtering**: Select multiple package registries simultaneously (npm, PyPI, Docker/OCI, MCPB, NuGet)
- **Smart Default Filters**: Automatically pre-selects npm and PyPI packages for optimal compatibility
- **Intelligent Notices**: Context-aware warnings when selecting package types with limited support
- **Improved UX**: Visual badges show active filters with individual removal options

**🔒 Security Hardening**
- **Input Validation**: Comprehensive validation of all user inputs with regex patterns and whitelisting
- **DoS Prevention**: Rate limiting with maximum input size constraints (max 10 registries)
- **XSS Protection**: Enhanced sanitization of user-provided data
- **Type Safety**: Strict TypeScript typing with validated enums

**⚡ Performance Optimizations**
- **Set-Based Filtering**: O(1) lookup performance instead of O(n) for package registry filtering
- **Reduced Code Duplication**: 83% reduction in checkbox handler code (65 lines → 11 lines)
- **Efficient Client-Side Filtering**: Smart filtering only when multiple registries selected

**♿ Accessibility Improvements**
- **ARIA Labels**: All interactive elements now have descriptive labels for screen readers
- **Keyboard Navigation**: Enhanced keyboard support for multi-select filters

**🛡️ Code Quality**
- **Error Handling**: Comprehensive null/undefined checks for edge cases
- **State Management**: Functional updates prevent race conditions
- **Maintainability**: Extracted reusable constants and handler functions

### Code Quality Score: 9.0/10 ⬆️ (up from 6.5/10)

View the full changelog and release notes at [docs.plugged.in/releases](https://docs.plugged.in/releases/changelog)

---

<div align="center">

**Ready to give your AI permanent memory?**

[🚀 **Start Now**](https://plugged.in) • [⭐ **Star on GitHub**](https://github.com/VeriTeknik/pluggedin-app/stargazers)

*If you find plugged.in useful, please star the repo - it helps others discover the project!*

</div>