/**
 * Seed script for Compass Agent Template (first marketplace template)
 * Run with: pnpm tsx scripts/seed-compass-template.ts
 */

import { db } from '../db';
import { agentTemplatesTable } from '../db/schema';
import { eq } from 'drizzle-orm';

const COMPASS_TEMPLATE = {
  namespace: 'veriteknik',
  name: 'compass',
  version: '1.0.0',
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
  docker_image: 'ghcr.io/veriteknik/compass-agent:v1.0.0',
  container_port: 3000,
  health_endpoint: '/health',
  env_schema: {
    required: ['PAP_STATION_URL', 'PAP_AGENT_ID', 'PAP_AGENT_KEY', 'PLUGGEDIN_API_URL', 'PLUGGEDIN_API_KEY'],
    optional: ['BASE_URL', 'PORT'],
    defaults: {
      PORT: '3000',
    },
  },
  tags: ['ai', 'research', 'consensus', 'multi-model', 'fact-check', 'jury', 'oracle'],
  category: 'research',
  is_public: true,
  is_verified: true,
  is_featured: true,
  repository_url: 'https://github.com/VeriTeknik/PAP/tree/main/compass-agent',
  documentation_url: 'https://docs.plugged.in/agents/compass',
};

async function seedCompassTemplate() {
  console.log('🧭 Seeding Compass agent template...\n');

  try {
    // Check if template already exists
    const existingTemplate = await db.query.agentTemplatesTable.findFirst({
      where: eq(agentTemplatesTable.name, 'compass'),
    });

    if (existingTemplate) {
      console.log('⚠️  Compass template already exists');
      console.log(`   UUID: ${existingTemplate.uuid}`);
      console.log(`   Version: ${existingTemplate.version}`);
      console.log(`   Image: ${existingTemplate.docker_image}`);

      // Update to latest version
      console.log('\n📝 Updating template to latest version...');
      await db
        .update(agentTemplatesTable)
        .set({
          ...COMPASS_TEMPLATE,
          updated_at: new Date(),
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
