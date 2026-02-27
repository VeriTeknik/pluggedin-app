/**
 * Tests for agent-helpers utility functions
 * Tests environment variable validation, sanitization, and agent env building
 */

import { describe, it, expect } from 'vitest';
import { validateEnvKey, buildAgentEnv } from '@/lib/agent-helpers';

describe('agent-helpers', () => {
  describe('validateEnvKey', () => {
    describe('valid keys', () => {
      it('should accept simple lowercase key', () => {
        expect(validateEnvKey('myvar')).toBeNull();
      });

      it('should accept simple uppercase key', () => {
        expect(validateEnvKey('MYVAR')).toBeNull();
      });

      it('should accept key starting with underscore', () => {
        expect(validateEnvKey('_MYVAR')).toBeNull();
      });

      it('should accept key with numbers', () => {
        expect(validateEnvKey('VAR123')).toBeNull();
      });

      it('should accept mixed case key', () => {
        expect(validateEnvKey('My_Var_123')).toBeNull();
      });

      it('should accept single character key', () => {
        expect(validateEnvKey('A')).toBeNull();
      });

      it('should accept underscore only key', () => {
        expect(validateEnvKey('_')).toBeNull();
      });
    });

    describe('invalid keys', () => {
      it('should reject empty string', () => {
        expect(validateEnvKey('')).toContain('empty');
      });

      it('should reject whitespace only', () => {
        expect(validateEnvKey('   ')).toContain('empty');
      });

      it('should reject key starting with number', () => {
        expect(validateEnvKey('123VAR')).toContain('Must start with');
      });

      it('should reject key with hyphen', () => {
        expect(validateEnvKey('MY-VAR')).toContain('only letters');
      });

      it('should reject key with space', () => {
        expect(validateEnvKey('MY VAR')).toContain('only letters');
      });

      it('should reject key with special characters', () => {
        expect(validateEnvKey('MY$VAR')).toContain('only letters');
      });

      it('should reject key with dot', () => {
        expect(validateEnvKey('MY.VAR')).toContain('only letters');
      });
    });

    describe('protected keys', () => {
      it('should reject PAP_ prefix', () => {
        const result = validateEnvKey('PAP_CUSTOM_VAR');
        expect(result).toContain('protected');
        expect(result).toContain('PAP_');
      });

      it('should reject PLUGGEDIN_ prefix', () => {
        const result = validateEnvKey('PLUGGEDIN_API_KEY');
        expect(result).toContain('protected');
        expect(result).toContain('PLUGGEDIN_');
      });

      it('should reject AGENT_ prefix', () => {
        const result = validateEnvKey('AGENT_ID');
        expect(result).toContain('protected');
        expect(result).toContain('AGENT_');
      });

      it('should reject PORT', () => {
        const result = validateEnvKey('PORT');
        expect(result).toContain('protected');
      });

      it('should reject NODE_ENV', () => {
        const result = validateEnvKey('NODE_ENV');
        expect(result).toContain('protected');
      });

      it('should reject HOME', () => {
        const result = validateEnvKey('HOME');
        expect(result).toContain('protected');
      });

      it('should reject PATH', () => {
        const result = validateEnvKey('PATH');
        expect(result).toContain('protected');
      });

      it('should reject USER', () => {
        const result = validateEnvKey('USER');
        expect(result).toContain('protected');
      });

      it('should allow similar but non-protected keys', () => {
        // Similar to protected but not matching
        expect(validateEnvKey('PAPRIKA')).toBeNull(); // Doesn't start with PAP_
        expect(validateEnvKey('MY_PAP_VAR')).toBeNull(); // PAP_ not at start
        expect(validateEnvKey('PORTER')).toBeNull(); // Not PORT
      });
    });
  });

  describe('buildAgentEnv', () => {
    const baseOpts = {
      baseUrl: 'https://example.com',
      agentId: 'agent-123',
      normalizedName: 'test-agent',
      dnsName: 'test-agent.example.com',
      apiKey: 'sk-test-key-123',
    };

    describe('base environment variables', () => {
      it('should include PAP Station connection vars', () => {
        const env = buildAgentEnv(baseOpts);

        expect(env.PAP_STATION_URL).toBe('https://example.com/api/agents');
        expect(env.PAP_AGENT_ID).toBe('agent-123');
        expect(env.PAP_AGENT_DNS).toBe('test-agent.example.com');
        expect(env.PAP_AGENT_KEY).toBe('sk-test-key-123');
      });

      it('should include PAP Collector URL for heartbeats', () => {
        const env = buildAgentEnv(baseOpts);

        expect(env.PAP_COLLECTOR_URL).toBe('http://pap-collector.agents.svc:8080');
      });

      it('should include Plugged.in API vars', () => {
        const env = buildAgentEnv(baseOpts);

        expect(env.PLUGGEDIN_API_URL).toBe('https://example.com/api');
        expect(env.PLUGGEDIN_API_KEY).toBe('sk-test-key-123');
      });

      it('should include agent identity vars', () => {
        const env = buildAgentEnv(baseOpts);

        expect(env.AGENT_NAME).toBe('test-agent');
        expect(env.AGENT_DNS_NAME).toBe('test-agent.example.com');
      });

      it('should use default PORT 3000', () => {
        const env = buildAgentEnv(baseOpts);
        expect(env.PORT).toBe('3000');
      });
    });

    describe('template defaults', () => {
      it('should apply template defaults', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          template: {
            env_schema: {
              defaults: {
                LOG_LEVEL: 'info',
                MAX_CONNECTIONS: 10,
              },
            },
          },
        });

        expect(env.LOG_LEVEL).toBe('info');
        expect(env.MAX_CONNECTIONS).toBe('10');
      });

      it('should use template container port', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          template: {
            container_port: 8080,
          },
        });

        expect(env.PORT).toBe('8080');
      });

      it('should not override base vars with template defaults', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          template: {
            env_schema: {
              defaults: {
                PAP_STATION_URL: 'malicious-url',
                PORT: '9999',
              },
            },
          },
        });

        // Base vars should remain unchanged
        expect(env.PAP_STATION_URL).toBe('https://example.com/api/agents');
        expect(env.PORT).toBe('3000');
      });

      it('should skip protected keys in template defaults', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          template: {
            env_schema: {
              defaults: {
                PAP_CUSTOM: 'value', // Protected prefix
                NODE_ENV: 'production', // Protected key
                CUSTOM_VAR: 'allowed',
              },
            },
          },
        });

        expect(env.PAP_CUSTOM).toBeUndefined();
        expect(env.NODE_ENV).toBeUndefined();
        expect(env.CUSTOM_VAR).toBe('allowed');
      });
    });

    describe('user overrides', () => {
      it('should apply user overrides', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          envOverrides: {
            MY_API_KEY: 'user-api-key',
            DEBUG: 'true',
          },
        });

        expect(env.MY_API_KEY).toBe('user-api-key');
        expect(env.DEBUG).toBe('true');
      });

      it('should give user overrides priority over template defaults', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          template: {
            env_schema: {
              defaults: {
                LOG_LEVEL: 'info',
              },
            },
          },
          envOverrides: {
            LOG_LEVEL: 'debug',
          },
        });

        expect(env.LOG_LEVEL).toBe('debug');
      });

      it('should skip protected keys in user overrides', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          envOverrides: {
            PAP_AGENT_ID: 'hacked',
            PLUGGEDIN_API_KEY: 'stolen',
            AGENT_NAME: 'malicious',
            HOME: '/root',
          },
        });

        // Original values should be preserved
        expect(env.PAP_AGENT_ID).toBe('agent-123');
        expect(env.PLUGGEDIN_API_KEY).toBe('sk-test-key-123');
        expect(env.AGENT_NAME).toBe('test-agent');
        expect(env.HOME).toBeUndefined();
      });
    });

    describe('value sanitization', () => {
      it('should convert non-string values to strings', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          envOverrides: {
            NUMBER_VAR: 42 as unknown as string,
            BOOL_VAR: true as unknown as string,
          },
        });

        expect(env.NUMBER_VAR).toBe('42');
        expect(env.BOOL_VAR).toBe('true');
      });

      it('should handle null/undefined values', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          envOverrides: {
            NULL_VAR: null as unknown as string,
            UNDEF_VAR: undefined as unknown as string,
          },
        });

        expect(env.NULL_VAR).toBe('');
        expect(env.UNDEF_VAR).toBe('');
      });

      it('should remove control characters except tab/newline/CR', () => {
        const env = buildAgentEnv({
          ...baseOpts,
          envOverrides: {
            CLEAN_VAR: 'hello\x00world\x01test', // Null and SOH chars
            TAB_VAR: 'hello\tworld', // Tab should be preserved
            NEWLINE_VAR: 'hello\nworld', // Newline should be preserved
          },
        });

        expect(env.CLEAN_VAR).toBe('helloworld\x01test'); // \x00 removed, \x01 removed
        expect(env.TAB_VAR).toBe('hello\tworld');
        expect(env.NEWLINE_VAR).toBe('hello\nworld');
      });

      it('should truncate values exceeding 8KB', () => {
        const longValue = 'x'.repeat(10000); // 10KB
        const env = buildAgentEnv({
          ...baseOpts,
          envOverrides: {
            LONG_VAR: longValue,
          },
        });

        expect(env.LONG_VAR.length).toBe(8192); // Truncated to 8KB
      });
    });
  });
});
