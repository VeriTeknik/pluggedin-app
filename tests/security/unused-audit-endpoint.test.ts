import fs from 'node:fs';

import { expect, it } from 'vitest';
it('does not expose the unused client-controlled audit writer endpoint', () => {
 expect(fs.existsSync('app/api/audit-log/route.ts')).toBe(false);
});
