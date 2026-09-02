import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateContainerImage, validateResourceLimits } from '@/lib/agent-helpers';

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * lib/agent-helpers.ts carries both validators with their reasons written on
 * them: "Only allow images from trusted registries to prevent malicious code
 * execution", "Prevents resource exhaustion by enforcing maximum limits".
 *
 * app/api/agents/route.ts calls both before deploying. The replicate endpoint
 * reached the same deployAgent() sink with a caller-supplied `overrides.image`
 * and called neither — so anyone holding an API key and one agent could deploy
 * an arbitrary image into the shared cluster namespace.
 *
 * Discovered rather than listed, for the same reason as the SSRF check: a list
 * only knows the endpoints already thought of.
 */
describe('every path that deploys an agent validates what it deploys', () => {
  /** The body of the function containing `at`, by scanning back to its header. */
  function enclosingFunction(src: string, at: number): string {
    const header = /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/g;
    let start = 0;
    for (const match of src.matchAll(header)) {
      if ((match.index ?? 0) > at) break;
      start = match.index ?? 0;
    }
    return src.slice(start, at);
  }

  it('no deployAgent call site is reached without the validators running first', () => {
    // Presence in the same file is not a guard: the call could sit above the
    // validation, or in a different function entirely. The window is the
    // enclosing function, up to the call.
    const offenders = walk('app')
      .concat(walk('lib'))
      .flatMap((file) => {
        const src = stripComments(fs.readFileSync(file, 'utf8'));

        return [...src.matchAll(/\.deployAgent\s*\(/g)].flatMap((deploy) => {
          const before = enclosingFunction(src, deploy.index ?? 0);
          const validated =
            /validateContainerImage\s*\(/.test(before) &&
            /validateResourceLimits\s*\(/.test(before);

          return validated ? [] : [file];
        });
      });

    expect(offenders).toEqual([]);
  });

  it('validates before it writes the replica row', () => {
    // A rejected image used to return 400 after the agent row existed, leaving
    // an orphan and its reserved DNS name behind.
    const src = stripComments(
      fs.readFileSync('app/api/agents/[id]/replicate/route.ts', 'utf8')
    );

    expect(src.search(/validateContainerImage\s*\(/)).toBeLessThan(
      src.search(/insert\(agentsTable\)/)
    );
    expect(src.search(/validateResourceLimits\s*\(/)).toBeLessThan(
      src.search(/insert\(agentsTable\)/)
    );
  });
});

describe('the image validator is what stands between a caller and the cluster', () => {
  it.each([
    'evil.example.com/malicious:latest',
    'docker.io/attacker/backdoor:1',
    'ghcr.io/../../escape:latest',
  ])('refuses %s', (image) => {
    expect(validateContainerImage(image)).not.toBeNull();
  });

  it('allows a bare name, which is Docker Hub\'s curated library namespace', () => {
    // Deliberate, and commented as such in the validator: a name with no slash
    // resolves to library/<name>, which an attacker cannot publish into. Pinned
    // so the intent is not mistaken for an oversight later.
    expect(validateContainerImage('nginx:1.27')).toBeNull();
  });

  it('accepts the project registry', () => {
    expect(validateContainerImage('ghcr.io/veriteknik/compass-agent:latest')).toBeNull();
  });

  it('refuses resource limits beyond the ceiling', () => {
    expect(validateResourceLimits({ cpu_limit: '999', memory_limit: '999Gi' })).not.toBeNull();
  });
});
