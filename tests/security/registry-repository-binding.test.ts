import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ withAuth: async (fn: any) => fn({ user: { id: 'owner' } }), withProfileAuth: vi.fn() }));
vi.mock('@/app/actions/registry-oauth-session', () => ({ getRegistryOAuthToken: m.token }));
vi.mock('@/db', () => ({ db: {} }));
import { submitWizardToRegistry } from '@/app/actions/registry-servers';
beforeEach(() => { vi.clearAllMocks(); m.token.mockResolvedValue({ success: false }); });
it('rejects repository identity different from the verified URL before requesting credentials', async () => {
 const result = await submitWizardToRegistry({ githubUrl: 'https://github.com/owner/repo', owner: 'victim', repo: 'reputable', shouldClaim: true } as any);
 expect(result).toMatchObject({ success: false, error: expect.stringMatching(/match|repository identity/i) });
 expect(m.token).not.toHaveBeenCalled();
});
it('continues normal ownership verification for a matching repository', async () => {
 await submitWizardToRegistry({ githubUrl: 'https://github.com/owner/repo', owner: 'owner', repo: 'repo', shouldClaim: true } as any);
 expect(m.token).toHaveBeenCalledOnce();
});
