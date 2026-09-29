#!/bin/sh
set -eu
cat > /app/config.json <<EOF
{
  "Ports": [27001],
  "PublicHost": "${PUBLIC_HOST:-localhost}",
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