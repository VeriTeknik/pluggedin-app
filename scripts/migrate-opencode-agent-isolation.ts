/**
 * One-off operator migration for agents deployed before ownership labels and
 * OpenCode isolation existed. Runbook, prerequisites and permissions:
 * docs/ops/agent-ownership-and-isolation-migration.md.
 *
 *   tsx scripts/migrate-opencode-agent-isolation.ts            # dry run: prints the plan, changes nothing
 *   tsx scripts/migrate-opencode-agent-isolation.ts --apply    # applies it
 *
 * Options:
 *   --agent <uuid>                         only this agent
 *   --ingress-controller-namespace <ns>    namespace the NetworkPolicy admits (default kube-system)
 *
 * For every agent row with a Deployment it backfills the owner label
 * (`pap.plugged.in/agent-uuid`) on the agent's resources and pods — without it
 * logs, events, status, scale, restart and upgrade refuse the agent — and for
 * OpenCode agents it applies the isolation a new deploy gets: the
 * `<name>-netpol` NetworkPolicy, no ttyd/opencode-serve ports on the Service
 * or IngressRoute, ttyd bound to loopback without credentials, opencode-serve
 * on 127.0.0.1 with exec probes, OPENCODE_URL over loopback. The planning
 * logic is lib/agents/isolation-migration.ts (unit-tested); this file only
 * reads the agent rows and talks to the API. Idempotent: a second run has
 * nothing to do. It also lists agent Deployments that no agent row points at
 * (leftovers of deleted accounts), which it never touches.
 *
 * Kubernetes access (never the app's least-privilege token, which cannot read
 * or patch most of this on purpose):
 *   K8S_MIGRATION_API_URL   API server URL, e.g. http://127.0.0.1:8001 behind
 *                           `kubectl proxy` (uses your kubeconfig credentials)
 *   K8S_MIGRATION_TOKEN     optional bearer token when not going through kubectl proxy
 *   K8S_CA_CERT             base64 CA for an https API URL (TLS is always verified)
 * Database: DATABASE_URL, as for the app.
 */

import 'dotenv/config';

import { eq, isNotNull } from 'drizzle-orm';
import * as http from 'http';
import * as https from 'https';

import { db } from '@/db';
import { agentsTable, agentTemplatesTable } from '@/db/schema';
import {
  type AgentMigrationPlan,
  applyAgentMigration,
  type JsonPatchOp,
  type K8sObject,
  type MigrationClient,
  type MigrationTarget,
  planAgentMigration,
} from '@/lib/agents/isolation-migration';
import { type OpenCodeTemplateType, openCodeTemplateType } from '@/lib/agents/template-kind';
import { validateNamespace } from '@/lib/services/kubernetes-service';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes('--apply');
const ONLY_AGENT = argValue('--agent');
const INGRESS_CONTROLLER_NAMESPACE = argValue('--ingress-controller-namespace');

// ─────────────────────────────────────────────────────────────────────────────
// Kubernetes client
// ─────────────────────────────────────────────────────────────────────────────

