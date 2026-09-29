#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# The Render runtime uses the repository root as its working directory.
# Install the bridge dependency before the start command runs.
cd "$ROOT/server"
npm install --omit=dev
cd "$ROOT"

DOTNET_VERSION="10.0.100"
if [ ! -x "$ROOT/.dotnet/dotnet" ]; then
  mkdir -p "$ROOT/.dotnet"
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --version "$DOTNET_VERSION" --install-dir "$ROOT/.dotnet" --no-path
fi

rm -rf "$ROOT/.build/photon-server"
mkdir -p "$ROOT/.build"

git clone --depth 1 https://github.com/Segually/photon-server.git "$ROOT/.build/photon-server"
cd "$ROOT/.build/photon-server"
git fetch --depth 1 origin 1e7cf407ad835a95d7e91e8a005bcc7df46732a4
git checkout 1e7cf407ad835a95d7e91e8a005bcc7df46732a4

python3 "$ROOT/server/photon/patch_server.py"

"$ROOT/.dotnet/dotnet" publish photon-server.csproj -c Release -o "$ROOT/.build/photon-out" --no-self-contained
