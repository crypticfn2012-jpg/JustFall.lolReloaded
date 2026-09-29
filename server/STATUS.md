# Server status

## Current state
The repository now has a real Photon-compatible relay path for the preserved Unity WebGL client:
- original Unity WebGL client stays untouched
- browser WebSocket traffic is redirected before Unity starts
- WSS bridge unwraps browser frames into Photon reliable UDP packets
- Photon relay handles authentication, lobbies, rooms, matchmaking, redirects and event relay
- GetRegions is implemented for the original Name Server connection flow
- the master/game redirect is forced back through the public WSS endpoint
- Render Blueprint deploys the WSS bridge publicly and the Photon relay privately
- old fake JSON/probe server files have been removed

## Production topology
GitHub Pages → original Unity WebGL → WSS /ws → Photon WebSocket bridge → private Photon relay → rooms / matchmaking / event relay

Supabase remains the persistence layer for accounts, cosmetics, unlocks, statistics and match history.

## Important
This is now an actual original-client networking implementation, not the previous JSON game mockup.
The final compatibility test still has to be performed against the preserved JustFall build because the original game's exact Photon operations and serialization usage are contained inside its compiled Unity client.