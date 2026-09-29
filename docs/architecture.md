# Architecture

Target:
Original/compatible Unity WebGL client → Photon-compatible transport → Reloaded compatibility backend → lobby/matchmaking/rooms → Just Fall events and player state.

The repository currently contains website/backend plumbing. It is **not** claimed to be Photon-compatible.

The preserved OG client remains outside this repository at:
C:\Users\crypt\Downloads\JustFallEmulator\just-fall

The next technical task is to identify the exact transport/protocol used by that build and replace the dead Photon Cloud dependency without rewriting the original gameplay unnecessarily.
