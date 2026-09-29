#!/bin/sh
set -eu
HOST="${PUBLIC_HOST:-localhost}"
case "$HOST" in
  ws://*|wss://*) ;;
  *) HOST="wss://$HOST" ;;
esac
cat > /app/config.json <<EOF
{
  "Ports": [27001],
  "PublicHost": "$HOST",
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
exec dotnet /app/photon-server.dll
