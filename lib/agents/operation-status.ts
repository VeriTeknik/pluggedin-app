import type { AgentOperationCode } from '@/lib/services/kubernetes-service';

/**
 * HTTP status for a refused name-addressed agent operation
 * (scale/restart/upgrade): 409 when the Deployment under the agent's name is
 * not provably this agent's (a leftover of a deleted agent, or a legacy agent
 * whose ownership label an operator has not backfilled yet), 404 when there
 * is no Deployment, 500 otherwise.
 */
export function agentOperationHttpStatus(result: { code?: AgentOperationCode }): number {
  if (result.code === 'not_owned') return 409;
  if (result.code === 'not_found') return 404;
  return 500;
}
