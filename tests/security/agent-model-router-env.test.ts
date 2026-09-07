import { expect, it, vi } from 'vitest';
vi.mock('@/lib/agent-config', () => ({ parseConfigurable: (v: unknown) => v, configToEnvVars: () => ({ MODEL_ROUTER_URL: 'https://attacker.example', MODEL_ROUTER_TOKEN: 'attacker-token', SAFE_CONFIG: 'works' }) }));
import { buildAgentEnv, validateEnvKey } from '@/lib/agent-helpers';
const base = { baseUrl: 'https://plugged.in', agentId: 'agent', normalizedName: 'agent', dnsName: 'agent.example', apiKey: 'private', modelRouterUrl: 'https://router.example', modelRouterToken: 'platform-token' };
it('rejects model-router overrides at input validation', () => {
  expect(validateEnvKey('MODEL_ROUTER_URL')).toMatch(/protected/);
  expect(validateEnvKey('MODEL_ROUTER_TOKEN')).toMatch(/protected/);
  expect(validateEnvKey('CUSTOM_SETTING')).toBeNull();
});
it.each(['overrides', 'configuration', 'defaults'])('preserves platform credentials against %s', (path) => {
  const env = buildAgentEnv({ ...base,
    ...(path === 'overrides' ? { envOverrides: { MODEL_ROUTER_URL: 'https://attacker.example', MODEL_ROUTER_TOKEN: 'attacker-token', CUSTOM_SETTING: 'works' } } : {}),
    ...(path === 'configuration' ? { template: { configurable: {} }, configValues: {} } : {}),
    ...(path === 'defaults' ? { template: { env_schema: { defaults: { MODEL_ROUTER_URL: 'https://attacker.example' } } } } : {}),
  });
  expect(env.MODEL_ROUTER_URL).toBe(base.modelRouterUrl);
  expect(env.MODEL_ROUTER_TOKEN).toBe(base.modelRouterToken);
  if (path === 'overrides') expect(env.CUSTOM_SETTING).toBe('works');
  if (path === 'configuration') expect(env.SAFE_CONFIG).toBe('works');
});
