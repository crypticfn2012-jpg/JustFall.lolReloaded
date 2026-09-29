# Realtime deployment

GitHub Pages cannot execute a persistent multiplayer process. The website can stay on GitHub Pages, while this directory is deployed to a VPS/container service.

## Required production pieces

1. A public WSS endpoint.
2. The Photon-compatible binary WebSocket transport.
3. Photon Name Server / Master / Game Server behavior.
4. Matchmaking and room state.
5. Supabase persistence.

The current dev_server.py is deliberately only a transport probe. It must not be advertised as the finished JustFall backend.

## Target topology

    https://<github-pages-site>/
             |
             +-- /original/ -> original Unity WebGL client
                                |
                                +-- WSS -> realtime server
                                           |
                                           +-- matchmaking
                                           +-- rooms
                                           +-- gameplay events
                                           +-- Supabase

A production deployment should use a dedicated hostname such as ws.<your-domain> with a trusted TLS certificate.
