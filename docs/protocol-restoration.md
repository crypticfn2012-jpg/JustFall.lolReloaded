# Original-client multiplayer restoration

## Non-negotiable target

The Reloaded project must run the preserved Unity WebGL client itself. A Three.js/JavaScript recreation is not an acceptable substitute.

Photon's documented WebGL transport is WebSocket/WSS and the payload uses the Photon binary protocol. Therefore a JSON WebSocket server cannot work as a drop-in replacement.

## Server base

LuxonServer is a public clean-room Photon LoadBalancing implementation. Its documented architecture provides Name Server, Master Server and Game Server flow, rooms, matchmaking and relay behaviour.

Repository:
https://github.com/niansa/LuxonServer

It is being evaluated as the networking foundation, not blindly assumed to be compatible with this particular JustFall build.

## What must be verified

The preserved JustFall client reports the historical Photon application as archived. Before production deployment we need to identify:

- historical Photon AppId/AppVersion
- exact Photon client/protocol generation
- WebSocket endpoint/path expected by the WebGL client
- region response format
- authentication behaviour
- room properties
- player properties
- operation codes used by the client
- event codes used by the client
- game-state payloads
- cosmetic/player-selection properties

Once those are known, the compatibility server can be tested with the actual original client.

## Why this is different from the old JSON server

The existing JSON server can be useful as a development harness, but the compiled Unity client will not speak its JSON messages. It must remain separate from the production compatibility path.
