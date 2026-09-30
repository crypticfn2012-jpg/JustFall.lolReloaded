#!/bin/sh
set -eu

PORT="${PORT:-8080}"
PHOTON_PORT="${PHOTON_PORT:-27001}"
PUBLIC_HOST="${PUBLIC_HOST:-wss://justfall-lolreloaded.justfalllol.blitz.cloud/ws}"

cat > /app/config.json <<EOF
{
  "Ports": [${PHOTON_PORT}],
  "PublicHost": "${PUBLIC_HOST}",
  "MaxPeersPerRoom": 16,
  "MaxRooms": 1000,
  "RequireAppId": null,
  "RequireAppVersion": null,
  "PeerTimeoutMs": 300000,
  "Region": "eu",
  "VerboseLogging": true,
  "EnablePlugins": false
}
EOF

echo "JustFall Photon starting"
echo "Public WSS endpoint: ${PUBLIC_HOST}"
echo "HTTP/WSS PORT: ${PORT}"
echo "Photon UDP PORT: ${PHOTON_PORT}"

echo "Node: $(node --version 2>&1 || true)"
node -e "require('ws'); console.log('ws module: OK')" 2>&1 || {
  echo "FATAL: Node ws module could not be loaded"
}

echo "Starting Photon server..."
dotnet /app/photon/photon-server.dll > /app/photon.log 2>&1 &
PHOTON_PID=$!

cleanup() {
  echo "Shutting down..."
  kill "$PHOTON_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1

if kill -0 "$PHOTON_PID" 2>/dev/null; then
  echo "Photon process is running (pid $PHOTON_PID)"
else
  echo "Photon process exited during startup"
  cat /app/photon.log 2>/dev/null || true
fi

echo "Starting WSS bridge..."
node /app/render_bridge.js &
BRIDGE_PID=$!

sleep 1

if kill -0 "$BRIDGE_PID" 2>/dev/null; then
  echo "WSS bridge is running (pid $BRIDGE_PID)"
else
  echo "WSS bridge exited during startup"
  exit 1
fi

# Keep the container alive while either service is still useful.
# If Photon dies, keep the WSS bridge alive so Blitz does not restart-loop,
# and expose the Photon crash in /app/photon.log / stdout.
while kill -0 "$BRIDGE_PID" 2>/dev/null; do
  if [ -n "${PHOTON_PID:-}" ] && ! kill -0 "$PHOTON_PID" 2>/dev/null; then
    echo "WARNING: Photon server process $PHOTON_PID stopped"
    cat /app/photon.log 2>/dev/null || true
    PHOTON_PID=
  fi
  sleep 2
done

echo "WSS bridge stopped; exiting"
