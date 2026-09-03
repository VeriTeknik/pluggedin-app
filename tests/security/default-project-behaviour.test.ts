import { beforeEach, describe, expect, it, vi } from 'vitest';

const forUpdate = vi.fn(async () => [{ id: 'u1' }]);
const existingProjects = vi.fn(async () => [] as unknown[]);
const insertValues = vi.fn();
const returning = vi.fn();
const addSamples = vi.fn(async () => undefined);

/** A `tx` that answers the two selects the helper makes, in order. */
function makeTx() {
  let selectCall = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          selectCall += 1;
          // first select is the FOR UPDATE lock, second is the existence check
          return selectCall === 1
            ? { for: forUpdate }
            : { limit: existingProjects };
        },
      }),
    }),
    insert: () => ({ values: (v: unknown) => (insertValues(v), { returning }) }),
    update: () => ({ set: () => ({ where: () => ({ returning }) }) }),
  };
}

vi.mock('@/db', () => ({
  db: { transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()) },
}));
vi.mock('@/lib/sample-mcp-servers', () => ({ addSampleMcpServersForNewUser: addSamples }));

const { createDefaultProject } = await import('@/lib/default-project-creation');

beforeEach(() => {
  vi.clearAllMocks();
  returning.mockResolvedValue([{ uuid: 'new-project', user_id: 'u1' }]);
  existingProjects.mockResolvedValue([]);
});

/**
 * Two concurrent callers for a brand-new user both used to reach the insert.
 * The lock is what stops that; the existence check is what makes the second
 * caller return the first one's work instead of duplicating it.
 */
describe('createDefaultProject creates at most one project per user', () => {
  it('takes the lock before it looks', async () => {
    await createDefaultProject('u1');

    expect(forUpdate).toHaveBeenCalled();
  });

  it('inserts nothing when the user already has a project', async () => {
    const already = { uuid: 'already-there', user_id: 'u1' };
    existingProjects.mockResolvedValue([already]);

    const result = await createDefaultProject('u1');

    expect(insertValues).not.toHaveBeenCalled();
    expect(result).toEqual(already);
  });

  it('does not add the sample servers a second time', async () => {
    existingProjects.mockResolvedValue([{ uuid: 'already-there', user_id: 'u1' }]);

    await createDefaultProject('u1');

    expect(addSamples).not.toHaveBeenCalled();
  });

  it('still creates one for a user who has none', async () => {
    const result = await createDefaultProject('u1');

    expect(insertValues).toHaveBeenCalled();
    expect(result).toEqual({ uuid: 'new-project', user_id: 'u1' });
    expect(addSamples).toHaveBeenCalled();
  });
});
