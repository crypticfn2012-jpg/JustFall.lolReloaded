# Deployment

A Node Web Service is required for multiplayer because the game uses persistent WebSocket connections.

Render configuration is included in render.yaml.

The same service can serve the web client and WebSocket endpoint, so HTTPS pages automatically use WSS.

For a separate static frontend, pass the backend URL with the server query parameter.
