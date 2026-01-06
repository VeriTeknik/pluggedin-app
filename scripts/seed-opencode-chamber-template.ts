/**
 * Seed script for OpenCode Chamber Template
 *
 * AI-first chat interface with web terminal.
 * Uses OpenChamber UI with OpenCode serve API backend.
 *
 * Run with: pnpm tsx scripts/seed-opencode-chamber-template.ts
 */

import { db } from '../db';
import { agentTemplatesTable } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const OPENCODE_CHAMBER_TEMPLATE = {
  namespace: 'veriteknik',
  name: 'opencode-chamber',
  version: '1.0.0',
  display_name: 'OpenCode Chamber',
  description: 'AI-first chat interface for coding. Clean, modern chat UI with real-time streaming and web terminal.',
  long_description: `# OpenCode Chamber

A modern, AI-first chat interface for coding with OpenCode.

## What You Get

- **Chat UI**: Clean, modern chat interface built with React 19
- **Real-time Streaming**: Watch AI responses stream in real-time
- **Web Terminal**: Full terminal access via ttyd
- **OpenCode API**: Powerful AI coding backend
- **Persistent Workspace**: Your files are saved in a persistent volume

## How It Works

1. **Access Your Agent**: Open your agent URL to get the chat interface
2. **Start Chatting**: Type your coding requests in natural language
3. **View Progress**: Watch as OpenCode writes and edits your code
4. **Use Terminal**: Access \`/terminal\` for full shell access

## Features

- ✅ Modern chat UI with session management
- ✅ Real-time streaming responses
- ✅ Code syntax highlighting
- ✅ Tool execution visualization
- ✅ Web terminal access
- ✅ Persistent workspace storage (10Gi default)
- ✅ Password-protected access
- ✅ Multiple AI model support via Model Router
- ✅ MCP tool integration via Plugged.in Hub

## URL Endpoints

| Path | Description |
|------|-------------|
| \`/\` | Chat UI (OpenChamber) |
| \`/terminal\` | Web terminal (ttyd) |
| \`/opencode\` | OpenCode API |
| \`/api\` | Agent API |
| \`/health\` | Health check |
| \`/metrics\` | Prometheus metrics |

## Lifecycle Management

This agent uses PAP lifecycle management to optimize costs:

| Mode | Heartbeat | Description |
|------|-----------|-------------|
| **ACTIVE** | 5s | User is actively using the chat |
| **IDLE** | 30s | No activity for 30 minutes |
| **SLEEP** | 15m | Minimal resources, quick wake-up |

Essential containers (pap-client, agent-api) never shut down.
UI and API containers scale down after idle timeout to save resources.

## Resource Requirements

| State | CPU | Memory |
|-------|-----|--------|
| Active | 450m | 1.5Gi |
| Idle | 250m | 768Mi |
| Sleep | 50m | 64Mi |

## Getting Started

1. Deploy this template from the Agent Marketplace
2. Set a secure password for UI access
3. Select your preferred AI model
4. Wait for deployment (usually 30-60 seconds)
5. Click your agent URL to access the chat interface
6. Start coding with AI!

## Mobile-Friendly

OpenCode Chamber is designed to work well on mobile devices, making it perfect for:
- Quick code reviews on the go
- AI-assisted debugging from your phone
- Managing your codebase from anywhere
`,
  icon_url: 'https://raw.githubusercontent.com/VeriTeknik/openchamber/main/packages/web/public/logo.svg',
  banner_url: 'https://raw.githubusercontent.com/VeriTeknik/openchamber/main/docs/banner.png',
  docker_image: 'ghcr.io/veriteknik/openchamber:latest',
  container_port: 3000,
  health_endpoint: '/',
  env_schema: {
    // Auto-provided by deployment system
    required: [],
    optional: [],
    defaults: {},
  },
  // Template-driven configuration (ADL v0.2)
  configurable: {
    // UI Password
    ui_password: {
      type: 'password',
      required: true,
      env_var: 'OPENCHAMBER_UI_PASSWORD',
      validation: { minLength: 8 },
      ui: {
        label: 'Access Password',
        description: 'Password to access the chat interface (minimum 8 characters)',
        placeholder: 'Enter a secure password',
        help_text: 'This password protects access to your OpenCode Chamber',
      },
    },
    // Default Model Selection
    default_model: {
      type: 'model-select',
      source: 'model-router',
      required: true,
      default: 'claude-sonnet-4-20250514',
      env_var: 'OPENCODE_DEFAULT_MODEL',
      ui: {
        label: 'Default AI Model',
        description: 'The AI model OpenCode will use by default',
        placeholder: 'Select a model',
        help_text: 'You can change the model during chat sessions',
        show_provider_icons: true,
      },
    },
    // Workspace Storage Size
    workspace_size: {
      type: 'select',
      required: false,
      default: '10Gi',
      options: [
        { value: '5Gi', label: '5 GB' },
        { value: '10Gi', label: '10 GB (Recommended)' },
        { value: '20Gi', label: '20 GB' },
        { value: '50Gi', label: '50 GB' },
      ],
      env_var: 'WORKSPACE_SIZE',
      ui: {
        label: 'Workspace Storage',
        description: 'Persistent storage size for your workspace',
        help_text: 'Cannot be changed after deployment',
      },
    },
  },
  // Multi-container configuration (custom for this template)
  // Each agent gets its own opencode-serve instance for full isolation
  _multi_container: {
    template_type: 'opencode-chamber',
    containers: [
      {
        name: 'openchamber',
        image: 'ghcr.io/veriteknik/openchamber:latest',
        port: 3000,
        essential: false,
        idle_timeout: '30m',
      },
      {
        name: 'opencode-serve',
        image: 'ghcr.io/veriteknik/opencode-server:latest',
        port: 4000,
        essential: false,
        idle_timeout: '30m',
      },
      {
        name: 'ttyd',
        image: 'tsl0922/ttyd:alpine',
        port: 7681,
        essential: false,
        idle_timeout: '15m',
      },
      {
        name: 'pap-client',
        image: 'ghcr.io/veriteknik/pap-client:latest',
        port: 9000,
        essential: true,
      },
      {
        name: 'agent-api',
        image: 'ghcr.io/veriteknik/agent-api:latest',
        port: 8080,
        essential: true,
      },
    ],
    init_containers: [
      {
        name: 'opencode-init',
        image: 'ghcr.io/veriteknik/opencode-init:latest',
      },
    ],
    volumes: [
      { name: 'workspace', type: 'pvc', size: '10Gi' },
      { name: 'opencode-config', type: 'emptyDir' }, // Init writes here
    ],
    routing: {
      '/': { target: 'openchamber', port: 3000 },
      '/terminal': { target: 'ttyd', port: 7681 },
      '/opencode': { target: 'opencode-serve', port: 4000 },
      '/api': { target: 'agent-api', port: 8080 },
      '/health': { target: 'agent-api', port: 8080 },
      '/metrics': { target: 'agent-api', port: 9090 },
    },
  },
  tags: ['ai', 'development', 'chat', 'coding', 'opencode', 'terminal', 'mobile'],
  category: 'development',
  is_public: true,
  is_verified: true,
  is_featured: true,
  repository_url: 'https://github.com/VeriTeknik/openchamber',
  documentation_url: 'https://docs.plugged.in/agents/opencode-chamber',
};

