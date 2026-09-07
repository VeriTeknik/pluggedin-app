// Keep the client contract explicit: adding a database credential column must
// never silently add it to every agent API response.
const CLIENT_AGENT_FIELDS = [
  'uuid', 'name', 'dns_name', 'profile_uuid', 'template_uuid', 'access_level',
  'state', 'heartbeat_mode', 'deployment_status', 'kubernetes_namespace',
  'kubernetes_deployment', 'model_router_service_uuid',
  'model_router_token_issued_at', 'model_router_token_revoked',
  'created_at', 'provisioned_at', 'activated_at', 'terminated_at',
  'last_heartbeat_at', 'metadata', 'config_values',
] as const;

type ClientAgentField = typeof CLIENT_AGENT_FIELDS[number];

/** Platform-issued credentials are injected into the pod, never returned to its owner. */
export function toClientAgent<T extends object>(agent: T): Pick<T, Extract<keyof T, ClientAgentField>> {
  return Object.fromEntries(
    CLIENT_AGENT_FIELDS.filter((key) => Object.hasOwn(agent, key))
      .map((key) => [key, agent[key as keyof T]])
  ) as Pick<T, Extract<keyof T, ClientAgentField>>;
}
