import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { expect, it } from 'vitest';
function walk(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []); }
function usesNotificationRecipients(code: string): boolean {
 const source = ts.createSourceFile('fixture.ts', code, ts.ScriptTarget.Latest, true);
 const aliases = new Set(['getAdminEmails']);
 const namespaces = new Set<string>();
 for (const statement of source.statements) {
  if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== '@/lib/admin-notifications') continue;
  const bindings = statement.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
   for (const item of bindings.elements) if ((item.propertyName?.text ?? item.name.text) === 'getAdminEmails') aliases.add(item.name.text);
  } else if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
 }
 let found = false;
 const visit = (node: ts.Node) => {
  if (ts.isCallExpression(node)) {
   const callee = node.expression;
   if (ts.isIdentifier(callee) && aliases.has(callee.text)) found = true;
   if ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text)) {
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : undefined;
    if (name === 'getAdminEmails') found = true;
   }
  }
  ts.forEachChild(node, visit);
 };
 visit(source); return found;
}
it('never uses notification recipients as an admin authorization source', () => {
 const offenders = [...walk('app/admin'), ...walk('app/api/admin')].filter(file => usesNotificationRecipients(fs.readFileSync(file, 'utf8')));
 expect(offenders).toEqual([]);
});
it.each([
 "import { getAdminEmails } from '@/lib/admin-notifications'; getAdminEmails();",
 "import { getAdminEmails as recipients } from '@/lib/admin-notifications'; recipients();",
 "import * as notifications from '@/lib/admin-notifications'; notifications.getAdminEmails();",
 "import * as notifications from '@/lib/admin-notifications'; notifications['getAdminEmails']();",
])('detects recipient helper calls through imported aliases: %s', (code) => {
 expect(usesNotificationRecipients(code)).toBe(true);
});
