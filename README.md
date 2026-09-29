# JustFall.lol Reloaded

A playable community preservation/reimplementation of the old JustFall.lol browser experience.

## Playable

Four modes are implemented:

- Hexagon: disappearing ice survival with multiple rounds
- Just Blocks: collapsing floor survival
- Just Jump: rotating hazard timing mode
- Parkour: checkpoint race to the finish

Each room has up to 8 players. Empty slots are filled with server-side bots so a single browser can immediately play, while multiple real browser tabs can share the same room.

Controls: WASD / Arrow keys, Space to jump, Shift to dive. Mobile touch controls are included.

## Unlocks

Reloaded starts with every included cosmetic unlocked: 12 colour skins and 8 accessories. These are Reloaded cosmetics and are not presented as the exact original game's internal catalogue.

## Local run

Requires Node.js 18+.

npm install
npm start

Open http://localhost:8080/

The server exposes /health, /stats and /ws.

## Hosting

Use a Node Web Service that supports WebSocket upgrades. render.yaml is included for Render.

The browser can connect to a separate backend using ?server=wss://your-server.example/ws.

## Original client

The preserved original Unity WebGL build remains outside this repository at:

C:\Users\crypt\Downloads\JustFallEmulator\just-fall

The old Unity client is still the reference target for future Photon compatibility work. This playable Reloaded build is a working replacement client/server and does not claim that the original archived Photon service has been restored.
