# Reloaded multiplayer server

This directory is the real-server side of JustFall.lol Reloaded.

The original Unity WebGL client uses Photon Realtime networking. Browser WebGL clients require WebSocket/WSS transport, while the Photon payload remains binary rather than JSON. The replacement server therefore has to provide Photon-compatible Name Server, Master Server and Game Server behaviour.

The current clean-room base being evaluated is LuxonServer:
https://github.com/niansa/LuxonServer

Do not replace the original client with a JavaScript game and do not use the old JSON room server as the multiplayer backend.

## Required runtime

- Linux or Windows VPS
- Public DNS
- TLS/WSS endpoint
- LuxonServer or an equivalent Photon-compatible implementation
- Supabase for persistent account/cosmetic data

## Current integration order

1. Build LuxonServer.
2. Configure Name/Master/Game servers and public addresses.
3. Expose WebSocket/WSS transport.
4. Verify the preserved JustFall client reaches the replacement Name Server.
5. Verify region response.
6. Verify Master Server redirect.
7. Verify Game Server room creation/join.
8. Verify two original clients exchange the game's actual Photon events.
9. Add the Supabase persistence bridge.
10. Deploy the public web client.

The exact historical JustFall Photon application/version and the client-visible operation/event set still have to be confirmed from the preserved client before calling the backend production-ready.


## Architecture

The realtime service is separate from GitHub Pages. GitHub Pages is static hosting only; the multiplayer service needs a persistent WSS endpoint.
