import * as fs from 'fs';
import path from 'path';

import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';
import { isExecutionAlteringEnvKey } from '@/lib/security/validators';

/**
 * Where a sandbox launcher (bwrap, firejail) may be taken from.
 *
 * The launcher used to be spawned by bare name, so it was looked up through the
 * PATH of the environment handed to the launch. That environment is written by
 * the server's own configuration and by the package manager, and it named
 * directories the sandboxed child can write to itself — so a `bwrap` planted
 * there ran as the application user before any sandbox existed.
 *
 * Only root-owned system directories, never anything under a home directory.
 */
export const TRUSTED_LAUNCHER_DIRS: readonly string[] = [
  '/usr/bin',
  '/usr/local/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

/**
 * The operator's explicit acceptance that MCP servers may run as the
 * application user, with its filesystem and network, when no sandbox can be
 * established. Without it such a server is refused. Only the exact value
 * "true" counts, and it is read at call time.
 */
export const UNSANDBOXED_STDIO_OPT_OUT = 'MCP_ALLOW_UNSANDBOXED_STDIO';

export function unsandboxedStdioAllowed(): boolean {
  return process.env[UNSANDBOXED_STDIO_OPT_OUT] === 'true';
}

/**
 * Called wherever a process-based server would start without a sandbox
 * (client-wrapper, the mcp-remote OAuth helper, the playground): refuses,
 * unless the operator has explicitly accepted that, in which case it says so
 * loudly. One decision, so no caller can drift from it.
 */
export function refuseUnsandboxedStart(serverName: string): void {
  if (!unsandboxedStdioAllowed()) {
    throw new Error(
      `no process sandbox is available (MCP_ISOLATION_TYPE=${PackageManagerConfig.ISOLATION_TYPE}). ` +
      `Install bubblewrap or firejail, or set ${UNSANDBOXED_STDIO_OPT_OUT}=true to accept running ` +
      `MCP servers as the application user.`
    );
  }
  console.error(
    `[MCP Wrapper] SECURITY WARNING: starting STDIO MCP server "${serverName}" WITHOUT a sandbox ` +
    `because ${UNSANDBOXED_STDIO_OPT_OUT}=true. It runs with this application's filesystem and network access.`
  );
}

/**
 * Variables that act on the launcher process itself rather than on the server
 * it isolates: executable lookup, and everything the dynamic loader and libc
 * read at start-up (the loader's own variables plus glibc's "unsecure" list).
 * The launcher is an ordinary program started before any isolation exists, so a
 * server's configuration must not be able to set these for it.
 */
const LAUNCHER_ENV_NAMES = new Set([
  'PATH',
  'GCONV_PATH',
  'GETCONF_DIR',
  'GLIBC_TUNABLES',
  'HOSTALIASES',
  'LOCALDOMAIN',
  'LOCPATH',
  'NIS_PATH',
  'NLSPATH',
  'RESOLV_HOST_CONF',
  'RES_OPTIONS',
  'TMPDIR',
  'TZDIR',
]);
const LAUNCHER_ENV_PREFIXES = ['LD_', 'DYLD_', 'MALLOC_'];

/**
 * Also everything that decides what a process loads or runs before its own code
 * does (NODE_OPTIONS, PYTHONPATH, BASH_ENV…): meant for the server, and
 * legitimate there, but never for a program started on the host.
 */
export function isLauncherEnvVar(name: string): boolean {
  const upper = name.toUpperCase();
  return (
    LAUNCHER_ENV_NAMES.has(upper) ||
    LAUNCHER_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix)) ||
    isExecutionAlteringEnvKey(upper)
  );
}

/**
 * Split a server's configured environment into what may be handed to the
 * launcher and what may only be applied inside the sandbox (via the launcher's
 * own set-env option), so the server still sees every variable it configured.
 */
export function splitServerEnv(env: Record<string, string> | null | undefined): {
  launcherEnv: Record<string, string>;
  sandboxOnlyEnv: Record<string, string>;
} {
  const launcherEnv: Record<string, string> = {};
  const sandboxOnlyEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (isLauncherEnvVar(key)) {
      sandboxOnlyEnv[key] = value;
    } else {
      launcherEnv[key] = value;
    }
  }
  return { launcherEnv, sandboxOnlyEnv };
}

/**
 * The absolute path of a sandbox launcher, or null when there is no trustworthy
 * one: a regular executable file in one of `dirs`, owned by root and not
 * writable by group or others. PATH is never consulted.
 */
export function resolveSandboxLauncher(
  name: string,
  dirs: readonly string[] = TRUSTED_LAUNCHER_DIRS
): string | null {
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(candidate);
    } catch {
      continue;
    }

    const executable = (stat.mode & 0o111) !== 0;
    const writableByOthers = (stat.mode & 0o022) !== 0;
    if (stat.isFile() && executable && stat.uid === 0 && !writableByOthers) {
      return candidate;
    }
  }
  return null;
}
