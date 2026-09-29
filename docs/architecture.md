# JustFall.lol Reloaded architecture

## Target

The original Unity WebGL client remains the game client.

```
Browser
  |
  v
Reloaded website
  |
  v
Original Unity WebGL client
  |
  | Photon-compatible WebSocket protocol
  v
Reloaded networking gateway
  |
  +--> matchmaking / rooms / relay
  |
  +--> Supabase: accounts, profiles, unlocks, stats
```

## Why the current JSON WebSocket server is not the final multiplayer backend

The old Unity client does not speak the JSON protocol used by the temporary Reloaded prototype. Photon Realtime uses a binary operation/event protocol over WebSocket for WebGL clients. A compatibility server must therefore implement the client-visible Photon behavior instead of translating arbitrary REST calls.

The existing JSON server is retained only as a development harness and reference for room/game-state behavior. It is not claimed to be compatible with the original Unity client.

## Current milestones

- [x] Preserve/identify original Unity WebGL build
- [x] Launch original Unity WebGL client from Reloaded
- [x] Confirm original client reaches historical Photon service
- [ ] Capture exact original Photon handshake
- [ ] Implement compatible WebSocket transport
- [ ] Region/master/game-server flow
- [ ] Room join/create
- [ ] Original player synchronization
- [ ] Original game events
- [ ] Supabase account bridge
- [ ] All original client modes verified
- [ ] Public deployment
