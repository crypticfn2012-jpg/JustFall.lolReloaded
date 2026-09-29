#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cat > "$ROOT/.build/config.json" <<EOF
{
  "Ports": [27001],
  "PublicHost": "justfall-ws.onrender.com:443",
  "MaxPeersPerRoom": 16,
  "MaxRooms": 1000,
  "RequireAppId": null,
  "RequireAppVersion": null,
  "PeerTimeoutMs": 300000,
  "Region": "eu",
  "VerboseLogging": false,
  "EnablePlugins": false
}
EOF

"$ROOT/.dotnet/dotnet" "$ROOT/.build/photon-out/photon-server.dll" &
PHOTON_PID=$!

cleanup(){
  kill "$PHOTON_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PHOTON_HOST=127.0.0.1 PHOTON_PORT=27001 node "$ROOT/server/render_bridge.js"
