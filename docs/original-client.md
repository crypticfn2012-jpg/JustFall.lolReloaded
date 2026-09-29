# Original JustFall WebGL client

Reloaded now treats the original Unity WebGL build as the primary client target.

The preserved build is Unity 2019.4.16f1 and contains the original game data, WASM and loader. Public mirrors of the same WebGL distribution expose the same UnityLoader/WebGL.json structure.

The repository launcher at `/original/` loads the preserved client distribution from a public mirror so the project can be tested without committing large binary Unity artifacts into Git.

## Important

The original client currently reaches Photon but the historical Photon application is archived. A browser cannot simply redirect the client's WSS connection to an arbitrary Reloaded server because Photon WebSocket traffic is a binary protocol, not JSON.

The next compatibility layer therefore needs:

1. Identify the exact Photon Realtime/PUN build used by this client.
2. Identify the Name Server/master/game-server endpoints and WebSocket protocol version.
3. Capture the client's initial operations/events.
4. Use a clean-room Photon-compatible implementation or a purpose-built gateway.
5. Patch only the client endpoint/configuration required to point at Reloaded.
6. Keep the Unity gameplay/assets untouched.

Do not replace the original client with a JavaScript remake.

## Known public evidence

Multiple public mirrors still expose the original Unity WebGL package and reference the JustFall WebGL `WebGL.json` and `UnityLoader.js` files. The project should prefer the preserved local copy when deploying privately and may use the launcher mirror only as a bootstrap/test source.

## Runtime status

The original Unity client has been independently confirmed to load locally. Multiplayer is not considered restored until the original client completes its network handshake against the Reloaded backend.
