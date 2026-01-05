/**
 * Seed script for OpenCode IDE Template
 *
 * VSCode in browser with AI coding agent via terminal.
 * Uses code-server with OpenCode CLI pre-installed.
 *
 * Run with: pnpm tsx scripts/seed-opencode-ide-template.ts
 */

import { db } from '../db';
import { agentTemplatesTable } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const OPENCODE_IDE_TEMPLATE = {
  namespace: 'veriteknik',
  name: 'opencode-ide',
  version: '1.0.0',
  display_name: 'OpenCode IDE',
  description: 'VSCode in browser with AI coding agent. Full IDE experience with OpenCode terminal integration.',
  long_description: `# OpenCode IDE

A complete development environment in your browser with AI-powered coding assistance.

## What You Get

- **VSCode in Browser**: Full-featured VS Code editor via code-server
- **OpenCode AI Agent**: Powerful AI coding assistant in the integrated terminal
- **Persistent Workspace**: Your files are saved in a persistent volume
- **Model Router Integration**: Access to multiple AI models without managing API keys

## How It Works

1. **Access Your IDE**: Open your agent URL to get a full VSCode experience
2. **Use OpenCode**: Open the terminal and run \`opencode\` to start your AI coding session
3. **AI-Powered Development**: Ask OpenCode to write code, fix bugs, explain concepts, and more

## Features

- ✅ Full VSCode experience with extensions
- ✅ Integrated terminal with OpenCode CLI
- ✅ Persistent workspace storage (10Gi default)
- ✅ Password-protected access
- ✅ Multiple AI model support via Model Router
- ✅ MCP tool integration via Plugged.in Hub

## Lifecycle Management

This agent uses PAP lifecycle management to optimize costs:

| Mode | Heartbeat | Description |
|------|-----------|-------------|
| **ACTIVE** | 5s | User is actively using the IDE |
| **IDLE** | 30s | No activity for 30 minutes |
| **SLEEP** | 15m | Minimal resources, quick wake-up |

Essential containers (pap-client, agent-api) never shut down.
UI containers scale down after idle timeout to save resources.

## Resource Requirements

| State | CPU | Memory |
|-------|-----|--------|
| Active | 350m | 1Gi |
| Idle | 200m | 512Mi |
| Sleep | 50m | 64Mi |

## Included Extensions

- Prettier - Code Formatter
- ESLint - JavaScript Linting
- GitLens - Git Supercharged
- GitHub Copilot (optional)
- Python
- Tailwind CSS IntelliSense

## Getting Started

1. Deploy this template from the Agent Marketplace
2. Set a secure password for UI access
3. Select your preferred AI model
4. Wait for deployment (usually 30-60 seconds)
5. Click your agent URL to access VSCode
6. Open terminal and run \`opencode\` to start coding with AI!
`,
  icon_url: 'https://raw.githubusercontent.com/VeriTeknik/opencode/main/packages/web/public/logo.svg',
  banner_url: 'https://raw.githubusercontent.com/VeriTeknik/opencode/main/docs/banner.png',
  docker_image: 'ghcr.io/veriteknik/code-server-opencode:latest',
  container_port: 8443,
  health_endpoint: '/healthz',
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
      env_var: 'PASSWORD',
      validation: { minLength: 8 },
      ui: {
        label: 'Access Password',
        description: 'Password to access your IDE (minimum 8 characters)',
        placeholder: 'Enter a secure password',
        help_text: 'This password protects access to your VSCode IDE',
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
        help_text: 'You can change the model during OpenCode sessions',
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
  _multi_container: {
    template_type: 'opencode-ide',
    containers: [
      {
        name: 'code-server',
        image: 'ghcr.io/veriteknik/code-server-opencode:latest',
        port: 8443,
        essential: false,
        idle_timeout: '30m',
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
      { name: 'opencode-config', type: 'configmap' },
    ],
    routing: {
      '/': { target: 'code-server', port: 8443 },
      '/api': { target: 'agent-api', port: 8080 },
      '/health': { target: 'agent-api', port: 8080 },
      '/metrics': { target: 'agent-api', port: 9090 },
    },
  },
  tags: ['ai', 'development', 'vscode', 'ide', 'coding', 'opencode', 'terminal'],
  category: 'development',
  is_public: true,
  is_verified: true,
  is_featured: true,
  repository_url: 'https://github.com/VeriTeknik/opencode',
  documentation_url: 'https://docs.plugged.in/agents/opencode-ide',
};

async function seedOpenCodeIdeTemplate() {
  console.log('🖥️  Seeding OpenCode IDE template...\n');

  try {
    // Check if template already exists
    const existingTemplate = await db.query.agentTemplatesTable.findFirst({
      where: and(
        eq(agentTemplatesTable.namespace, OPENCODE_IDE_TEMPLATE.namespace),
        eq(agentTemplatesTable.name, OPENCODE_IDE_TEMPLATE.name)
      ),
    });

    if (existingTemplate) {
      console.log('⚠️  OpenCode IDE template already exists');
      console.log(`   UUID: ${existingTemplate.uuid}`);
      console.log(`   Version: ${existingTemplate.version}`);

      // Update template
      console.log('\n📝 Updating template content...');
      await db
        .update(agentTemplatesTable)
        .set({
          version: OPENCODE_IDE_TEMPLATE.version,
          display_name: OPENCODE_IDE_TEMPLATE.display_name,
          description: OPENCODE_IDE_TEMPLATE.description,
          long_description: OPENCODE_IDE_TEMPLATE.long_description,
          docker_image: OPENCODE_IDE_TEMPLATE.docker_image,
          container_port: OPENCODE_IDE_TEMPLATE.container_port,
          health_endpoint: OPENCODE_IDE_TEMPLATE.health_endpoint,
          env_schema: OPENCODE_IDE_TEMPLATE.env_schema,
          configurable: OPENCODE_IDE_TEMPLATE.configurable,
          icon_url: OPENCODE_IDE_TEMPLATE.icon_url,
          banner_url: OPENCODE_IDE_TEMPLATE.banner_url,
          tags: OPENCODE_IDE_TEMPLATE.tags,
          category: OPENCODE_IDE_TEMPLATE.category,
          repository_url: OPENCODE_IDE_TEMPLATE.repository_url,
          documentation_url: OPENCODE_IDE_TEMPLATE.documentation_url,
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
        ...OPENCODE_IDE_TEMPLATE,
        configurable: OPENCODE_IDE_TEMPLATE.configurable,
      })
      .returning();

    console.log('✅ OpenCode IDE template created successfully');
    console.log(`   UUID: ${template.uuid}`);
    console.log(`   Namespace: ${template.namespace}`);
    console.log(`   Name: ${template.name}`);
    console.log(`   Version: ${template.version}`);
    console.log(`   Docker Image: ${template.docker_image}`);
    console.log(`   Category: ${template.category}`);
    console.log(`   Tags: ${template.tags?.join(', ')}`);

    return template.uuid;
  } catch (error) {
    console.error('❌ Error seeding OpenCode IDE template:', error);
    throw error;
  }
}

// Run the seed script
seedOpenCodeIdeTemplate()
  .then((uuid) => {
    console.log('\n🎉 Seed completed successfully!');
    console.log(`📍 Template UUID: ${uuid}`);
    console.log(`🔗 Marketplace URL: /agents/marketplace/veriteknik/opencode-ide`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });
