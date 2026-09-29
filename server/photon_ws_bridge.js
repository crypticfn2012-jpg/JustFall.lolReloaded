const http = require("http");
const dgram = require("dgram");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 10000);
const PHOTON_HOST = process.env.PHOTON_HOST || "127.0.0.1";
const PHOTON_PORT = Number(process.env.PHOTON_PORT || 27001);
const MAX_FRAME = 8 * 1024 * 1024;

function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(data, { binary: true });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    return res.end(JSON.stringify({
      ok: true,
      service: "justfall-photon-ws-bridge",
      photonHost: PHOTON_HOST,
      photonPort: PHOTON_PORT
    }));
  }

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("JustFall.lol Reloaded Photon WebSocket bridge");
});

const wss = new WebSocket.Server({
  server,
  path: "/ws",
  maxPayload: MAX_FRAME,
  perMessageDeflate: false
});

wss.on("connection", (ws, request) => {
  const udp = dgram.createSocket("udp4");
  const remote = { address: PHOTON_HOST, port: PHOTON_PORT };
  let closed = false;
  let lastClientFrameAt = Date.now();

  console.log(
    "[ws] connected",
    request.socket.remoteAddress || "unknown",
    "->",
    PHOTON_HOST + ":" + PHOTON_PORT
  );

  udp.on("message", (packet) => {
    if (closed) return;

    // Photon WSS is a transport substitution: the binary WebSocket frame
    // carries the same Photon packet bytes that the UDP transport would have
    // carried. Do not rewrite the eNet header, challenge, peer id, sequence,
    // reliability flags, or payload.
    safeSend(ws, packet);
  });

  udp.on("error", (err) => {
    console.error("[udp]", err.message);
    try {
      ws.close(1011, "Photon UDP relay error");
    } catch {}
  });

  udp.connect(remote.port, remote.address, () => {
    console.log("[udp] connected", PHOTON_HOST + ":" + PHOTON_PORT);
  });

  ws.on("message", (data, isBinary) => {
    if (closed) return;

    if (!isBinary) {
      console.warn("[ws] ignoring non-binary frame");
      return;
    }

    const packet = Buffer.from(data);
    if (packet.length === 0) return;

    lastClientFrameAt = Date.now();

    // Transparent transport proxy. Keeping the packet byte-for-byte intact is
    // essential because the client owns the Photon connection challenge and
    // reliability state.
    udp.send(packet, (err) => {
      if (err && !closed) console.error("[udp] send:", err.message);
    });
  });

  ws.on("close", (code, reason) => {
    if (closed) return;
    closed = true;
    console.log(
      "[ws] closed",
      code,
      reason && reason.toString ? reason.toString() : "",
      "last frame",
      Date.now() - lastClientFrameAt + "ms ago"
    );
    try { udp.close(); } catch {}
  });

  ws.on("error", (err) => {
    if (!closed) console.error("[ws]", err.message);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "JustFall Photon WSS bridge listening on",
    PORT,
    "->",
    PHOTON_HOST + ":" + PHOTON_PORT
  );
});
