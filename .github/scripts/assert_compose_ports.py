#!/usr/bin/env python3
"""Fail if a compose file publishes a datastore beyond loopback.

Docker publishes to 0.0.0.0 by default AND installs its iptables rules ahead of
ufw/firewalld, so a bare `5432:5432` on Postgres puts the database on the public
internet regardless of the host firewall. That is not a theoretical concern: the
self-host stack shipped that way, with a password committed to this repository,
until it was fixed.

The app reaches Postgres and Redis over the compose network by service name, so
neither ever needs publishing. Where a mapping exists for host-side admin tools
it must be pinned to loopback.

Usage:
    assert_compose_ports.py <rendered-compose.json> [...]

Each argument is the output of `docker compose -f <file> config --format json`.
Reads rendered output rather than the source YAML on purpose: interpolation,
extends and multiple files are already resolved, so this sees what Docker will
actually do.
"""

from __future__ import annotations

import json
import sys

# Matched against both the service name and its image reference, so a service
# called `db` on the pgvector image is still caught.
DATASTORE_MARKERS = ("postgres", "pgvector", "redis", "valkey", "mysql", "mariadb", "mongo")

LOOPBACK = ("127.0.0.1", "::1", "localhost")


def is_datastore(name: str, image: str) -> bool:
    haystack = f"{name} {image}".lower()
    return any(marker in haystack for marker in DATASTORE_MARKERS)


def check(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8") as handle:
            spec = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        # Refuse to pass on input we could not read. An unreadable render means
        # `docker compose config` failed upstream, and silently succeeding here
        # would turn a broken compose file into a green check.
        return [f"could not read rendered compose JSON — {exc}"]

    problems: list[str] = []
    for name, service in (spec.get("services") or {}).items():
        if not is_datastore(name, str(service.get("image") or "")):
            continue
        for mapping in service.get("ports") or []:
            # A rendered mapping omits host_ip when it was never pinned, which
            # is precisely the 0.0.0.0 default we are guarding against.
            host_ip = mapping.get("host_ip") or "0.0.0.0"
            if host_ip not in LOOPBACK:
                published = mapping.get("published") or mapping.get("target")
                problems.append(
                    f"datastore service '{name}' publishes {published} on {host_ip} — "
                    "pin the mapping to 127.0.0.1, or drop it: the app reaches it "
                    "over the compose network",
                )
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: assert_compose_ports.py <rendered-compose.json> [...]", file=sys.stderr)
        return 2

    failed = False
    for path in argv[1:]:
        problems = check(path)
        if problems:
            failed = True
            for problem in problems:
                print(f"::error file={path}::{problem}")
        else:
            print(f"ok: {path} — datastore ports are loopback-only or unpublished")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
