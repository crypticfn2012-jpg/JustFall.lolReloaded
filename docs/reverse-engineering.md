# Reverse Engineering Notes

## Confirmed

- Product: JustFall.LOL
- Company: JustPlay.LOL
- Unity: 2019.4.16f1
- WebGL build loads locally.
- Old online client reports: GetRegions failed — AppId is unknown on the cloud server — ApplicationArchived.

## Not yet confirmed

- Exact Photon SDK/PUN version
- Exact AppId
- AppVersion
- Exact WebSocket endpoint
- Exact Photon binary protocol revision
- Exact room/event/property schema

These must be established from the actual preserved client and black-box network behavior before claiming compatibility.

An independent Photon-compatible server implementation such as Luxon Server may be useful as a protocol reference. License and compatibility must be checked before incorporating code.
