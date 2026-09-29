# JustFall.lol Reloaded

Unofficial preservation/revival project for the original JustFall.LOL Unity WebGL client.

## Goal

Run the preserved Unity 2019.4.16f1 client against a replacement backend because the original Photon Cloud application is no longer available.

The project does **not** pretend a JSON/REST API is compatible with the original Photon client. The backend must reproduce the network behavior the preserved client actually requires.

## Current status

- Original client: preserved locally at `C:\Users\crypt\Downloads\JustFallEmulator\just-fall`
- Original build: Unity 2019.4.16f1
- Observed failure: `GetRegions failed ... ApplicationArchived`
- Reloaded repository: initial architecture
- Photon compatibility: **not yet verified**
- Playable multiplayer: **not yet verified**

Do not claim compatibility until the preserved client has connected to the replacement backend and a real multiplayer room has been tested.
