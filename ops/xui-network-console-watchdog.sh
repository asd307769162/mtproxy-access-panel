#!/bin/sh
set -eu

if docker exec xui-network-console node -e "fetch('http://127.0.0.1:8787/').then(r=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  exit 0
fi

logger -t xui-network-console-watchdog "backend unavailable; restarting xui-network-console"
cd /opt/xui-network-console
docker compose restart xui-network-console

