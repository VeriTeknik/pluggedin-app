# Contributing to Plugged.in - Building the Future of AI Data Exchanges

Welcome to the plugged.in community! You're not just contributing code - you're building the infrastructure that will define how humanity interacts with AI. Every line of code, every bug report, and every idea brings us closer to a world where AI enhances human capability without compromising autonomy.

## Why We Build

Plugged.in exists because we believe in a fundamental principle: **Your AI, Your Data, Your Control**. We're creating the crossroads where AI models and human intentions meet, ensuring that as AI becomes more powerful, humans become more empowered.

## Getting Started

### Understanding the Vision

Before diving into code, understand what we're building:

- Read our [ROADMAP.md](./ROADMAP.md) to see where we're heading
- Read our [CLAUDE.md](./CLAUDE.md) to understand the project architecture
- Try the platform at [plugged.in](https://plugged.in) to experience the "what"

### Development Setup

```bash
# Clone the monorepo
git clone https://github.com/VeriTeknik/pluggedin-app
cd pluggedin-app

# Install dependencies
pnpm install

# Set up your environment
cp .env.example .env
# Edit .env with your configuration

# Generate encryption key
pnpm generate-encryption-key

# Set up database
pnpm db:generate
pnpm db:migrate

# Start the development environment
pnpm dev

# Run tests
pnpm test
```

## Architecture Overview

Plugged.in consists of interconnected systems working in harmony:

- **Web App (Next.js)**: The control center for AI orchestration
- **MCP Proxy (TypeScript)**: The intelligent router for AI data flows
- **Database (PostgreSQL)**: The source of truth for configurations
- **Cache (Redis)**: The speed layer for real-time operations

## How to Contribute

### Finding Your Path

Choose your adventure based on your interests and expertise:

#### 🏗️ Infrastructure Warriors
- Optimize database queries for million-user scale
- Implement distributed caching strategies
- Build resilient error recovery systems
- Create monitoring and observability tools

#### 🔒 Security Guardians
- Audit authentication and authorization flows
- Implement privacy-preserving features
- Build compliance tooling
- Research encryption methods for AI data

#### 🎨 Experience Crafters
- Design intuitive UI for complex AI workflows
- Create delightful onboarding experiences
- Build responsive, accessible interfaces
- Optimize frontend performance

#### 🤖 AI Architects
- Develop new MCP server integrations
- Create intelligent routing algorithms
- Build multi-agent orchestration systems
- Research context compression techniques

#### 📚 Knowledge Sharers
- Write clear, helpful documentation
- Create video tutorials
- Build example projects
- Answer community questions

### Contribution Process

1. **Find an Issue**
   - Check our [issue tracker](https://github.com/VeriTeknik/pluggedin-app/issues)
   - Look for `good first issue` or `help wanted` labels
   - Or propose your own idea!

2. **Discuss First**
   - Comment on the issue or create a new one
   - Join our [Discord](https://discord.gg/pluggedin) for real-time discussion
   - Get alignment before major work

3. **Code with Purpose**
   ```typescript
   // Every function should answer: How does this empower users?
   async function enableUserControl() {
     // Your code here
   }
   ```

4. **Test Thoroughly**
   - Unit tests for logic
   - Integration tests for workflows
   - E2E tests for critical paths
   - Manual testing for UX

5. **Submit with Pride**
   - Clear PR description explaining the "why"
   - Link to related issues
   - Include screenshots for UI changes
   - Add documentation updates

## Code Standards

We believe in code that's as elegant as the future we're building:

- **TypeScript First**: Type safety prevents runtime surprises
- **Functional Patterns**: Prefer pure functions and immutability
- **Clear Naming**: Code should read like documentation
- **Performance Matters**: Every millisecond counts at scale
- **Security by Default**: Never trust, always verify
- **Internationalization**: Support all 6 languages (en, tr, zh, hi, ja, nl)

### Testing Philosophy
- **Test Behavior, Not Implementation**: Tests should survive refactoring
- **Real-World Scenarios**: Test actual user workflows
- **Edge Cases Matter**: AI interactions can be unpredictable
- **Performance Tests**: Ensure we scale gracefully

### Key Development Patterns

#### Server Actions
```typescript
'use server';

export async function serverAction(params) {
  try {
    // Validate with Zod
    const validated = schema.parse(params);
    // Business logic
    const result = await businessLogic(validated);
    // Return success
    return { success: true, data: result };
  } catch (error) {
    // Standardized error handling
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
```

#### Internationalization
```typescript
// Always use translations
import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation();
  return <h1>{t('welcome.title')}</h1>;
}
```

## Community Guidelines

### Our Values
- **User Empowerment**: Every decision should increase user control
- **Open Collaboration**: The best ideas come from diverse perspectives
- **Pragmatic Innovation**: Ship working solutions, iterate to perfection
- **Respectful Discourse**: Disagree on ideas, not individuals
- **Sustainable Development**: Build for the long term

### Getting Help
- **Discord**: Join our community for real-time help
- **Documentation**: Check our docs for guides
- **Issues**: Search existing issues before creating new ones
- **Office Hours**: Weekly community calls every Thursday

## Recognition

We believe in celebrating our contributors:

- **Contributors Page**: All contributors listed in our hall of fame
- **Swag Program**: Active contributors receive plugged.in merchandise
- **Conference Tickets**: Top contributors get conference sponsorships
- **Feature Credits**: Your name in release notes for significant features

## The Future We're Building

Every contribution to plugged.in is a vote for a future where:

- AI amplifies human capability without replacing human agency
- Data ownership is a fundamental right, not a privilege
- The benefits of AI are accessible to all, not just the few
- Technology serves humanity, not the other way around

Join us in building this future. Your code today shapes tomorrow's possibilities.

> *"At the crossroads of human intention and artificial intelligence, we build bridges, not barriers."*

Welcome to plugged.in. Let's build something extraordinary together. 🚀

---

## Quick Reference

### Important Files
- `CLAUDE.md` - Comprehensive project guidance
- `ROADMAP.md` - Our vision and future plans
- `README.md` - Project overview and setup
- `.env.example` - Environment configuration template

### Key Commands
```bash
pnpm dev                    # Start development
pnpm build                  # Build for production
pnpm test                   # Run tests
pnpm lint                   # Check code style
pnpm db:migrate             # Run migrations
pnpm generate-encryption-key # Generate auth secret
```

### Useful Links
- [GitHub Repository](https://github.com/VeriTeknik/pluggedin-app)
- [Issue Tracker](https://github.com/VeriTeknik/pluggedin-app/issues)
- [Discord Community](https://discord.gg/pluggedin)
- [Reddit Community](https://www.reddit.com/r/plugged_in/)
- [X (Twitter)](https://x.com/PluggedIntoAI)