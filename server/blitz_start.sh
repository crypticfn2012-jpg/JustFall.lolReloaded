#!/bin/sh
set -eu

PORT="${PORT:-8080}"
PHOTON_PORT="${PHOTON_PORT:-27001}"
PUBLIC_HOST="${PUBLIC_HOST:-wss://localhost/ws}"

cat > /app/config.json <<EOF
{
  "Ports": [27001],
  "PublicHost": "$PUBLIC_HOST",
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

echo "JustFall Photon starting"
echo "Public WSS endpoint: $PUBLIC_HOST"

python3 /app/health.py &
HEALTH_PID=$!

dotnet /app/photon/photon-server.dll &
PHOTON_PID=$!

cleanup() {
  kill "$PHOTON_PID" "$HEALTH_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PHOTON_HOST=127.0.0.1 PHOTON_PORT="$PHOTON_PORT" PORT="$PORT" \
  node /app/render_bridge.js