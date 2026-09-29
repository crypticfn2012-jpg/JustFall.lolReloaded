# JustFall.lol Reloaded

JustFall.lol Reloaded is a fan-made preservation project for the old JustFall.LOL browser game.

The goal is to keep the original Unity WebGL client playable and bring its online multiplayer back with a replacement Photon-compatible server.

## Project layout

- `index.html` — public GitHub Pages site
- `web/original/` — launcher for the original Unity WebGL client
- `web/style.css` — site styling
- `server/` — WebSocket gateway and Photon-compatible relay
- `supabase/` — account/profile database migrations
- `docs/` — notes about the original client and network setup

## Local site

From the repo folder:

```text
py -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

## Multiplayer

The browser client uses Photon over WebSocket/WSS. The replacement network has to speak the same binary protocol; a normal JSON WebSocket server will not work.

The public server is intended to be:

```text
Unity WebGL client
        ↓
WSS gateway
        ↓
Photon-compatible relay
        ↓
rooms / matchmaking
```

## Current state

The original Unity client loads in the browser.

The multiplayer server code is still being brought online and tested against the real client. The site should not be treated as having working public multiplayer until that connection succeeds.

This project is not affiliated with JustPlay.LOL or Exit Games.
