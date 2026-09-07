/** Platform-issued credentials are injected into the pod, never returned to its owner. */
export function toClientAgent<T extends { model_router_token?: unknown }>(agent: T): Omit<T, 'model_router_token'> {
  const { model_router_token: _platformCredential, ...publicAgent } = agent;
  return publicAgent;
}
