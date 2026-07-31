#!/usr/bin/env node
/**
 * Regression fixture for the non-idempotency bug found in review of PR #177.
 *
 * Seeds a table in the state an interrupted --apply leaves behind: one column
 * already migrated to NEW_KEY, another still on OLD_KEY. Before the fix, a
 * re-run died on the already-migrated column with a GCM auth error and could
 * not recover without a database restore.
 *
 * Full sequence against a throwaway Postgres carrying the same schema:
 *
 *   export OLD_KEY=$(head -c 32 /dev/urandom | base64)
 *   export NEW_KEY=$(head -c 32 /dev/urandom | base64)
 *   export DATABASE_URL=postgresql://t:t@127.0.0.1:55440/t
 *
 *   node infra/scripts/test-reencrypt-idempotency.mjs
 *   node infra/scripts/reencrypt-data-key.mjs --apply
 *   node infra/scripts/reencrypt-data-key.mjs --verify
 *
 * Expected: --apply reports "25 already on the new key, left alone" for
 * command_encrypted and re-encrypts 25 for args_encrypted; --verify reports
 * 50 rows, 0 failures. Confirmed that the pre-fix script instead exits 1 with
 * "refusing to write mcp_servers.command_encrypted with undecryptable rows".
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);

async function encrypt(plaintext, baseKey) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(baseKey, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return Buffer.concat([salt, iv, c.getAuthTag(), enc]).toString('base64');
}

async function decrypt(encrypted, baseKey) {
  const b = Buffer.from(encrypted, 'base64');
  const key = await scrypt(baseKey, b.subarray(0, 16), 32, { N: 16384, r: 8, p: 1 });
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(16, 32));
  d.setAuthTag(b.subarray(32, 48));
  return Buffer.concat([d.update(b.subarray(48)), d.final()]).toString('utf8');
}

const OLD = process.env.OLD_KEY;
const NEW = process.env.NEW_KEY;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('TRUNCATE mcp_servers');

// The interrupted-run state: command_encrypted already migrated to NEW,
// args_encrypted still on OLD. This is precisely what a crash between two
// per-column commits leaves behind.
const expected = new Map();
for (let i = 0; i < 25; i++) {
  const cmd = `command-${i}`;
  const args = `args-${i}`;
  const { rows } = await client.query(
    'INSERT INTO mcp_servers(command_encrypted, args_encrypted) VALUES ($1,$2) RETURNING uuid',
    [await encrypt(cmd, NEW), await encrypt(args, OLD)]
  );
  expected.set(rows[0].uuid, { cmd, args });
}
console.log('seeded 25 rows: command_encrypted on NEW key, args_encrypted on OLD key');
await client.end();