function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  contentType = 'application/json'
): Promise<{ status: number; body: string }> {
  const base = process.env.K8S_MIGRATION_API_URL;
  if (!base) throw new Error('K8S_MIGRATION_API_URL is not set (see the runbook)');
  const url = new URL(path, base);
  const token = process.env.K8S_MIGRATION_TOKEN;
  const ca = process.env.K8S_CA_CERT ? Buffer.from(process.env.K8S_CA_CERT, 'base64') : undefined;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const mod = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': contentType } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(url.protocol === 'https:' ? { ca, rejectUnauthorized: true } : {}),
        timeout: 30_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on('timeout', () => req.destroy(new Error(`${method} ${path} timed out`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function failure(method: string, path: string, status: number, body: string): Error {
  // Only the Status reason: a response body may carry object contents.
  let reason = '';
  try {
    reason = (JSON.parse(body) as { reason?: string }).reason ?? '';
  } catch {
    // not JSON
  }
  return new Error(`${method} ${path} -> ${status}${reason ? ` ${reason}` : ''}`);
}

const client: MigrationClient = {
  async get(path) {
    const res = await apiRequest('GET', path);
    if (res.status === 404) return null;
    if (res.status >= 400) throw failure('GET', path, res.status, res.body);
    return JSON.parse(res.body) as K8sObject;
  },
  async create(collectionPath, body) {
    const res = await apiRequest('POST', collectionPath, body);
    if (res.status >= 400) throw failure('POST', collectionPath, res.status, res.body);
  },
  async jsonPatch(path, ops: JsonPatchOp[]) {
    const res = await apiRequest('PATCH', path, ops, 'application/json-patch+json');
    if (res.status >= 400) throw failure('PATCH', path, res.status, res.body);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Targets
// ─────────────────────────────────────────────────────────────────────────────

function templateTypeOf(
  template: { namespace: string | null; name: string | null } | null,
  metadata: unknown
): OpenCodeTemplateType | null {
  const fromRow = openCodeTemplateType(template);
  if (fromRow) return fromRow;
  // Template row deleted (template_uuid is ON DELETE SET NULL): fall back to
  // the name recorded at creation. The Deployment's own `template` label is
  // cross-checked by the planner, which skips on any mismatch.
  const recorded = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).template_name : undefined;
  if (typeof recorded === 'string' && recorded.includes('/')) {
    const [namespace, name] = recorded.split('/', 2);
    return openCodeTemplateType({ namespace, name });
  }
  return null;
}

async function loadTargets(): Promise<MigrationTarget[]> {
  const rows = await db
    .select({
      uuid: agentsTable.uuid,
      dnsName: agentsTable.dns_name,
      deployment: agentsTable.kubernetes_deployment,
      namespace: agentsTable.kubernetes_namespace,
      metadata: agentsTable.metadata,
      templateNamespace: agentTemplatesTable.namespace,
      templateName: agentTemplatesTable.name,
    })
    .from(agentsTable)
    .leftJoin(agentTemplatesTable, eq(agentsTable.template_uuid, agentTemplatesTable.uuid))
    .where(isNotNull(agentsTable.kubernetes_deployment));

  return rows
    .filter((row) => !ONLY_AGENT || row.uuid === ONLY_AGENT)
    .map((row) => ({
      uuid: row.uuid,
      name: row.deployment as string,
      namespace: row.namespace || 'agents',
      dnsName: `${row.dnsName}.is.plugged.in`,
      templateType: templateTypeOf(
        row.templateNamespace || row.templateName ? { namespace: row.templateNamespace, name: row.templateName } : null,
        row.metadata
      ),
    }));
}

/** Agent Deployments no agent row points at: leftovers, reported only. */
async function reportUnclaimedDeployments(targets: MigrationTarget[]): Promise<void> {
  const claimed = new Set(targets.map((t) => `${t.namespace}/${t.name}`));
  for (const namespace of new Set(targets.map((t) => t.namespace).concat('agents'))) {
    const res = await apiRequest(
      'GET',
      `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments?labelSelector=${encodeURIComponent('pap-agent=true')}`
    );
    if (res.status >= 400) {
      console.warn(`  could not list Deployments in ${namespace}: ${res.status}`);
      continue;
    }
    const items = (JSON.parse(res.body) as { items?: Array<{ metadata: { name: string; labels?: Record<string, string> } }> }).items ?? [];
    for (const item of items) {
      if (claimed.has(`${namespace}/${item.metadata.name}`)) continue;
      const template = item.metadata.labels?.template;
      console.log(
        `  UNCLAIMED ${namespace}/${item.metadata.name}${template ? ` (${template})` : ''}: no agent row points at it. ` +
          (template?.startsWith('opencode-') ? 'Its ttyd/opencode-serve may still be reachable from other pods. ' : '') +
          'Review and delete it with kubectl; this script never touches it.'
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function printPlan(plan: AgentMigrationPlan): void {
  const t = plan.target;
  const kind = t.templateType ?? 'standard';
  if (plan.status === 'skipped') {
    console.log(`- ${t.namespace}/${t.name} [${kind}] ${t.uuid}: SKIPPED — ${plan.reason}`);
  } else if (plan.status === 'up-to-date') {
    console.log(`- ${t.namespace}/${t.name} [${kind}] ${t.uuid}: up to date`);
  } else {
    console.log(`- ${t.namespace}/${t.name} [${kind}] ${t.uuid}: ${plan.steps.length} step(s)`);
    for (const step of plan.steps) {
      console.log(`    ${step.description}`);
      if (step.action === 'patch') {
        for (const op of step.ops) console.log(`      ${op.op} ${op.path}`);
      } else {
        console.log(`      POST ${step.path}`);
      }
    }
  }
  for (const warning of plan.warnings) console.log(`    WARNING: ${warning}`);
}

async function main(): Promise<void> {
  console.log(APPLY ? 'Mode: APPLY' : 'Mode: dry run (pass --apply to change the cluster)');

  const targets = await loadTargets();
  console.log(`${targets.length} agent row(s) with a Deployment${ONLY_AGENT ? ` (filtered to ${ONLY_AGENT})` : ''}`);

  let failures = 0;
  let skipped = 0;
  for (const target of targets) {
    const namespaceError = validateNamespace(target.namespace);
    if (namespaceError) {
      console.log(`- ${target.namespace}/${target.name}: SKIPPED — ${namespaceError}`);
      skipped++;
      continue;
    }
    try {
      const plan = await planAgentMigration(client, target, {
        ingressControllerNamespace: INGRESS_CONTROLLER_NAMESPACE,
      });
      printPlan(plan);
      if (plan.status === 'skipped') skipped++;
      if (APPLY && plan.status === 'planned') {
        const result = await applyAgentMigration(client, plan);
        if (result.error) {
          failures++;
          console.log(`    FAILED after ${result.applied} step(s): ${result.error}`);
        } else {
          console.log(`    applied ${result.applied} step(s)`);
        }
      }
    } catch (error) {
      failures++;
      console.log(`- ${target.namespace}/${target.name}: ERROR — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!ONLY_AGENT) {
    console.log('Deployments without an agent row:');
    await reportUnclaimedDeployments(targets);
  }

  console.log(`Done. ${failures} failure(s), ${skipped} skipped (review those manually).`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
