# Agent ownership labels, least-privilege RBAC and OpenCode isolation: rollout runbook

This release changes how pluggedin-app manages agent resources in the shared
`agents` namespace. Three things must happen around the deploy, in order:
apply the new RBAC Role, deploy the app, then migrate the agents that are
already running. This page lists the steps, the permissions, and what changes
for users and operators.

## What changed and why

- **Ownership is checked on every operation, not only on deploy.** Resource
  names come from agent names, and an agent name becomes free again when its
  row is deleted. Every resource, and now every pod, carries
  `pap.plugged.in/agent-uuid=<agent uuid>`.
  - Logs, events and pod status select pods by that label.
  - Status, scale, suspend/resume, restart and upgrade read the Deployment
    first and refuse unless its label equals the agent's uuid. The patch then
    names the Deployment's uid, so an object replaced in between is not
    patched.
  - Unlabelled Deployments are refused as well. That covers leftovers of
    deleted accounts, and also **legacy agents until their labels are
    backfilled** (step 4). A refused scale, suspend/resume, shutdown, restart
    or upgrade returns HTTP 409. Logs, events and status come back empty.
- **`kubernetes_deployment` is recorded only after a successful deploy.** A
  deploy refused because the name is held by somebody else's leftovers
  (`ownership_conflict: true` in the ERROR lifecycle event) leaves the row
  without a deployment name, so no name-addressed route can reach the
  leftover. A deploy that fails removes what it created, even when it fails
  by timeout.
- **Teardown reads nothing.** Account deletion, Hub deletion, admin
  terminate/kill/delete and `DELETE /api/agents/[id]` delete with
  label-scoped `deletecollection` calls:
  - `pap.plugged.in/agent-uuid=<uuid>` + `metadata.name=<n>` for the agent's
    own resources;
  - `!pap.plugged.in/agent-uuid` + `metadata.name=<n>` for legacy
    (unlabelled) resources, limited to the resource types the agent's template
    creates. A standard agent never deletes an unlabelled Secret, PVC or
    ConfigMap left under its name by some deleted OpenCode agent.

  The legacy pass runs only for rows whose `kubernetes_deployment` was set.
  After this release that happens only when a deploy succeeds. Rows created
  earlier have the name set from insert.

  A permission error (or any error) on a type the agent's template creates
  fails the teardown, because the resource cannot be proven absent. The
  account, Hub or row is then kept so the name stays reserved. An error on a
  type the template never creates does not block. Neither does an error on
  the cert-manager TLS Secret: it holds only a certificate for the agent's own
  hostname, tenants never see its key, and a later agent with the same name
  reuses it rather than adopting it. Both cases are reported as
  `ignoredResources`. A 404 on a collection (a CRD that is not installed)
  means that nothing of that type exists.
- **The app no longer needs to read Secrets.** A deploy that finds an existing
  `<name>-secrets` refuses it without reading it. The unused
  `updateOpenCodeAgentSecret`, which patched a Secret by name, was removed.
- **OpenCode isolation for new deploys.** This shipped earlier on the branch:
  ttyd and opencode-serve listen on loopback only and are not published on
  the Service, ttyd gets no credentials, and each agent gets a
  `<name>-netpol` NetworkPolicy. Existing agents get the same treatment from
  the migration in step 4.

## RBAC: exactly what the app's token needs

The Role is [`pap-agent-manager-rbac.yaml`](./pap-agent-manager-rbac.yaml). It
is namespaced (`agents`) and bound to the `pap-agent-manager` ServiceAccount.
A test keeps it identical to `AGENT_MANAGER_PERMISSIONS` in
`lib/services/kubernetes-service.ts`, and checks it against every request a
full agent lifecycle makes.

| API group | Resource | Verbs | Used for |
|---|---|---|---|
| apps | deployments | get, list, create, patch, deletecollection | ownership check before every operation; admin cluster list; deploy; scale/restart/upgrade; teardown and rollback |
| "" | pods | list | pods selected by owner label (logs, events, status) |
| "" | pods/log | get | logs |
| "" | events | list | events of the owned Deployment and pods |
| "" | services | get, create, deletecollection | deploy (get = owner check on 409); teardown |
| "" | configmaps | get, create, deletecollection | same |
| "" | persistentvolumeclaims | get, create, deletecollection | same |
| "" | secrets | create, deletecollection | deploy; teardown. **No get, list or watch.** |
| networking.k8s.io | ingresses | get, create, deletecollection | standard agents |
| networking.k8s.io | networkpolicies | get, create, deletecollection | OpenCode isolation |
| traefik.io | middlewares, ingressroutes | get, create, deletecollection | OpenCode routing |
| cert-manager.io | certificates | get, create, deletecollection | OpenCode TLS |

