#!/usr/bin/env bash
# Read-only inventory: no restart, install, login change, port opening or env dump.
set -euo pipefail
uname -srmo
free -m
df -h / /opt
docker compose ls --format json
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}\t{{.PIDs}}'
ss -lnt
if [ -f /opt/weknora-semantica/nginx.conf ]; then
  sha256sum /opt/weknora-semantica/nginx.conf
fi
if [ -d /opt/tuominwang ]; then
  stat /opt/tuominwang
fi
