import fs from 'node:fs';

import ts from 'typescript';
import { expect, it } from 'vitest';
it('does not publish the unused global registry-session deletion action', () => {
 const source = ts.createSourceFile('registry.ts', fs.readFileSync('app/actions/registry-oauth-session.ts', 'utf8'), ts.ScriptTarget.Latest, true);
 expect(source.statements.filter(ts.isFunctionDeclaration).filter(s => s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(s => s.name?.text)).not.toContain('cleanupExpiredSessions');
});