Not granted: `delete` (single object; every delete is label-scoped
`deletecollection`), `get`/`list`/`watch` on Secrets, `patch` on anything but
Deployments, `deployments/scale`, `pods/exec`, `pods/portforward`, and
anything cluster-scoped.

The previous release used `delete`, `get secrets` and `deployments/scale`
(and read every resource type before deleting it). Keep any broader binding
until this release is verified (step 6).

## Rollout, in order

### 0. Inventory (read-only, optional but recommended)

From a checkout of this release with `DATABASE_URL` and cluster access (see
step 4 for the variables), run the migration in its default dry-run mode:

```bash
kubectl proxy --port=8001 &
K8S_MIGRATION_API_URL=http://127.0.0.1:8001 pnpm tsx scripts/migrate-opencode-agent-isolation.ts
```

It prints, per agent, what it would change. It also prints `SKIPPED` agents,
whose identity it could not verify, and `UNCLAIMED` Deployments, which no
agent row points at. Nothing is changed.

### 1. Apply the RBAC Role BEFORE deploying the app

```bash
kubectl apply -f docs/ops/pap-agent-manager-rbac.yaml
# For every other namespace in K8S_ALLOWED_NAMESPACES the app deploys to
# (agents-dev, agents-staging, ...), apply a copy with metadata.namespace
# changed on both the Role and the RoleBinding.
```

Check it with the ServiceAccount's identity:

```bash
SA=system:serviceaccount:agents:pap-agent-manager
for check in \
  "get deployments" "list deployments" "create deployments" "patch deployments" "deletecollection deployments" \
  "list pods" "get pods --subresource=log" "list events" \
  "create secrets" "deletecollection secrets" \
  "create networkpolicies.networking.k8s.io" "deletecollection networkpolicies.networking.k8s.io" \
  "get services" "create services" "deletecollection services" \
  "get persistentvolumeclaims" "deletecollection persistentvolumeclaims" \
  "get configmaps" "deletecollection configmaps" \
  "get ingresses.networking.k8s.io" "deletecollection ingresses.networking.k8s.io" \
  "get middlewares.traefik.io" "deletecollection middlewares.traefik.io" \
  "get ingressroutes.traefik.io" "deletecollection ingressroutes.traefik.io" \
  "get certificates.cert-manager.io" "deletecollection certificates.cert-manager.io"; do
  printf '%-60s %s\n' "$check" "$(kubectl auth can-i $check -n agents --as=$SA)"
done
```

Every line must say `yes`. If a Traefik or cert-manager CRD is not installed
in the cluster, its lines may say `no`; teardown treats a missing CRD as
"nothing of that type exists".

### 2. Deploy the app

Deploy this release as usual. From here on:

- New agents are deployed with owner labels on their pods.
- Until step 4 has run for a legacy agent, its logs, events and status come
  back empty, and scale, suspend/resume, shutdown, restart and upgrade answer
  409. Deleting it still works.

When the app first hits a 403 from Kubernetes, it logs once per namespace
which permissions the token lacks, as `[K8s] The Kubernetes token lacks
permissions ...`. It checks with SelfSubjectAccessReview. The admin server
action `checkAgentManagerPermissions(namespace)` in
`app/admin/clusters/actions.ts` runs the same check on demand.

### 3. Rotate what the OpenCode chamber agents exposed

