# Project status

_Last updated: 2026-10-06_

plugged.in, the hosted service, is moving to a new, separately developed platform. After that move, the
open-source repositories listed below will no longer run plugged.in. They stay open source under their current
licenses and continue as community projects with open collaboration.

## What changes

- The hosted service at [plugged.in](https://plugged.in) will run on the new platform instead of this codebase.
- After the cutover, the hosted plugged.in API that the SDKs, the Claude Code plugin and `pluggedin-mcp` talk to
  today will no longer serve them. Point them at your own `pluggedin-app` instance instead.
- The cutover date will be announced in this repository at least 60 days in advance.

## What does not change

- **Licenses.** Every repository keeps its current license.
- **Self-hosting.** `pluggedin-app` remains self-hostable with the Docker setup in this repository.
- **Collaboration.** Issues, pull requests and forks stay open in every repository.
- **Security reports.** Report vulnerabilities privately through GitHub Security Advisories, as before.

## For hosted plugged.in users

- The cutover date will be announced here at least 60 days in advance.
- Your account will move to the new platform at the cutover.
- You will be able to export your content. Export instructions will come with the cutover announcement.
- If you prefer, you can self-host `pluggedin-app` and keep using this codebase as it is.

## For contributors

- Contributions are welcome in every repository listed below.
- We are looking for co-maintainers. If you want to help maintain one of these repositories, open an issue in it.
- Decisions about these repositories are made in the open, in issues and pull requests.

## Repositories

| Repository | What it is |
|---|---|
| [pluggedin-app](https://github.com/VeriTeknik/pluggedin-app) | The web app, API and MCP connector that runs plugged.in today |
| [pluggedin-mcp](https://github.com/VeriTeknik/pluggedin-mcp) | MCP hub/proxy that connects MCP clients to a plugged.in instance |
| [pluggedin-plugin](https://github.com/VeriTeknik/pluggedin-plugin) | Claude Code plugin for plugged.in |
| [pluggedinkit-js](https://github.com/VeriTeknik/pluggedinkit-js) | JavaScript/TypeScript SDK |
| [pluggedinkit-python](https://github.com/VeriTeknik/pluggedinkit-python) | Python SDK |
| [pluggedinkit-go](https://github.com/VeriTeknik/pluggedinkit-go) | Go SDK |
| [pluggedin-docs](https://github.com/VeriTeknik/pluggedin-docs) | Documentation site |
| [registry-proxy](https://github.com/VeriTeknik/registry-proxy) | MCP registry proxy |
| [PAP](https://github.com/VeriTeknik/PAP) | Plugged.in Agent Protocol specification |
| [pap-model-router](https://github.com/VeriTeknik/pap-model-router) | Multi-provider LLM router for PAP agents |
| [pap-heartbeat-collector](https://github.com/VeriTeknik/pap-heartbeat-collector) | Heartbeat collector for PAP agents |
| [compass-agent](https://github.com/VeriTeknik/compass-agent) | Reference PAP agent (multi-model consensus) |
| [pluggedin-observability](https://github.com/VeriTeknik/pluggedin-observability) | Observability stack (Prometheus, Grafana, Loki) |
