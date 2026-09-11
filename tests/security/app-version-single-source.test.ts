/**
 * The application's own version has one source.
 *
 * Three places each carried a different hardcoded fallback, and `APP_VERSION`
 * was set in none of the Dockerfile, compose or CI:
 *
 *   lib/observability/logger.ts   '2.14.0'
 *   lib/logging.ts                '1.0.0'
 *   app/api/health/route.ts       '2.18.0'
 *
 * …while the app was 4.0.0. Every log line and every monitored health probe
 * reported a version that had not existed for months, which makes
 * release-scoped filtering in Sentry or Loki wrong rather than absent.
 *
 * I fixed the first two and missed the third; review caught it. Hence this
 * test: it discovers the pattern instead of trusting that someone looked
 * everywhere. `lib/app-version.ts` is the only place allowed to decide.
 *
 * Not covered, deliberately: `clientInfo.version` in the MCP handshake and the
 * package-version fallback in registry-servers.ts. Those are other things'
 * versions, not ours.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_VERSION } from '@/lib/app-version';

const SOURCE = 'lib/app-version.ts';

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('app version', () => {
  const files = ['app', 'lib'].flatMap((d) => sourceFiles(d));

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('matches package.json', async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(APP_VERSION).toBe(pkg.version);
  });

  it('is read from one module — no file falls back to a literal', () => {
    // `process.env.APP_VERSION || '<literal>'` is the shape that drifted.
    const pattern = /APP_VERSION\s*\|\|\s*['"][^'"]+['"]/;
    const offenders = files
      .filter((f) => f !== SOURCE && !f.startsWith('tests'))
      .filter((f) => pattern.test(readFileSync(f, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('detects the shape it is meant to catch', () => {
    const pattern = /APP_VERSION\s*\|\|\s*['"][^'"]+['"]/;

    expect(pattern.test(`version: process.env.APP_VERSION || '2.18.0',`)).toBe(true);
    expect(pattern.test(`version: APP_VERSION,`)).toBe(false);
  });
});