Before this release, a chamber agent's ttyd ran an unauthenticated shell on
0.0.0.0:7681. Its environment held the Hub API key (`PAP_API_KEY` /
`PLUGGEDIN_API_KEY`, the project's API key) and `MODEL_ROUTER_TOKEN`. Any pod
in the `agents` namespace could reach it. Treat those credentials as exposed:
after step 4, rotate the project API keys that chamber agents use, and revoke
and reissue their model-router tokens, in line with your incident process.

### 4. Migrate existing agents (owner labels + OpenCode isolation)

`scripts/migrate-opencode-agent-isolation.ts` handles every agent row with a
Deployment. The planning logic is `lib/agents/isolation-migration.ts`, which
uses the same manifest generator as a new deploy.

- **All agents:** it backfills `pap.plugged.in/agent-uuid` on the
  Deployment, its pod template (one rolling restart) and the agent's other
  resources.
- **It claims a Deployment only if it provably belongs to the agent:**
  already labelled with the agent's uuid, or unlabelled with a pod spec whose
  `AGENT_UUID` / `PAP_AGENT_ID` values all equal it. Those are protected env
  keys that the app sets and users cannot override. Anything else is
  `SKIPPED`: another uuid, no identity, a template mismatch, or a reserved
  name.
- **OpenCode agents, additionally:**
  - it creates `<name>-netpol` first;
  - it removes ports 7681 and 4000 from the Service;
  - it removes IngressRoute routes that point at those ports, and keeps all
    other routes as they are;
  - it sets ttyd to `-i lo` with the reduced environment (no credentials) and
    no container port;
  - it sets opencode-serve to `HOST=127.0.0.1` with exec probes and no
    container port;
  - it sets openchamber's `OPENCODE_URL` to `http://127.0.0.1:4000`.

  All container changes are in one patch, so the pod rolls once.
- **Every patch is a JSON Patch that first tests the uid** it planned against
  (and each container's name at its index). A resource that changed in the
  meantime is not modified: that step fails, and a re-run plans again.
- **Idempotent.** A second run reports `up to date`.

Credentials: the migration needs more than the app's Role, on purpose. Run it
with your own kubeconfig through `kubectl proxy`, or with a short-lived admin
token. It needs, in each agent namespace:

- get and patch on deployments, services, ingresses, configmaps,
  persistentvolumeclaims, secrets, middlewares, ingressroutes, certificates
  and networkpolicies;
- create on networkpolicies;
- list on deployments.

It never prints Secret contents.

```bash
kubectl proxy --port=8001 &
export K8S_MIGRATION_API_URL=http://127.0.0.1:8001   # or the API server URL + K8S_MIGRATION_TOKEN (+ K8S_CA_CERT)
pnpm tsx scripts/migrate-opencode-agent-isolation.ts            # dry run; review it
pnpm tsx scripts/migrate-opencode-agent-isolation.ts --apply    # apply
pnpm tsx scripts/migrate-opencode-agent-isolation.ts            # must report every agent "up to date"
# one agent only:  --agent <uuid>
# NetworkPolicy admits the ingress controller namespace (default kube-system):
#                  --ingress-controller-namespace <ns>
```

Handle what the run reports:

- `SKIPPED`: compare the Deployment's `AGENT_UUID`/`PAP_AGENT_ID` with the
  agent row.
  - If it is a leftover of another (deleted) agent: delete the leftover's
    resources with kubectl. The row's operations stay refused until you do.
  - If it really is this agent's: label it by hand.
- `UNCLAIMED`: no agent row points at the Deployment, so it is a leftover of
  a deleted account. OpenCode ones may still expose ttyd. Delete them after
  review: the Deployment, Service, Ingress/IngressRoute, Middlewares,
  Certificate, `-secrets`, `-config`, `-workspace` and `-tls` by name.
- `WARNING ... labelled for another agent`: a sibling resource carries
  another uuid. It was left alone. Review it.

### 5. Verify

```bash
kubectl -n agents get deploy -L pap.plugged.in/agent-uuid        # every agent Deployment has a uuid
kubectl -n agents get pods   -L pap.plugged.in/agent-uuid        # and so do its pods (after the rollout)
kubectl -n agents get networkpolicy | grep -- -netpol            # one per OpenCode agent
kubectl -n agents get svc <chamber-agent> -o jsonpath='{.spec.ports[*].port}'   # no 7681, no 4000
kubectl -n agents exec deploy/<chamber-agent> -c ttyd -- env | grep -E 'PAP_|PLUGGEDIN_|MODEL_ROUTER_' || echo "ttyd has no credentials"
```

From another agent's pod, `<chamber pod IP>:7681` and `:4000` must not
answer. In the app, logs, events, suspend/resume and restart of a migrated
legacy agent work again.

### 6. Remove broader permissions

Once steps 2–5 are verified, remove every other binding of the
`pap-agent-manager` ServiceAccount, for example a ClusterRoleBinding to
`cluster-admin` or `edit`, or an older Role:

```bash
kubectl get clusterrolebindings,rolebindings -A -o wide | grep pap-agent-manager
```

Re-run the `kubectl auth can-i` loop from step 1. Also confirm that
`kubectl auth can-i get secrets -n agents --as=$SA` now says `no`.

## Rolling back

The previous app release needs permissions this Role does not grant: `delete`,
`get` on Secrets and every other type, and `patch deployments/scale`. Before
rolling the app back, restore the binding it had. The owner labels and the
isolation from step 4 are compatible with the previous release; leave them in
place.

## Known limits

- Agents whose deploy failed before this release still have
  `kubernetes_deployment` set. Their teardown keeps the legacy
  (unlabelled) pass, limited to the resource types of their template.
- A failed deploy's rollback is best effort. If the API refuses a rollback
  delete, the created objects stay behind, labelled with the agent's uuid:
  nobody else can adopt them, and they can be found with
  `kubectl -n agents get all,secret,cm,pvc,netpol -l pap.plugged.in/agent-uuid=<uuid>`.
