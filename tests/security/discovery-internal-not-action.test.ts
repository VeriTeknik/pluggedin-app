import fs from 'node:fs';

import ts from 'typescript';
import { expect, it } from 'vitest';
it('does not export the trusted discovery entry point as a server action', () => {
 const file = 'app/actions/discover-mcp-tools.ts';
 const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
 const exported = source.statements.filter(ts.isFunctionDeclaration).filter(s => s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(s => s.name?.text);
 expect(exported).not.toContain('discoverSingleServerToolsInternal');
 expect(exported).toContain('discoverSingleServerTools');
});
