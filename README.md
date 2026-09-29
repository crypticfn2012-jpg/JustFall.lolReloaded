# JustFall.lol Reloaded

Community preservation project targeting the **original JustFall.LOL Unity WebGL client**.

## Original client
The game at `/original/` is the original Unity WebGL client, not a JavaScript recreation.

The preserved local build is:
`C:\Users\crypt\Downloads\JustFallEmulator\just-fall`

The public page loads the original Unity WebGL package and intercepts its Photon WebSocket connection before Unity starts.

## Multiplayer backend
The repository now contains the networking path required by the original WebGL client:
`Original Unity WebGL → WSS bridge → Photon-compatible relay → rooms/matchmaking`

The bridge converts browser WebSocket frames into the Photon reliable-UDP transport used by the relay. The relay provides authentication, region discovery, lobbies, room creation/joining, random matchmaking, room redirects and event/player relay.

The old JSON/fake game server has been removed.

## Deployment
`render.yaml` defines:
- `justfall-ws` — public WebSocket service
- `justfall-photon` — private Photon relay

## Supabase
Supabase is reserved for persistent data:
- accounts
- display names
- cosmetic selections
- unlock state
- statistics
- match history

The realtime game loop remains on the networking server.

## Status
**Original Unity client:** ready.
**Fake JavaScript game:** removed from the server path.
**Photon-compatible WSS path:** implemented.
**Public multiplayer:** deploy `render.yaml`, then the original client uses the deployed WSS bridge.

The exact compiled JustFall client remains the final compatibility test because its Photon operations are inside the Unity WebGL build.