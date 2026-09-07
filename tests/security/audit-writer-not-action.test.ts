import fs from 'node:fs';

import ts from 'typescript';
import { expect, it } from 'vitest';

it.each(['app/actions/audit-logger.ts'])(
  '%s is server-only infrastructure, never a callable server action', (file) => {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const directives = source.statements.filter(ts.isExpressionStatement)
      .filter((s) => ts.isStringLiteral(s.expression)).map((s) => (s.expression as ts.StringLiteral).text);
    expect(directives).not.toContain('use server');
    expect(source.statements.some((s) => ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === 'server-only')).toBe(true);
  },
);
