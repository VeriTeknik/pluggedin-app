import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: 'attacker', verify: vi.fn(), publish: vi.fn(), tx: vi.fn(), accounts: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: m.user } }) }));
vi.mock('@/app/actions/registry-servers', () => ({ verifyGitHubOwnership: m.verify }));
vi.mock('@/lib/registry/pluggedin-registry-client', () => ({ PluggedinRegistryClient: class { publishServer = m.publish; } }));
vi.mock('@/db', () => ({ db: {
 query: { sharedMcpServersTable: { findFirst: async () => ({ is_public: true, profile: { project: { user_id: 'owner' } }, template: { command: 'npx', args: ['test'], env: { TOKEN: 'SECRET-LEGACY' } } }) }, accounts: { findFirst: m.accounts } },
 transaction: m.tx,
} }));
import { claimCommunityServer } from '@/app/actions/community-servers';
beforeEach(() => { vi.clearAllMocks(); m.verify.mockResolvedValue({ isOwner: true }); m.accounts.mockResolvedValue({ access_token: 'session-token' }); m.publish.mockRejectedValue(new Error('test stops publishing')); m.tx.mockResolvedValue({}); });
it('rejects a foreign share before using credentials or publishing', async () => {
 m.user = 'attacker';
 const result = await claimCommunityServer({ communityServerUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repositoryUrl: 'https://github.com/attacker/repo', registryToken: 'caller-token' });
 expect(result.success).toBe(false);
 expect(m.verify).not.toHaveBeenCalled(); expect(m.publish).not.toHaveBeenCalled(); expect(m.tx).not.toHaveBeenCalled();
});
it('uses the owner session token and sanitizes legacy secrets before publishing', async () => {
 m.user = 'owner';
 await claimCommunityServer({ communityServerUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repositoryUrl: 'https://github.com/owner/repo', registryToken: 'caller-token' });
 expect(m.verify).toHaveBeenCalledWith('session-token', 'https://github.com/owner/repo');
 expect(m.publish).toHaveBeenCalled();
 expect(JSON.stringify(m.publish.mock.calls[0][0])).not.toContain('SECRET-LEGACY');
});
