/**
 * In-memory fake of the Kubernetes API for the r2c tests, served through a
 * mocked `https` module. No cluster is ever contacted.
 *
 * Usage in a test file:
 *
 *   const k8s = vi.hoisted(() => { process.env.K8S_SERVICE_ACCOUNT_TOKEN = 't'; return {} as never });
 *   vi.mock('https', async () => (await import('./r2c-k8s-fake')).httpsModule());
 *   import { fake } from './r2c-k8s-fake';
 *
 * Supports: item GET/PATCH/DELETE, collection POST, collection GET (list) and
 * collection DELETE (deletecollection) with label and field selectors, the
 * pods/{name}/log subresource, and SelfSubjectAccessReview.
 */
import { EventEmitter } from 'node:events';

export type K8sObject = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  [key: string]: unknown;
};

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  contentType?: string;
  body?: unknown;
}

const COLLECTIONS = new Set([
  'deployments',
  'services',
  'ingresses',
  'networkpolicies',
  'configmaps',
  'secrets',
  'persistentvolumeclaims',
  'middlewares',
  'ingressroutes',
  'certificates',
  'pods',
  'events',
  'selfsubjectaccessreviews',
]);

export const fake = {
  objects: new Map<string, K8sObject>(),
  calls: [] as RecordedCall[],
  /** `${METHOD} ${path}` or `${path}` (any method) -> HTTP status to fail with */
  failures: new Map<string, number>(),
  /** `${verb} ${group}/${resource}` denied by the SelfSubjectAccessReview fake */
  denied: new Set<string>(),
  /** Pod name -> log text */
  logs: new Map<string, string>(),
  uid: 0,
  /** Called after each request has been served (e.g. to simulate a concurrent change). */
  after: undefined as undefined | ((call: RecordedCall) => void),
  reset() {
    this.objects.clear();
    this.calls.length = 0;
    this.failures.clear();
    this.denied.clear();
    this.logs.clear();
    this.uid = 0;
    this.after = undefined;
  },
  /** Store an object at its item path. */
  seed(path: string, obj: Omit<K8sObject, 'metadata'> & { metadata: Partial<K8sObject['metadata']> }) {
    const name = obj.metadata.name ?? decodeURIComponent(path.split('/').pop()!);
    const stored: K8sObject = {
      ...obj,
      metadata: { uid: `seed-${name}`, labels: {}, ...obj.metadata, name },
    } as K8sObject;
    this.objects.set(path, stored);
    return stored;
  },
  get(path: string) {
    return this.objects.get(path);
  },
  callsOf(method: string, pathPrefix?: string) {
    return this.calls.filter((c) => c.method === method && (pathPrefix === undefined || c.path.startsWith(pathPrefix)));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

function matchesLabelSelector(obj: K8sObject, selector: string | null): boolean {
  if (!selector) return true;
  const labels = obj.metadata.labels ?? {};
  return selector.split(',').every((raw) => {
    const term = raw.trim();
    if (!term) return true;
    if (term.startsWith('!')) return !(term.slice(1) in labels);
    const ne = term.indexOf('!=');
    if (ne > 0) return labels[term.slice(0, ne)] !== term.slice(ne + 2);
    const eq = term.indexOf('=');
    if (eq > 0) {
      const key = term.slice(0, eq);
      const value = term.slice(eq + 1).replace(/^=/, '');
      return labels[key] === value;
    }
    return term in labels;
  });
}

function fieldValue(obj: K8sObject, field: string): unknown {
  return field.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

function matchesFieldSelector(obj: K8sObject, selector: string | null): boolean {
  if (!selector) return true;
  return selector.split(',').every((raw) => {
    const term = raw.trim();
    if (!term) return true;
    const ne = term.indexOf('!=');
    if (ne > 0) return String(fieldValue(obj, term.slice(0, ne)) ?? '') !== term.slice(ne + 2);
    const eq = term.indexOf('=');
    const key = term.slice(0, eq);
    const value = term.slice(eq + 1).replace(/^=/, '');
    return String(fieldValue(obj, key) ?? '') === value;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Patching
// ─────────────────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Simplified strategic merge: objects merge, arrays of named objects merge by name. */
function strategicMerge(target: unknown, patch: unknown): unknown {
  if (Array.isArray(patch)) {
    if (Array.isArray(target) && patch.every((p) => isObject(p) && typeof p.name === 'string')) {
      const out = target.map((t) => ({ ...(t as object) })) as Array<Record<string, unknown>>;
      for (const p of patch as Array<Record<string, unknown>>) {
        const i = out.findIndex((t) => t.name === p.name);
        if (i >= 0) out[i] = strategicMerge(out[i], p) as Record<string, unknown>;
        else out.push(p);
      }
      return out;
    }
    return patch;
  }
  if (isObject(patch)) {
    const out: Record<string, unknown> = isObject(target) ? { ...target } : {};
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v === null ? undefined : strategicMerge(out[k], v);
    }
    return out;
  }
  return patch;
}

function pointer(path: string): string[] {
  return path
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function applyJsonPatch(doc: K8sObject, ops: Array<{ op: string; path: string; value?: unknown }>): K8sObject {
  const copy = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  for (const op of ops) {
    const keys = pointer(op.path);
    const last = keys.pop()!;
    let parent: unknown = copy;
    for (const key of keys) {
      parent = (parent as Record<string, unknown>)?.[key];
      if (parent === undefined) throw Object.assign(new Error(`path ${op.path} missing`), { status: 422 });
    }
    const container = parent as Record<string, unknown> | unknown[];
    if (op.op === 'test') {
      const actual = (container as Record<string, unknown>)[last];
      if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
        throw Object.assign(new Error(`test failed at ${op.path}`), { status: 422 });
      }
    } else if (op.op === 'remove') {
      if (Array.isArray(container)) container.splice(Number(last), 1);
      else delete container[last];
    } else if (op.op === 'add' || op.op === 'replace') {
      if (Array.isArray(container)) {
        if (last === '-') container.push(op.value);
        else if (op.op === 'add') container.splice(Number(last), 0, op.value);
        else container[Number(last)] = op.value;
      } else {
        if (op.op === 'replace' && !(last in container)) {
          throw Object.assign(new Error(`replace of missing ${op.path}`), { status: 422 });
        }
        container[last] = op.value;
      }
    } else {
      throw Object.assign(new Error(`unsupported op ${op.op}`), { status: 422 });
    }
  }
  return copy as K8sObject;
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

type Result = { status: number; body: unknown; text?: string };

function status(code: number, reason: string): Result {
  return { status: code, body: { kind: 'Status', code, reason } };
}

function route(method: string, path: string, query: URLSearchParams, contentType: string | undefined, body: unknown): Result {
  const forced = fake.failures.get(`${method} ${path}`) ?? fake.failures.get(path);
  if (forced) return status(forced, 'Forced');

  const segments = path.split('/');
  const last = segments[segments.length - 1];

  if (last === 'selfsubjectaccessreviews' && method === 'POST') {
    const attrs = ((body as { spec?: { resourceAttributes?: Record<string, string> } })?.spec?.resourceAttributes ?? {});
    const key = `${attrs.verb} ${attrs.group ?? ''}/${attrs.resource}${attrs.subresource ? `/${attrs.subresource}` : ''}`;
    return { status: 201, body: { status: { allowed: !fake.denied.has(key) } } };
  }

  if (last === 'log' && segments[segments.length - 3] === 'pods') {
    const pod = decodeURIComponent(segments[segments.length - 2]);
    const text = fake.logs.get(pod);
    return text === undefined ? status(404, 'NotFound') : { status: 200, body: text, text };
  }

  if (COLLECTIONS.has(last)) {
    const prefix = `${path}/`;
    const members = [...fake.objects.entries()].filter(
      ([p, obj]) =>
        p.startsWith(prefix) &&
        !p.slice(prefix.length).includes('/') &&
        matchesLabelSelector(obj, query.get('labelSelector')) &&
        matchesFieldSelector(obj, query.get('fieldSelector'))
    );
    if (method === 'GET') {
      return { status: 200, body: { kind: 'List', items: members.map(([, o]) => o) } };
    }
    if (method === 'DELETE') {
      for (const [p] of members) fake.objects.delete(p);
      return { status: 200, body: { kind: 'List', items: members.map(([, o]) => o) } };
    }
    if (method === 'POST') {
      const obj = body as K8sObject;
      const key = `${path}/${encodeURIComponent(obj.metadata.name)}`;
      if (fake.objects.has(key)) return status(409, 'AlreadyExists');
      const stored = { ...obj, metadata: { ...obj.metadata, uid: `uid-${++fake.uid}` } } as K8sObject;
      fake.objects.set(key, stored);
      return { status: 201, body: stored };
    }
    return status(405, 'MethodNotAllowed');
  }

  const existing = fake.objects.get(path);
  if (method === 'GET') return existing ? { status: 200, body: existing } : status(404, 'NotFound');
  if (method === 'DELETE') {
    if (!existing) return status(404, 'NotFound');
    const pre = ((body as { preconditions?: { uid?: string } })?.preconditions ?? {});
    if (pre.uid && pre.uid !== existing.metadata.uid) return status(409, 'Conflict');
    fake.objects.delete(path);
    return { status: 200, body: { kind: 'Status', status: 'Success' } };
  }
  if (method === 'PATCH') {
    if (!existing) return status(404, 'NotFound');
    try {
      let next: K8sObject;
      if (contentType === 'application/json-patch+json') {
        next = applyJsonPatch(existing, body as Array<{ op: string; path: string; value?: unknown }>);
      } else {
        next = strategicMerge(existing, body) as K8sObject;
      }
      // metadata.uid is immutable: a patch naming another uid is rejected.
      if (next.metadata.uid !== existing.metadata.uid) return status(422, 'Invalid');
      fake.objects.set(path, next);
      return { status: 200, body: next };
    } catch (error) {
      return status((error as { status?: number }).status ?? 500, 'Invalid');
    }
  }
  return status(405, 'MethodNotAllowed');
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

type FakeRequest = EventEmitter & {
  write: (chunk: string) => void;
  end: () => void;
  setTimeout: () => void;
  destroy: () => void;
};
type FakeResponse = EventEmitter & { statusCode: number; statusMessage: string };

function request(
  options: { method?: string; path: string; headers?: Record<string, string> },
  cb: (res: FakeResponse) => void
): FakeRequest {
  const req = new EventEmitter() as FakeRequest;
  let payload = '';
  req.write = (chunk: string) => {
    payload += chunk;
  };
  req.setTimeout = () => undefined;
  req.destroy = () => undefined;
  req.end = () => {
    const method = options.method || 'GET';
    const [path, search = ''] = options.path.split('?');
    const query = new URLSearchParams(search);
    const contentType = options.headers?.['Content-Type'];
    const body = payload ? JSON.parse(payload) : undefined;
    const call = { method, path, query, contentType, body };
    fake.calls.push(call);
    const result = route(method, path, query, contentType, body);
    fake.after?.(call);
    const res = new EventEmitter() as FakeResponse;
    res.statusCode = result.status;
    res.statusMessage = STATUS_TEXT[result.status] ?? '';
    queueMicrotask(() => {
      cb(res);
      res.emit('data', result.text ?? JSON.stringify(result.body));
      res.emit('end');
    });
  };
  return req;
}

/** Module shape to return from `vi.mock('https', ...)`. */
export function httpsModule() {
  return { request, default: { request } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths used across the r2c tests
// ─────────────────────────────────────────────────────────────────────────────

const NS = '/namespaces/agents';
export function pathsFor(name: string) {
  return {
    deployment: `/apis/apps/v1${NS}/deployments/${name}`,
    deployments: `/apis/apps/v1${NS}/deployments`,
    service: `/api/v1${NS}/services/${name}`,
    services: `/api/v1${NS}/services`,
    ingress: `/apis/networking.k8s.io/v1${NS}/ingresses/${name}`,
    ingresses: `/apis/networking.k8s.io/v1${NS}/ingresses`,
    netpol: `/apis/networking.k8s.io/v1${NS}/networkpolicies/${name}-netpol`,
    netpols: `/apis/networking.k8s.io/v1${NS}/networkpolicies`,
    configmap: `/api/v1${NS}/configmaps/${name}-config`,
    configmaps: `/api/v1${NS}/configmaps`,
    secret: `/api/v1${NS}/secrets/${name}-secrets`,
    tlsSecret: `/api/v1${NS}/secrets/${name}-tls`,
    secrets: `/api/v1${NS}/secrets`,
    pvc: `/api/v1${NS}/persistentvolumeclaims/${name}-workspace`,
    pvcs: `/api/v1${NS}/persistentvolumeclaims`,
    middlewares: `/apis/traefik.io/v1alpha1${NS}/middlewares`,
    middlewareCode: `/apis/traefik.io/v1alpha1${NS}/middlewares/${name}-strip-code`,
    ingressroute: `/apis/traefik.io/v1alpha1${NS}/ingressroutes/${name}`,
    ingressroutes: `/apis/traefik.io/v1alpha1${NS}/ingressroutes`,
    certificate: `/apis/cert-manager.io/v1${NS}/certificates/${name}-tls`,
    certificates: `/apis/cert-manager.io/v1${NS}/certificates`,
    pods: `/api/v1${NS}/pods`,
    pod: (pod: string) => `/api/v1${NS}/pods/${pod}`,
    events: `/api/v1${NS}/events`,
  };
}

export const OWNER_LABEL = 'pap.plugged.in/agent-uuid';
