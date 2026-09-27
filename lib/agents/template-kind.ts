/**
 * Which deploy path an agent went through, which decides which Kubernetes
 * resource types it can own:
 * - 'opencode': the multi-container OpenCode templates (PVC, Secret,
 *   ConfigMap, NetworkPolicy, Deployment, Service, Traefik Middlewares and
 *   IngressRoute, cert-manager Certificate).
 * - 'standard': everything else (Deployment, Service, Ingress).
 */
export type AgentTemplateKind = 'standard' | 'opencode';

export type OpenCodeTemplateType = 'opencode-ide' | 'opencode-chamber';

const OPENCODE_TEMPLATE_NAMESPACE = 'veriteknik';
const OPENCODE_TEMPLATE_NAMES: readonly OpenCodeTemplateType[] = ['opencode-ide', 'opencode-chamber'];

/** The OpenCode template type of a template row, or null for any other template. */
export function openCodeTemplateType(
  template: { namespace?: string | null; name?: string | null } | null | undefined
): OpenCodeTemplateType | null {
  if (template?.namespace !== OPENCODE_TEMPLATE_NAMESPACE) return null;
  return OPENCODE_TEMPLATE_NAMES.find((name) => name === template.name) ?? null;
}

/**
 * The template kind of an agent row.
 *
 * `template` is the agent's template row (via agents.template_uuid, which
 * only the app writes). `metadata.template_name` ("namespace/name", written
 * at creation) is a fallback for agents whose template row was deleted
 * (template_uuid is ON DELETE SET NULL). Metadata is user-editable, so it can
 * only ever widen the result to 'opencode' — the stricter kind for teardown —
 * never narrow an OpenCode agent to 'standard'.
 */
export function agentTemplateKind(
  template: { namespace?: string | null; name?: string | null } | null | undefined,
  metadata?: unknown
): AgentTemplateKind {
  if (openCodeTemplateType(template)) return 'opencode';

  const templateName =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).template_name : undefined;
  if (typeof templateName === 'string') {
    const slash = templateName.indexOf('/');
    if (slash > 0 && openCodeTemplateType({ namespace: templateName.slice(0, slash), name: templateName.slice(slash + 1) })) {
      return 'opencode';
    }
  }
  return 'standard';
}