async function seedOpenCodeChamberTemplate() {
  console.log('💬 Seeding OpenCode Chamber template...\n');

  try {
    // Check if template already exists
    const existingTemplate = await db.query.agentTemplatesTable.findFirst({
      where: and(
        eq(agentTemplatesTable.namespace, OPENCODE_CHAMBER_TEMPLATE.namespace),
        eq(agentTemplatesTable.name, OPENCODE_CHAMBER_TEMPLATE.name)
      ),
    });

    if (existingTemplate) {
      console.log('⚠️  OpenCode Chamber template already exists');
      console.log(`   UUID: ${existingTemplate.uuid}`);
      console.log(`   Version: ${existingTemplate.version}`);

      // Update template
      console.log('\n📝 Updating template content...');
      await db
        .update(agentTemplatesTable)
        .set({
          version: OPENCODE_CHAMBER_TEMPLATE.version,
          display_name: OPENCODE_CHAMBER_TEMPLATE.display_name,
          description: OPENCODE_CHAMBER_TEMPLATE.description,
          long_description: OPENCODE_CHAMBER_TEMPLATE.long_description,
          docker_image: OPENCODE_CHAMBER_TEMPLATE.docker_image,
          container_port: OPENCODE_CHAMBER_TEMPLATE.container_port,
          health_endpoint: OPENCODE_CHAMBER_TEMPLATE.health_endpoint,
          env_schema: OPENCODE_CHAMBER_TEMPLATE.env_schema,
          configurable: OPENCODE_CHAMBER_TEMPLATE.configurable,
          icon_url: OPENCODE_CHAMBER_TEMPLATE.icon_url,
          banner_url: OPENCODE_CHAMBER_TEMPLATE.banner_url,
          tags: OPENCODE_CHAMBER_TEMPLATE.tags,
          category: OPENCODE_CHAMBER_TEMPLATE.category,
          repository_url: OPENCODE_CHAMBER_TEMPLATE.repository_url,
          documentation_url: OPENCODE_CHAMBER_TEMPLATE.documentation_url,
          updated_at: new Date(),
        })
        .where(eq(agentTemplatesTable.uuid, existingTemplate.uuid));

      console.log('✅ Template updated successfully');
      return existingTemplate.uuid;
    }

    // Create new template
    const [template] = await db
      .insert(agentTemplatesTable)
      .values({
        ...OPENCODE_CHAMBER_TEMPLATE,
        configurable: OPENCODE_CHAMBER_TEMPLATE.configurable,
      })
      .returning();

    console.log('✅ OpenCode Chamber template created successfully');
    console.log(`   UUID: ${template.uuid}`);
    console.log(`   Namespace: ${template.namespace}`);
    console.log(`   Name: ${template.name}`);
    console.log(`   Version: ${template.version}`);
    console.log(`   Docker Image: ${template.docker_image}`);
    console.log(`   Category: ${template.category}`);
    console.log(`   Tags: ${template.tags?.join(', ')}`);

    return template.uuid;
  } catch (error) {
    console.error('❌ Error seeding OpenCode Chamber template:', error);
    throw error;
  }
}

// Run the seed script
seedOpenCodeChamberTemplate()
  .then((uuid) => {
    console.log('\n🎉 Seed completed successfully!');
    console.log(`📍 Template UUID: ${uuid}`);
    console.log(`🔗 Marketplace URL: /agents/marketplace/veriteknik/opencode-chamber`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });
