#!/usr/bin/env node
/**
 * Re-encrypt every column protected by NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
 * from an old key to a new one.
 *
 * That variable is not a Next.js internal despite the name — lib/encryption.ts
 * derives the AES-256-GCM key for MCP server configs and OAuth tokens from it.
 * Rotating it without this migration makes every affected row permanently
 * undecryptable.
 *
 * Usage:
 *   OLD_KEY=... NEW_KEY=... DATABASE_URL=... node reencrypt-data-key.mjs --dry-run
 *   OLD_KEY=... NEW_KEY=... DATABASE_URL=... node reencrypt-data-key.mjs --apply
 *   NEW_KEY=...             DATABASE_URL=... node reencrypt-data-key.mjs --verify
 *
 * --dry-run  decrypt-only; proves every row is readable and reports what
 *            --apply would touch. Writes nothing.
 * --apply    re-encrypts, committing per column. Safe to re-run: rows that
 *            already decrypt under NEW_KEY are recognised as migrated and
 *            left alone, so a run that died part-way through can simply be
 *            repeated rather than needing a restore.
 * --verify   confirms every row decrypts under NEW_KEY. Run after --apply,
 *            and before destroying the old key.
 *
 * The wire format is fixed by lib/encryption.ts and reproduced here rather
 * than imported, because that module reads the key from the environment at
 * call time and this migration needs two keys live at once.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const SCRYPT = { N: 16384, r: 8, p: 1 };

// Every (table, column) pair whose value passes through encryptField().
// Verified against db/schema.ts and the call sites in lib/encryption.ts,
// lib/oauth/*.ts and app/actions/registry-servers.ts.
const TARGETS = [
  ['mcp_servers', 'uuid', 'command_encrypted'],
  ['mcp_servers', 'uuid', 'args_encrypted'],
  ['mcp_servers', 'uuid', 'env_encrypted'],
  ['mcp_servers', 'uuid', 'url_encrypted'],
  ['mcp_servers', 'uuid', 'transport_encrypted'],
  ['mcp_servers', 'uuid', 'streamable_http_options_encrypted'],
  ['mcp_server_oauth_config', 'uuid', 'client_secret_encrypted'],
  ['mcp_server_oauth_tokens', 'uuid', 'access_token_encrypted'],
  ['mcp_server_oauth_tokens', 'uuid', 'refresh_token_encrypted'],
  ['mcp_server_remote_headers', 'uuid', 'header_value_encrypted'],
];

// scrypt at N=16384 costs ~16 MiB and tens of ms per call, and every value
// carries its own random salt so no derived key can be reused. Serial
// execution would put a few thousand rows well past the cutover budget;
// the work is CPU-bound in libuv's threadpool, so fan out to the cores.
const CONCURRENCY = Math.max(4, Math.min(16, (await import('node:os')).cpus().length));

async function deriveKey(baseKey, salt) {
  return scrypt(baseKey, salt, 32, SCRYPT);
}

async function decryptField(encrypted, baseKey) {
  const combined = Buffer.from(encrypted, 'base64');
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const data = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = await deriveKey(baseKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // GCM authentication means a wrong key throws here rather than returning
  // plausible garbage, so this doubles as the key-correctness check.
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

async function encryptField(plaintext, baseKey) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await deriveKey(baseKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })
  );
  return results;
}

// Note for anyone tempted to "fix" this by decoding the key before use:
// scrypt takes the RAW STRING, deliberately. lib/encryption.ts does exactly
// the same (`scryptSync(baseKey, salt, ...)` on the env value), and the two
// must agree or nothing decrypts. The base64 decode below is a strength
// check only — it never produces the key material.
//
// The strict format test matters because Buffer.from(v, 'base64') silently
// discards characters outside the alphabet. A key mangled in transit — a
// stray quote, a line break folded in by a copy-paste — could still clear a
// bare length check, and the failure would then surface as thousands of GCM
// authentication errors mid-migration rather than as "your key is malformed"
// before anything is touched.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function requireKey(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  if (!BASE64.test(v)) {
    throw new Error(
      `${name} is not valid base64 — check for whitespace, quotes or a line break`
    );
  }
  if (Buffer.from(v, 'base64').length < 32) {
    throw new Error(`${name} must decode to at least 32 bytes`);
  }
  return v;
}

async function main() {
  const mode = process.argv.find((a) => ['--dry-run', '--apply', '--verify'].includes(a));
  if (!mode) {
    console.error('specify one of --dry-run | --apply | --verify');
    process.exit(2);
  }

  const newKey = requireKey('NEW_KEY');
  const oldKey = mode === '--verify' ? null : requireKey('OLD_KEY');
  if (oldKey && oldKey === newKey) throw new Error('OLD_KEY and NEW_KEY are identical');

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let totalRows = 0;
  let totalFailed = 0;

  try {
    for (const [table, pk, column] of TARGETS) {
      const { rows } = await client.query(
        `SELECT ${pk} AS id, ${column} AS val FROM ${table} WHERE ${column} IS NOT NULL`
      );
      if (rows.length === 0) {
        console.log(`${table}.${column}: 0 rows, skipped`);
        continue;
      }

      const failures = [];
      let skipped = 0;

      // Each row is classified independently, which is what makes a re-run
      // safe. Work is committed per column, so a failure part-way through a
      // table leaves earlier columns already on the new key. Reading those
      // back with OLD_KEY throws a GCM auth error, so a naive re-run would
      // wedge permanently with half the database migrated — the state that
      // is worst to be in and hardest to reason about at 3am.
      //
      // GCM authentication is what makes the fallback trustworthy: a wrong
      // key throws rather than returning plausible garbage, so "decrypts
      // under NEW_KEY" is proof the row is already migrated, not a guess.
      const converted = await mapPool(rows, CONCURRENCY, async (row) => {
        if (mode === '--verify') {
          try {
            await decryptField(row.val, newKey);
          } catch (err) {
            failures.push({ id: row.id, message: err.message });
          }
          return null;
        }

        let plaintext;
        try {
          plaintext = await decryptField(row.val, oldKey);
        } catch {
          try {
            await decryptField(row.val, newKey);
            skipped += 1;          // already migrated by an earlier run
            return null;
          } catch (err) {
            failures.push({ id: row.id, message: err.message });
            return null;
          }
        }

        if (mode === '--apply') {
          return { id: row.id, val: await encryptField(plaintext, newKey) };
        }
        return null;
      });

      // Counted before the failure branch below: a column that fails still
      // *has* rows, and omitting them made the summary under-report the size
      // of the problem exactly when the number mattered most.
      totalRows += rows.length;

      if (failures.length) {
        totalFailed += failures.length;
        console.error(
          `${table}.${column}: ${failures.length}/${rows.length} FAILED to decrypt ` +
            `under either key (first id ${failures[0].id}: ${failures[0].message})`
        );
        if (mode === '--apply') {
          throw new Error(`refusing to write ${table}.${column} with undecryptable rows`);
        }
        continue;
      }

      const pending = converted.filter(Boolean);

      if (mode === '--apply' && pending.length) {
        await client.query('BEGIN');
        try {
          for (const { id, val } of pending) {
            await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${pk} = $2`, [val, id]);
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }

      const verb = { '--dry-run': 'decryptable', '--apply': 're-encrypted', '--verify': 'verified' }[mode];
      const note = skipped ? ` (${skipped} already on the new key, left alone)` : '';
      const n = mode === '--apply' ? pending.length : rows.length - skipped;
      console.log(`${table}.${column}: ${n} rows ${verb}${note}`);
    }
  } finally {
    await client.end();
  }

  console.log(`\n${mode} complete: ${totalRows} rows, ${totalFailed} failures`);
  if (totalFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
