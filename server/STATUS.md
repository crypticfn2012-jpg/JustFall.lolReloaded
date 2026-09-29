# Server status

## Current state

The preserved JustFall.LOL Unity WebGL client is the target client.

The original browser build is not yet connected to the replacement backend.

The browser client uses Photon Realtime binary networking over WebSocket/WSS. A JSON WebSocket room server is not compatible with it. The production backend therefore needs a Photon-compatible binary codec and the Name Server -> Master Server -> Game Server flow.

GitHub Pages can host the launcher and original WebGL files, but it cannot run the realtime socket server. The production layout is:

- GitHub Pages: launcher and original Unity WebGL client
- Dedicated WSS server: realtime networking, rooms and matchmaking
- Supabase: accounts, cosmetics, unlocks, stats and persistence

This status file deliberately does not claim multiplayer is finished until the preserved client actually completes its Photon connection and can enter a room.
