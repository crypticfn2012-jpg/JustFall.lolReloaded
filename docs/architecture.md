# Architecture

Browser
→ Reloaded HTML/JS client
→ WebSocket /ws
→ authoritative room server
→ rooms, bots, players and match state

The server owns movement, tile/obstacle state, eliminations and winner selection. Clients send inputs and receive snapshots.

Room lifecycle:
1. Guest auth
2. Playlist selection
3. Match room
4. Fill to 8 slots with bots if needed
5. Countdown
6. Server simulation
7. Results
8. Room cleanup

The preserved OG Unity WebGL client remains separate and is the compatibility reference for the future Photon bridge.
