# JustFall.lol Reloaded

Community preservation project targeting the **original JustFall.LOL Unity WebGL client**.

## Play the original client

Run the project and open:

`/original/`

The launcher loads the original Unity WebGL distribution rather than a JavaScript recreation. The original game uses Unity WebGL and its preserved package contains `UnityLoader.js`, `WebGL.json`, the Unity data file and WASM files.

Public mirrors of the original WebGL package are still available, including copies referenced by archived game collections. The local preserved build at:

`C:\Users\crypt\Downloads\JustFallEmulator\just-fall`

remains the preferred source when working from the original files.

## Multiplayer restoration

The original client reaches the historical Photon Realtime service, but the old application now reports `ApplicationArchived`. The final Reloaded backend therefore needs to speak the client's Photon-compatible binary WebSocket protocol.

This repository does **not** pretend that the temporary JSON room server is compatible with the Unity client. It is only a development harness until the Photon compatibility layer is implemented.

Photon's WebGL transport uses WebSocket while the payload remains Photon's binary protocol, so a REST API or JSON WebSocket endpoint cannot replace it.

See:

- `docs/original-client.md`
- `docs/architecture.md`
- `supabase/migrations/001_reloaded_accounts.sql`

## Supabase

Supabase is intended for persistent data such as:

- accounts
- display names
- cosmetic selections
- unlock state
- statistics
- match history

The realtime game loop should remain on the dedicated networking server.

## Local development

Requires Node.js 18+.

```bash
npm install
npm start
```

Open:

`http://localhost:8080/`

The root page links to the original Unity client at `/original/`.

## Important status

**Original Unity client:** available and launchable.

**Original gameplay/assets:** preserved in the Unity WebGL build.

**Original Photon multiplayer:** not restored yet. The remaining blocker is protocol compatibility with the archived Photon backend.

**Reloaded JSON server:** development harness only; not the final original-client server.
