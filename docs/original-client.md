# Original client

The project targets the original JustFall.LOL Unity WebGL client.

Known from the preserved build:

- Unity 2019.4.16f1
- WebGL 2 / WebGL 1
- original `UnityLoader.js` + `WebGL.json`
- Photon Realtime networking

The public launcher points at a preserved copy of the original WebGL distribution so the game can be tested without putting the large Unity data files in this repository.

The old Photon application is archived. The replacement server therefore has to reproduce the Photon connection, authentication, lobby, room and event flow expected by this particular client.

A browser override is used only to redirect the client's WebSocket endpoint. The Unity game files themselves are not replaced with a JavaScript remake.
