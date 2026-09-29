# Architecture

The public site is hosted by GitHub Pages.

The game itself stays the preserved Unity WebGL build. The browser connects to the replacement multiplayer service over secure WebSockets.

```text
GitHub Pages
    ↓
Original Unity WebGL client
    ↓
WSS gateway
    ↓
Photon-compatible relay
    ↓
rooms / matchmaking / player events
    ↓
Supabase (accounts and persistent data)
```

The relay is a room/event server. The Unity client still owns the actual game presentation and gameplay code.

The important compatibility point is the transport: the original WebGL client uses Photon's binary protocol over WebSocket, so the gateway cannot turn the connection into JSON messages.

Public multiplayer is only considered restored once the preserved client can complete its Photon connection, enter a room and exchange the game's actual events with another client.
