# Deployment

For production, terminate TLS at a reverse proxy or hosting platform and proxy WebSocket upgrades to /ws. Use WSS when the website is HTTPS. Keep secrets outside Git.

Photon compatibility is not yet complete, so production multiplayer deployment should wait until the preserved client has been tested against the replacement transport.
