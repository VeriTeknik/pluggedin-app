/**
 * Seed script for PAP (Plugged.in Agent Protocol) blog post
 * Run with: pnpm tsx scripts/seed-pap-blog-post.ts
 */

import { db } from '../db';
import { blogPostsTable, blogPostTranslationsTable, users, BlogPostStatus, BlogPostCategory } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';

let PAP_POST_UUID: string;

async function seedPAPBlogPost() {
  console.log('🌱 Seeding PAP blog post...');

  try {
    // Find admin user (first try admin, then fall back to any user)
    let authorUser = await db.query.users.findFirst({
      where: eq(users.is_admin, true),
    });

    if (!authorUser) {
      console.log('⚠️  No admin user found, trying to use first available user...');
      authorUser = await db.query.users.findFirst();

      if (!authorUser) {
        console.error('❌ No users found in database. Please create a user first.');
        console.error('💡 You can register a user by visiting: http://localhost:12005/register');
        process.exit(1);
      }

      console.log(`⚠️  Using non-admin user: ${authorUser.email}`);
      console.log('💡 Consider setting is_admin = true for this user in the database');
    } else {
      console.log(`✅ Found admin user: ${authorUser.email}`);
    }

    // Check if post already exists
    const existingPost = await db.query.blogPostsTable.findFirst({
      where: eq(blogPostsTable.slug, 'introducing-pap-agent-ecosystem'),
    });

    if (existingPost) {
      console.log('⚠️  Post already exists, skipping creation and using existing UUID');
      // Use existing post UUID instead
      PAP_POST_UUID = existingPost.uuid;
    } else {
      // Create the blog post
      const [createdPost] = await db.insert(blogPostsTable).values({
      slug: 'introducing-pap-agent-ecosystem',
      author_id: authorUser.id,
      status: BlogPostStatus.PUBLISHED,
      category: BlogPostCategory.ANNOUNCEMENT,
      is_featured: true,
      published_at: new Date(),
      reading_time_minutes: 8,
      view_count: 0,
      tags: ['PAP', 'Agent Protocol', 'Autonomous Agents', 'Specification', 'MCP'],
      }).returning();

      PAP_POST_UUID = createdPost.uuid;
      console.log('✅ Created blog post');
    }

    // Check if English translation already exists
    const existingEnTranslation = await db.query.blogPostTranslationsTable.findFirst({
      where: and(
        eq(blogPostTranslationsTable.blog_post_uuid, PAP_POST_UUID),
        eq(blogPostTranslationsTable.language, 'en')
      ),
    });

    if (!existingEnTranslation) {
      // English translation
      await db.insert(blogPostTranslationsTable).values({
        uuid: uuidv4(),
        blog_post_uuid: PAP_POST_UUID,
        language: 'en',
        title: 'Introducing PAP: The Plugged.in Agent Protocol Ecosystem Specification',
        excerpt: 'A comprehensive framework for autonomous agent lifecycle management, bringing structure, security, and interoperability to the agent ecosystem.',
        content: `# Introducing PAP: The Plugged.in Agent Protocol

We're excited to announce the **Plugged.in Agent Protocol (PAP)** v1.0 Stable Candidate - a comprehensive framework designed to revolutionize how autonomous agents are managed, deployed, and orchestrated in production environments.

## The Problem

As AI agents become more sophisticated and widespread, the industry faces critical challenges:

- **Zombie Agents**: Agents that continue running without proper monitoring or control
- **Security Concerns**: Lack of standardized authentication and authorization
- **Lifecycle Chaos**: No clear standards for agent provisioning, draining, and termination
- **Interoperability Issues**: Difficulty integrating agents across different frameworks

## The Solution: PAP Protocol

PAP addresses these challenges with a dual-profile architecture:

### PAP-CP (Control Plane)
The normative control profile using **gRPC over HTTP/2** with mutual TLS for:
- Secure agent lifecycle management
- Heartbeat and metrics separation (zombie prevention)
- Exclusive kill authority
- DNS-based service discovery with DNSSEC

### PAP-Hooks (Open I/O)
A non-normative I/O profile using **JSON-RPC 2.0** for:
- Native MCP (Model Context Protocol) tool support
- Agent-to-Agent (A2A) peer communication
- OAuth 2.1 authentication
- Framework-agnostic integration (LangChain, CrewAI, etc.)

## Key Features

### 1. Zombie Prevention Superpower
PAP's strict separation of heartbeats and metrics prevents agents from becoming "zombies." Stations have exclusive kill authority, ensuring no rogue agents.

### 2. Normative Lifecycle States
Clear state transitions: **NEW → PROVISIONED → ACTIVE ↔ DRAINING → TERMINATED**

Each state has well-defined entry/exit conditions and allowed operations.

### 3. Protocol Interoperability
- **Native MCP Support**: PAP-Hooks supports MCP tool calls out of the box
- **A2A Communication**: Agents can communicate with each other using standardized protocols
- **Framework Agnostic**: Works with any agent framework (LangChain, CrewAI, AutoGPT, etc.)

### 4. Enterprise-Grade Security
- **mTLS**: Mutual TLS for PAP-CP communications
- **Ed25519 Signatures**: Digital signatures for all control plane operations
- **OAuth 2.1**: Modern authentication for PAP-Hooks
- **DNS-based Identity**: DNSSEC-secured service discovery

### 5. Ownership Transfer
Agents can be seamlessly migrated between stations, maintaining state and credentials.

## Architecture Overview

\`\`\`
┌─────────────────────────────────────────────────────┐
│                    Station                          │
│            (Plugged.in Core Platform)               │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │          PAP Control Plane (gRPC/mTLS)       │  │
│  │  • Lifecycle Management                      │  │
│  │  • Heartbeat/Metrics Separation              │  │
│  │  • Kill Authority                            │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         PAP Hooks (JSON-RPC/OAuth)          │  │
│  │  • MCP Tool Calls                           │  │
│  │  • A2A Communication                         │  │
│  │  • Event Streaming                          │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────┐
│              Autonomous Agents (Shuttles)           │
│                                                     │
│  • LangChain Agents                                 │
│  • CrewAI Agents                                    │
│  • AutoGPT Agents                                   │
│  • Custom Agents                                    │
└─────────────────────────────────────────────────────┘
\`\`\`

## What's Available Now

The PAP v1.0 specification is **complete and available** in our [GitHub repository](https://github.com/veriteknik/PAP):

- **Complete RFC**: Comprehensive specification document (RFC-001)
- **Protocol Buffers**: Full schema definitions
- **Deployment Guide**: Kubernetes reference implementation
- **Security Model**: Detailed authentication and authorization specs
- **Service Registry**: DNS-based discovery documentation

## What's Coming

We're actively developing:

- **TypeScript SDK** (In Progress)
- **Python SDK** (In Progress)
- **Rust SDK** (Planned)
- **Go SDK** (Planned)
- **Reference Implementation**: Complete station and shuttle examples

## Integration with Plugged.in

PAP will be integrated into the Plugged.in platform, allowing you to:

1. **Deploy Agents**: Seamlessly deploy autonomous agents to our infrastructure
2. **Monitor & Control**: Full lifecycle control through our dashboard
3. **MCP Integration**: Leverage our 1,609+ MCP server integrations
4. **RAG Access**: Give agents access to your knowledge base
5. **Multi-Hub Support**: Organize agents across different workspaces

## Get Involved

We believe in open collaboration. Here's how you can participate:

- **Review the Spec**: Check out the [PAP repository](https://github.com/veriteknik/PAP)
- **Provide Feedback**: Open issues or discussions on GitHub
- **Contribute**: Help us build SDKs and reference implementations
- **Stay Updated**: Follow our blog for updates

## Why This Matters

PAP represents a fundamental shift in how we think about autonomous agents:

- **From Chaos to Order**: Clear lifecycle management and state transitions
- **From Insecure to Secure**: Enterprise-grade authentication and authorization
- **From Isolated to Connected**: Native interoperability with MCP and A2A communication
- **From Proprietary to Open**: Framework-agnostic, open specification

## Conclusion

The PAP Agent Ecosystem Specification is our contribution to the autonomous agent community. We're building the infrastructure needed for agents to operate safely, securely, and effectively in production environments.

The specification is ready. The platform is coming. The future of autonomous agents starts now.

---

**Ready to explore PAP?** Visit our [documentation](https://docs.plugged.in) or check out the [GitHub repository](https://github.com/veriteknik/PAP).

Have questions? Join the conversation in our [community discussions](https://github.com/veriteknik/PAP/discussions).`,
      });
      console.log('✅ Created English translation');
    } else {
      console.log('⚠️  English translation already exists, skipping');
    }

    // Check if Turkish translation already exists
    const existingTrTranslation = await db.query.blogPostTranslationsTable.findFirst({
      where: and(
        eq(blogPostTranslationsTable.blog_post_uuid, PAP_POST_UUID),
        eq(blogPostTranslationsTable.language, 'tr')
      ),
    });

    if (!existingTrTranslation) {
      // Turkish translation
      await db.insert(blogPostTranslationsTable).values({
      uuid: uuidv4(),
      blog_post_uuid: PAP_POST_UUID,
      language: 'tr',
      title: 'PAP ile Tanışın: Plugged.in Otonom Ajan Protokol Ekosistemi Spesifikasyonu',
      excerpt: 'Otonom ajan yaşam döngüsü yönetimi için kapsamlı bir çerçeve, ajan ekosistemine yapı, güvenlik ve birlikte çalışabilirlik getiriyor.',
      content: `# PAP ile Tanışın: Plugged.in Ajan Protokolü

**Plugged.in Ajan Protokolü (PAP)** v1.0 Kararlı Adayını duyurmaktan heyecan duyuyoruz - üretim ortamlarında otonom ajanların nasıl yönetildiğini, dağıtıldığını ve düzenlendiğini devrimleştirmek için tasarlanmış kapsamlı bir çerçeve.

## Sorun

Yapay zeka ajanları daha sofistike ve yaygın hale geldikçe, endüstri kritik zorluklarla karşı karşıya:

- **Zombi Ajanlar**: Uygun izleme veya kontrol olmadan çalışmaya devam eden ajanlar
- **Güvenlik Endişeleri**: Standartlaştırılmış kimlik doğrulama ve yetkilendirme eksikliği
- **Yaşam Döngüsü Kaosu**: Ajan sağlama, boşaltma ve sonlandırma için net standartlar yok
- **Birlikte Çalışabilirlik Sorunları**: Farklı çerçeveler arasında ajanları entegre etme zorluğu

## Çözüm: PAP Protokolü

PAP bu zorlukları çift profilli bir mimari ile ele alıyor:

### PAP-CP (Kontrol Düzlemi)
**gRPC over HTTP/2** ile karşılıklı TLS kullanarak normatif kontrol profili:
- Güvenli ajan yaşam döngüsü yönetimi
- Kalp atışı ve metrik ayrımı (zombi önleme)
- Özel sonlandırma yetkisi
- DNSSEC ile DNS tabanlı servis keşfi

### PAP-Hooks (Açık G/Ç)
**JSON-RPC 2.0** kullanan normatif olmayan G/Ç profili:
- Yerel MCP (Model Context Protocol) araç desteği
- Ajan-Ajan (A2A) eş iletişimi
- OAuth 2.1 kimlik doğrulama
- Çerçeve-agnostik entegrasyon (LangChain, CrewAI, vb.)

[İçerik devam ediyor...]`,
      });
      console.log('✅ Created Turkish translation');
    } else {
      console.log('⚠️  Turkish translation already exists, skipping');
    }

    // Add minimal translations for other languages
    const otherLanguages = [
      { lang: 'zh' as const, title: 'PAP简介：Plugged.in代理协议生态系统规范', excerpt: '一个全面的自主代理生命周期管理框架，为代理生态系统带来结构、安全和互操作性。' },
      { lang: 'ja' as const, title: 'PAPの紹介：Plugged.inエージェントプロトコルエコシステム仕様', excerpt: '自律エージェントのライフサイクル管理のための包括的なフレームワーク、エージェントエコシステムに構造、セキュリティ、相互運用性をもたらします。' },
      { lang: 'hi' as const, title: 'PAP का परिचय: Plugged.in एजेंट प्रोटोकॉल इकोसिस्टम स्पेसिफिकेशन', excerpt: 'स्वायत्त एजेंट जीवनचक्र प्रबंधन के लिए एक व्यापक ढांचा, एजेंट पारिस्थितिकी तंत्र में संरचना, सुरक्षा और अंतर-संचालनीयता लाता है।' },
      { lang: 'nl' as const, title: 'Introductie van PAP: De Plugged.in Agent Protocol Ecosysteem Specificatie', excerpt: 'Een uitgebreid raamwerk voor autonoom agentlevenscyclusbeheer, dat structuur, beveiliging en interoperabiliteit naar het agentecosysteem brengt.' },
    ];

    for (const { lang, title, excerpt } of otherLanguages) {
      // Check if translation already exists
      const existingTranslation = await db.query.blogPostTranslationsTable.findFirst({
        where: and(
          eq(blogPostTranslationsTable.blog_post_uuid, PAP_POST_UUID),
          eq(blogPostTranslationsTable.language, lang)
        ),
      });

      if (!existingTranslation) {
        await db.insert(blogPostTranslationsTable).values({
          uuid: uuidv4(),
          blog_post_uuid: PAP_POST_UUID,
          language: lang,
          title,
          excerpt,
          content: `# ${title}\n\n${excerpt}\n\n[Content available in English]`,
        });
        console.log(`✅ Created ${lang} translation`);
      } else {
        console.log(`⚠️  ${lang} translation already exists, skipping`);
      }
    }

    console.log('\n🎉 Successfully seeded PAP blog post!');
    console.log(`📝 Post UUID: ${PAP_POST_UUID}`);
    console.log(`🔗 View at: http://localhost:12005/blog/introducing-pap-agent-ecosystem`);

  } catch (error) {
    console.error('❌ Error seeding blog post:', error);
    process.exit(1);
  }
}

// Run the seed script
seedPAPBlogPost()
  .then(() => {
    console.log('\n✨ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });
