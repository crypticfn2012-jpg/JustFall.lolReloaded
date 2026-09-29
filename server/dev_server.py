"""Development-only binary WebSocket probe.

This is NOT the Photon server. It only verifies that a deployment endpoint can
accept browser WebSocket connections before the Photon-compatible codec is added.
"""

import asyncio
import logging
from websockets.asyncio.server import serve

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def handler(websocket):
    peer = websocket.remote_address
    logging.info("client connected: %s", peer)
    try:
        async for message in websocket:
            if isinstance(message, bytes):
                logging.info("binary message: %d bytes: %s", len(message), message[:32].hex())
            else:
                logging.info("text message: %d chars", len(message))
    except Exception as exc:
        logging.info("client %s disconnected: %s", peer, exc)


async def main():
    async with serve(handler, "0.0.0.0", 9093, max_size=8 * 1024 * 1024):
        logging.info("Development WebSocket endpoint listening on 0.0.0.0:9093")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
