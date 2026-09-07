// @vitest-environment node
import { execFileSync } from 'node:child_process';

import { expect, it } from 'vitest';
const hasCompose = (() => { try { execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
it.skipIf(!hasCompose).each(['docker-compose.yml', 'docker-compose.production.yml', 'infra/docker-compose.yml'])('%s does not publish an application port on a public interface', (file) => {
 const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', '/dev/null', '-f', file, 'config', '--no-env-resolution', '--format', 'json'], {
  encoding: 'utf8', env: { PATH: process.env.PATH, POSTGRES_PASSWORD: 'fixture', REDIS_PASSWORD: 'fixture', DB_PASSWORD: 'fixture' },
 }));
 const ports = config.services['pluggedin-app'].ports ?? [];
 expect(ports.every((port: { host_ip?: string }) => ['127.0.0.1', '::1'].includes(port.host_ip ?? ''))).toBe(true);
});
