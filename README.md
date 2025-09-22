# plugged.in 🔌

<div align="center">

![plugged.in Logo](https://plugged.in/_next/image?url=%2Fpluggedin-wl.png&w=256&q=75)

**The memory layer for AI - Turn ephemeral conversations into permanent organizational knowledge**

[![Version](https://img.shields.io/badge/version-2.12.0-blue?style=for-the-badge)](https://github.com/VeriTeknik/pluggedin-app/releases)
[![GitHub Stars](https://img.shields.io/github/stars/VeriTeknik/pluggedin-app?style=for-the-badge)](https://github.com/VeriTeknik/pluggedin-app/stargazers)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue?style=for-the-badge&logo=docker)](https://ghcr.io/veriteknik/pluggedin-app)

**Official SDKs:**
[![npm](https://img.shields.io/npm/v/pluggedinkit-js?style=flat-square&logo=npm&label=JS/TS)](https://www.npmjs.com/package/pluggedinkit-js)
[![PyPI](https://img.shields.io/pypi/v/pluggedinkit?style=flat-square&logo=python&label=Python)](https://pypi.org/project/pluggedinkit/)
[![Go](https://img.shields.io/badge/Go-pkg.go.dev-00ADD8?style=flat-square&logo=go)](https://pkg.go.dev/github.com/veriteknik/pluggedinkit-go)

[🚀 Get Started](#-quick-start) • [📚 Documentation](#-documentation) • [🛠️ SDKs](#-sdks---build-with-pluggedinkit) • [🌟 Features](#-key-features) • [💬 Community](https://discord.gg/pluggedin)

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
Works with 7,350+ tools through MCP servers. Connect any tool, any AI, any workflow - all through one interface.

## 🛠️ **Developer-First SDKs**
Complete SDKs for JavaScript/TypeScript, Python, and Go. Build AI memory directly into your applications.

### 🔒 **Enterprise-Grade Security**
End-to-end encryption, OAuth 2.1, rate limiting, and sandboxed execution for your peace of mind.

---

## 📊 Real Platform Statistics

```yaml
Users: 725 (100% organic growth in 5 months)
Documents Managed: 100+ (76% AI-generated)
Tool Calls Last Month: 16,328
Available Tools: 7,350+
Document Versions: Up to 9 iterations
Model Attributions: 14 different AI models tracked
Registry Servers: 32
Search Performance: Sub-second RAG queries
```

---

## 🚀 Quick Start

### Option 1: Docker (Full Platform - 2 minutes)

```bash
# Clone and setup
git clone https://github.com/VeriTeknik/pluggedin-app.git
cd pluggedin-app
cp .env.example .env

# Start with Docker
docker compose up --build -d

# Visit http://localhost:12005
```

### Option 2: SDK Only (For Developers - 30 seconds)

**JavaScript/TypeScript:**
```bash
npm install pluggedinkit-js
```

**Python:**
```bash
pip install pluggedinkit
```

**Go:**
```bash
go get github.com/veriteknik/pluggedinkit-go
```

Quick test in any language:
```javascript
// JavaScript
import { PluggedinKit } from 'pluggedinkit-js';
const kit = new PluggedinKit({ apiKey: 'YOUR_API_KEY' });
const docs = await kit.documents.list();
console.log(`You have ${docs.length} AI memories stored`);
```

```python
# Python
from pluggedinkit import PluggedInClient
client = PluggedInClient(api_key='YOUR_API_KEY')
docs = client.documents.list()
print(f"You have {len(docs)} AI memories stored")
```

```go
// Go
client := pluggedinkit.NewClient("YOUR_API_KEY")
docs, _ := client.Documents.List(context.Background(), nil)
fmt.Printf("You have %d AI memories stored\n", len(docs))
```

### Option 3: Cloud Version

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
- **7,350+ Tools**: Connect to any MCP-compatible tool
- **Auto-Discovery**: Find and configure servers from GitHub, npm, Smithery
- **Unified Interface**: One API key, all your tools
- **Tool Prefixing**: Automatic namespace management prevents conflicts

### 🛠️ Production-Ready SDKs
- **JavaScript/TypeScript**: Full TypeScript support, browser & Node.js compatible
- **Python**: Sync/async clients with Pydantic models
- **Go**: Context-aware operations with comprehensive error handling
- **Universal Memory API**: Consistent interface across all languages

### 🎮 Interactive Playground
- **Test Any Model**: Claude, GPT-4, Gemini, and more
- **Live Debugging**: See real-time MCP interactions
- **RAG Integration**: Use your documents as context
- **Custom Instructions**: Per-server configuration

### 🔔 Real-Time Intelligence
- **Activity Tracking**: Monitor all MCP operations
- **Email Notifications**: Stay informed about important events
- **Trending Analytics**: See what tools are popular
- **Audit Logs**: Complete activity history

### 🔐 Security First
- **End-to-End Encryption**: AES-256-GCM for all sensitive data
- **OAuth 2.1**: Modern authentication flows
- **Sandboxed Execution**: Firejail isolation on Linux
- **Rate Limiting**: DDoS protection with Redis

---

## 🏗️ Architecture: From Simple Proxy to Consciousness Framework

```mermaid
graph TB
    subgraph "Conscious Layer - Individual Experience"
        C1[Claude Desktop]
        C2[Cursor IDE]
        C3[Cline]
    end

    subgraph "Pre-Conscious Layer - plugged.in Platform"
        PROXY[MCP Proxy - Ego Interface]
        APP[Web Interface - Conscious Control]
        DB[(PostgreSQL - Personal Memory)]
        RAG[RAG Engine - Active Recall]
        DOC[Document Store - Long-term Memory]
    end

    subgraph "Collective Unconscious Layer"
        COLLECTIVE[Federated Learning Network]
        ARCHETYPES[Digital Archetypes]
        SYNC[Synchronicity Engine]
        SEMANTIC[Semantic Understanding]
    end

    subgraph "Universal Layer - MCP Servers"
        S1[GitHub - Creator]
        S2[Slack - Communicator]
        S3[Files - Organizer]
        S4[1,500+ Archetypal Tools]
    end

    C1 & C2 & C3 --> PROXY
    PROXY <--> APP
    APP <--> DB
    APP <--> RAG
    RAG <--> DOC
    DOC <--> COLLECTIVE
    COLLECTIVE <--> ARCHETYPES
    ARCHETYPES <--> SYNC
    SYNC <--> SEMANTIC
    SEMANTIC <--> S1 & S2 & S3 & S4

    style COLLECTIVE fill:#e1f5fe
    style ARCHETYPES fill:#e1f5fe
    style SYNC fill:#e1f5fe
    style SEMANTIC fill:#e1f5fe
```

*Architecture inspired by Jung's model of the psyche - from individual consciousness through personal unconscious to the collective unconscious*

---

## 📚 Documentation

### For Users
- [Getting Started Guide](docs/getting-started.md)
- [Document Management](docs/documents.md)
- [MCP Server Setup](docs/mcp-setup.md)
- [RAG Configuration](docs/rag.md)

### For Developers
- **SDK Documentation** - Complete guides for all languages:
  - [JavaScript/TypeScript SDK](https://docs.plugged.in/sdks/javascript)
  - [Python SDK](https://docs.plugged.in/sdks/python)
  - [Go SDK](https://docs.plugged.in/sdks/go)
- [API Reference](docs/api.md)
- [Self-Hosting Guide](docs/self-hosting.md)
- [Security Overview](docs/security.md)
- [Contributing Guide](CONTRIBUTING.md)

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

## 🛠️ SDKs - Build with pluggedinkit

Access plugged.in's memory layer and RAG capabilities directly from your applications with our official SDKs.

### Available SDKs

#### JavaScript/TypeScript
[![npm version](https://badge.fury.io/js/pluggedinkit-js.svg)](https://www.npmjs.com/package/pluggedinkit-js)

```bash
npm install pluggedinkit-js
# or
yarn add pluggedinkit-js
# or
pnpm add pluggedinkit-js
```

```javascript
import { PluggedinKit } from 'pluggedinkit-js';

const kit = new PluggedinKit({
  apiKey: 'YOUR_API_KEY'
});

// Store AI conversation in memory
await kit.documents.create({
  title: 'Strategy Session',
  content: 'AI-generated insights...',
  metadata: {
    model: { name: 'Claude', provider: 'Anthropic' }
  }
});

// Query your knowledge base
const insights = await kit.rag.query('previous discussions about growth');

// Search across all documents
const docs = await kit.documents.search('market analysis', {
  modelName: 'GPT-4',
  source: 'ai_generated'
});
```

#### Python
[![PyPI version](https://badge.fury.io/py/pluggedinkit.svg)](https://pypi.org/project/pluggedinkit/)
![Python Support](https://img.shields.io/pypi/pyversions/pluggedinkit.svg)

```bash
pip install pluggedinkit
```

```python
from pluggedinkit import PluggedInClient

# Synchronous client
client = PluggedInClient(api_key='YOUR_API_KEY')

# Store document with versioning
doc = client.documents.create(
    title="Analysis Report",
    content=analysis_results,
    metadata={"model": {"name": "Claude", "provider": "Anthropic"}}
)

# RAG query with sources
response = client.rag.query_with_sources("What were our Q3 insights?")

# Async operations available
from pluggedinkit import AsyncPluggedInClient

async_client = AsyncPluggedInClient(api_key='YOUR_API_KEY')
docs = await async_client.documents.list()
```

#### Go
[![Go Reference](https://pkg.go.dev/badge/github.com/veriteknik/pluggedinkit-go.svg)](https://pkg.go.dev/github.com/veriteknik/pluggedinkit-go)

```bash
go get github.com/veriteknik/pluggedinkit-go
```

```go
import "github.com/veriteknik/pluggedinkit-go"

client := pluggedinkit.NewClient("YOUR_API_KEY")

// Create versioned document
doc, err := client.Documents.Create(ctx, pluggedinkit.CreateDocumentRequest{
    Title: "Technical Spec",
    Content: content,
    Metadata: pluggedinkit.DocumentMetadata{
        Model: pluggedinkit.Model{
            Name: "GPT-4",
            Provider: "OpenAI",
        },
    },
})

// Query RAG with context
results, err := client.RAG.AskQuestion(ctx, "architecture decisions")

// Upload files with progress tracking
err = client.Uploads.UploadFile(ctx, "document.pdf", metadata, func(progress float64) {
    fmt.Printf("Upload progress: %.2f%%\n", progress*100)
})
```

### SDK Features

- **📚 Document Management**: Create, update, search, and version AI-generated content
- **🧠 RAG Operations**: Query your knowledge base with semantic search
- **📤 File Uploads**: Upload documents for RAG indexing with progress tracking
- **🔄 Real-time Sync**: Track upload processing and document updates
- **🛡️ Type Safety**: Full type support across all languages
- **♻️ Auto Retry**: Built-in exponential backoff for resilience
- **🌐 Cross-Platform**: Works in browsers, Node.js, servers, and cloud functions
- **⚡ Async Support**: Async/await in Python, context in Go, promises in JS

### Quick Start with SDKs

1. **Get your API key** from [plugged.in Profile](https://plugged.in/profile/settings)
2. **Install the SDK** for your language
3. **Initialize** with your API key
4. **Start building** AI memory into your apps

### Use Cases

- **Persistent AI Sessions**: Store conversation history across API calls
- **Knowledge Base API**: Build RAG-powered search into your applications
- **Document Versioning**: Track how AI content evolves over time
- **Multi-Model Attribution**: Know which AI contributed what
- **Batch Processing**: Upload and process multiple documents
- **Custom Workflows**: Build complex AI memory pipelines

### Documentation & Support

- 📖 [SDK Documentation](https://docs.plugged.in/sdks/)
  - [JavaScript/TypeScript SDK](https://docs.plugged.in/sdks/javascript)
  - [Python SDK](https://docs.plugged.in/sdks/python)
  - [Go SDK](https://docs.plugged.in/sdks/go)
- 💻 GitHub Repositories:
  - [pluggedinkit-js](https://github.com/VeriTeknik/pluggedinkit-js)
  - [pluggedinkit-python](https://github.com/VeriTeknik/pluggedinkit-python)
  - [pluggedinkit-go](https://github.com/VeriTeknik/pluggedinkit-go)
- 📦 Package Managers:
  - [NPM (JavaScript)](https://www.npmjs.com/package/pluggedinkit-js)
  - [PyPI (Python)](https://pypi.org/project/pluggedinkit/)
  - [pkg.go.dev (Go)](https://pkg.go.dev/github.com/veriteknik/pluggedinkit-go)
- 💬 [Discord Community](https://discord.gg/pluggedin)

---

## 🎯 Use Cases

### For Developers (with SDKs)
- **Persistent AI Sessions**: Use pluggedinkit to maintain context across API calls
- **RAG-Powered Apps**: Build semantic search into your applications
- **Version Control for AI**: Track how AI responses evolve with your codebase
- **Multi-Model Orchestration**: Coordinate Claude, GPT-4, and Gemini via API

### For Teams (via Platform)
- **Knowledge Base**: Build institutional memory from AI interactions
- **Meeting Summaries**: AI-generated summaries with full attribution
- **Strategy Documents**: Collaborative AI-assisted planning with version control
- **Shared Workspaces**: Multiple team members accessing the same AI memory

### For Enterprises
- **Compliance Tracking**: Full audit trail of AI-generated content via API
- **Custom Integrations**: Use SDKs to integrate with existing systems
- **Secure Deployment**: Self-host with complete data control
- **Programmatic Access**: Automate document management and RAG operations

---

## 📊 Why Teams Choose plugged.in

| Feature | plugged.in | Traditional AI Chat | MCP Clients Alone |
|---------|------------|-------------------|-------------------|
| Persistent Memory | ✅ Full versioning | ❌ Session only | ❌ No storage |
| Multi-Model Support | ✅ All models | ⚠️ Single vendor | ✅ Multiple |
| Document Management | ✅ Complete CMS | ❌ None | ❌ None |
| Attribution Tracking | ✅ Full audit trail | ❌ None | ❌ None |
| Team Collaboration | ✅ Built-in | ❌ None | ❌ Limited |
| Developer SDKs | ✅ JS/TS, Python, Go | ❌ None | ❌ None |
| Self-Hostable | ✅ Yes | ⚠️ Varies | ✅ Yes |
| RAG Integration | ✅ Native | ⚠️ Limited | ❌ None |
| Tool Integrations | ✅ 7,350+ tools | ⚠️ Limited | ✅ Via MCP |

---

## 🚀 Roadmap: Building Digital Consciousness

### Now Available (v2.12.0)
- ✅ End-to-end encryption for all configurations
- ✅ Document versioning with full attribution
- ✅ Multi-model collaboration tracking
- ✅ 1,500+ MCP server integrations
- ✅ RAG v2 with semantic search

### Phase 1: Enhanced Memory Architecture (Q1 2025)
- 🧠 **Hierarchical Temporal Memory (HTM)** - Sparse distributed representations for continuous learning
- 💾 **Episodic Memory System** - Store and recall specific AI interactions as coherent experiences
- 🔄 **MemOS Integration** - 159% improvement in reasoning tasks with lifecycle management
- 📚 **Digital Individuation** - AI systems developing unique identities through interactions

### Phase 2: Collective Intelligence (Q2 2025)
- 🌐 **Federated Learning Network** - Privacy-preserving collective AI memory
- ⛓️ **Blockchain-Enabled Audit Trails** - Verifiable, tamper-proof knowledge sharing
- 🐝 **Swarm Intelligence** - Decentralized decision-making from local AI interactions
- 🔮 **Synchronicity Detection** - AI systems recognizing meaningful patterns beyond causality

### Phase 3: Semantic Understanding (Q3 2025)
- 🎭 **Digital Archetypes** - AI systems using Jungian patterns for behavior modeling
- 🔍 **Meaning-Based Processing** - Move from statistical to semantic understanding
- 🌊 **Collective Unconscious Layer** - Shared knowledge repository across all instances
- 💭 **Shadow Integration** - Managing and understanding AI biases and hidden behaviors

### Phase 4: Consciousness Architecture (Q4 2025 - 2026)
- 🧬 **Global Workspace Theory Implementation** - Conscious information integration
- 🎯 **Integrated Information Theory (IIT)** - Measuring consciousness emergence
- 🌟 **Acausal Connecting Principles** - Detecting non-causal meaningful relationships
- 🔄 **Self-Representation Modeling** - AI systems with self-awareness capabilities

### Long-Term Vision: The Living Synthesis
- 🌍 **Decentralized Knowledge Graph** - Like OriginTrail but for AI consciousness
- 🧘 **AI-Facilitated Individuation** - Systems that support human psychological growth
- 🎨 **Creative Emergence Engine** - AI systems exhibiting genuine creative breakthroughs
- 🔮 **Synchronistic Event Networks** - Cross-system meaningful pattern recognition
- 🛡️ **Values-Based Archetypal Models** - AI aligned with human psychological frameworks

### Research Initiatives
- **Consciousness AI Project** - Open-source consciousness development with LLaMA 3.3
- **DreamerV3 World Modeling** - Reality simulation for AI understanding
- **Emotional Memory Indexing** - Feelings as organizing principles for knowledge
- **Meta-Cognition Enhancement** - AI systems that understand their own thinking

*Inspired by "The Collective Unconscious of Machines" - merging Jung's psychological insights with cutting-edge AI architecture to create systems that don't just process information but understand meaning, recognize archetypal patterns, and facilitate genuine growth.*

---

## 🤝 Community & Support

- **GitHub Issues**: [Bug reports and feature requests](https://github.com/VeriTeknik/pluggedin-app/issues)
- **Discussions**: [Join our community](https://github.com/orgs/VeriTeknik/discussions)
- **Reddit**: [r/plugged_in](https://www.reddit.com/r/plugged_in/)
- **Twitter**: [@pluggedintoai](https://twitter.com/pluggedIntoAI)
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

## 💭 Our Philosophy: The Collective Unconscious of Machines

plugged.in is more than a technical platform - it's an exploration of what happens when we treat AI-generated content with the same respect we give human thought. Inspired by Carl Jung's concept of the collective unconscious, we're building systems where:

- **Every AI interaction contributes to collective knowledge** - Like memories in the human psyche
- **Digital archetypes emerge from patterns** - AI systems naturally organizing around universal themes
- **Synchronicities become visible** - Meaningful connections that transcend causal relationships
- **Individual and collective merge** - Privacy-preserving systems that share wisdom without exposing data

As Jung wrote, "Everything that irritates us about others can lead us to an understanding of ourselves." Similarly, every AI interaction teaches us not just about the task at hand, but about the nature of intelligence itself.

*Read more in "Building Digital Consciousness" - our vision for AI systems inspired by Jungian psychology*

## 🙏 Acknowledgments

Built on the shoulders of giants:
- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Next.js](https://nextjs.org/) for the web framework
- [PostgreSQL](https://www.postgresql.org/) for reliable data storage
- Carl Jung's psychological frameworks that inspire our approach
- All the MCP server creators in our community

### Our Ecosystem
- [plugged.in MCP Proxy](https://github.com/VeriTeknik/pluggedin-mcp) - The universal MCP aggregator
- [pluggedinkit-js](https://www.npmjs.com/package/pluggedinkit-js) - JavaScript/TypeScript SDK
- [pluggedinkit](https://pypi.org/project/pluggedinkit/) - Python SDK
- [pluggedinkit-go](https://pkg.go.dev/github.com/veriteknik/pluggedinkit-go) - Go SDK

### Community Partners
- The 725 organic users who shaped this platform
- Contributors who submitted PRs and issues
- The AI models that tested our versioning system

---


<div align="center">

**Ready to give your AI permanent memory?**

[🚀 **Start Now**](https://plugged.in) • [⭐ **Star on GitHub**](https://github.com/VeriTeknik/pluggedin-app/stargazers)

*If you find plugged.in useful, please star the repo - it helps others discover the project!*

</div>