# Reverse Engineering Notes

Confirmed from the preserved client:
- Product: JustFall.LOL
- Company: JustPlay.LOL
- Unity: 2019.4.16f1
- WebGL build loads locally
- Old networking reports an archived Photon application during GetRegions

Reloaded status:
- playable browser client implemented
- WebSocket server implemented
- room lifecycle implemented
- 8 slots with bots
- four playable modes
- server-side movement and elimination
- unlock-all Reloaded cosmetics

Still unknown for original-client compatibility:
- exact Photon SDK/PUN version
- AppId/AppVersion
- exact binary protocol revision
- exact original event and room-property schema

Do not label the preserved Unity client as Photon-compatible until it has actually connected to the replacement protocol.
