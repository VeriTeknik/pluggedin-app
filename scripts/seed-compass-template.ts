/**
 * Seed script for Compass Agent Template (first marketplace template)
 * Run with: pnpm tsx scripts/seed-compass-template.ts
 */

import { db } from '../db';
import { agentTemplatesTable } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const COMPASS_TEMPLATE = {
  namespace: 'veriteknik',
  name: 'compass',
  version: '1.1.0',
  display_name: 'Compass - AI Jury',
  description: 'Multi-model consensus agent for trusted research. Query GPT-4, Claude, and Gemini simultaneously and get a verified answer.',
  long_description: `# Compass - AI Jury/Oracle

Compass is a consensus-based AI agent that queries multiple language models simultaneously and synthesizes their responses into a unified, trustworthy answer.

## How It Works

1. **Multi-Model Querying**: Your question is sent to GPT-4, Claude, and Gemini in parallel
2. **Consensus Analysis**: Responses are compared using TF-IDF semantic similarity
3. **Verdict Generation**: Based on agreement scores, you get one of three verdicts:
   - **Unanimous (≥90% agreement)**: All models agree - high confidence
   - **Split (60-90% agreement)**: Majority agrees with noted dissent
   - **No Consensus (<60% agreement)**: Significant disagreement - low confidence

## Use Cases

- **Research Verification**: Get multi-perspective answers for academic research
- **Fact Checking**: Cross-reference claims across different AI models
- **Decision Support**: Make informed decisions with consensus-backed answers
- **Content Validation**: Verify content accuracy before publication

## API Endpoints

\`\`\`
POST /query
{
  "question": "What is the capital of France?",
  "models": ["gpt-4o", "claude", "gemini"]
}
\`\`\`

## Shareable Verdicts

Each query generates a shareable URL that can be posted to social media or shared with colleagues.

## PAP Compliance

Compass is fully PAP-RFC-001 compliant:
- ✅ Heartbeat/Metrics separation (zombie prevention)
- ✅ Normative lifecycle states
- ✅ DNS-based identity
- ✅ Model Router integration (no direct API keys)
`,
  icon_url: 'https://plugged.in/agents/compass/icon.png',
  banner_url: 'https://plugged.in/agents/compass/banner.png',
  docker_image: 'ghcr.io/veriteknik/compass-agent:latest',
  container_port: 3000,
  health_endpoint: '/health',
  env_schema: {
    // These are automatically provided by the deployment system:
    // PAP_STATION_URL, PAP_AGENT_ID, PAP_AGENT_KEY, PLUGGEDIN_API_URL, PLUGGEDIN_API_KEY
    required: [],
    optional: ['BASE_URL', 'PORT'],
    defaults: {
      PORT: '3000',
    },
  },
  // Template-driven configuration (ADL v0.2)
  configurable: {
    models: {
      type: 'multi-select',
      source: 'model-router',
      multi_select_constraints: {
        min: 2,
        max: 4,
      },
      default: ['gpt-4o', 'claude-3-5-sonnet-20241022', 'gemini-1.5-flash'],
      env_var: 'COMPASS_MODELS',
      required: true,
      ui: {
        label: 'AI Models',
        description: 'Select AI models for consensus voting (2-4 models)',
        placeholder: 'Select models',
        help_text: 'Choose 2 to 4 models for multi-perspective consensus analysis',
        show_provider_icons: true,
      },
    },
  },
  tags: ['ai', 'research', 'consensus', 'multi-model', 'fact-check', 'jury', 'oracle'],
  category: 'research',
  is_public: true,
  is_verified: true,
  is_featured: true,
  // TODO: Update repository URL once repo is pushed to GitHub
  repository_url: 'https://github.com/pluggedin-app/compass-agent',
  documentation_url: 'https://docs.plugged.in/agents/compass',
};

async function seedCompassTemplate() {
  console.log('🧭 Seeding Compass agent template...\n');

  try {
    // Check if template already exists (by namespace + name for uniqueness)
    const existingTemplate = await db.query.agentTemplatesTable.findFirst({
      where: and(
        eq(agentTemplatesTable.namespace, COMPASS_TEMPLATE.namespace),
        eq(agentTemplatesTable.name, COMPASS_TEMPLATE.name)
      ),
    });

    if (existingTemplate) {
      console.log('⚠️  Compass template already exists');
      console.log(`   UUID: ${existingTemplate.uuid}`);
      console.log(`   Version: ${existingTemplate.version}`);
      console.log(`   Image: ${existingTemplate.docker_image}`);

      // Update only content fields, preserve metadata (install_count, is_verified, etc.)
      console.log('\n📝 Updating template content...');
      await db
        .update(agentTemplatesTable)
        .set({
          // Content updates
          version: COMPASS_TEMPLATE.version,
          display_name: COMPASS_TEMPLATE.display_name,
          description: COMPASS_TEMPLATE.description,
          long_description: COMPASS_TEMPLATE.long_description,
          // Deployment config
          docker_image: COMPASS_TEMPLATE.docker_image,
          container_port: COMPASS_TEMPLATE.container_port,
          health_endpoint: COMPASS_TEMPLATE.health_endpoint,
          env_schema: COMPASS_TEMPLATE.env_schema,
          configurable: COMPASS_TEMPLATE.configurable,
          // Presentation
          icon_url: COMPASS_TEMPLATE.icon_url,
          banner_url: COMPASS_TEMPLATE.banner_url,
          tags: COMPASS_TEMPLATE.tags,
          category: COMPASS_TEMPLATE.category,
          // Links
          repository_url: COMPASS_TEMPLATE.repository_url,
          documentation_url: COMPASS_TEMPLATE.documentation_url,
          // Timestamp
          updated_at: new Date(),
          // NOTE: Preserves: install_count, is_verified, is_featured, is_public, created_at
        })
        .where(eq(agentTemplatesTable.uuid, existingTemplate.uuid));

      console.log('✅ Template updated successfully');
      return existingTemplate.uuid;
    }

    // Create new template
    const [template] = await db
      .insert(agentTemplatesTable)
      .values(COMPASS_TEMPLATE)
      .returning();

    console.log('✅ Compass template created successfully');
    console.log(`   UUID: ${template.uuid}`);
    console.log(`   Namespace: ${template.namespace}`);
    console.log(`   Name: ${template.name}`);
    console.log(`   Version: ${template.version}`);
    console.log(`   Docker Image: ${template.docker_image}`);
    console.log(`   Category: ${template.category}`);
    console.log(`   Tags: ${template.tags?.join(', ')}`);

    return template.uuid;

  } catch (error) {
    console.error('❌ Error seeding Compass template:', error);
    throw error;
  }
}

// Run the seed script
seedCompassTemplate()
  .then((uuid) => {
    console.log('\n🎉 Seed completed successfully!');
    console.log(`📍 Template UUID: ${uuid}`);
    console.log(`🔗 Marketplace URL: /agents/marketplace/veriteknik/compass`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });
