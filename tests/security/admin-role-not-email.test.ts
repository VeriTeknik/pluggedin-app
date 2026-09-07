import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { expect, it } from 'vitest';
function walk(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []); }
it('never uses notification recipients as an admin authorization source', () => {
 const offenders = [...walk('app/admin'), ...walk('app/api/admin')].filter(file => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(source) === 'getAdminEmails') found = true; ts.forEachChild(node, visit); };
  visit(source); return found;
 });
 expect(offenders).toEqual([]);
});
