#!/bin/sh
set -eu

HOST="${PUBLIC_HOST:-}"
if [ -z "$HOST" ]; then
  echo "PUBLIC_HOST is required"
  exit 1
fi

case "$HOST" in
  https://*) HOST="wss://${HOST#https://}" ;;
  http://*)  HOST="ws://${HOST#http://}" ;;
  ws://*|wss://*) ;;
  *) HOST="wss://$HOST" ;;
esac

case "$HOST" in
  */ws|*/ws/) ;;
  *) HOST="${HOST%/}/ws" ;;
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

echo "Advertising Photon browser endpoint: $HOST"
exec dotnet /app/photon-server.dll
