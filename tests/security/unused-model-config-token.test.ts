import fs from 'node:fs';

import { expect, it } from 'vitest';
it('does not expose the unused shared long-lived model configuration credential endpoint', () => {
 expect(fs.existsSync('app/api/model-router/info/route.ts')).toBe(false);
});
