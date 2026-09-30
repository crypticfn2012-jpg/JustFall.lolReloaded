const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const PHOTON_HOST = process.env.PHOTON_HOST || "127.0.0.1";
const PHOTON_PORT = Number(process.env.PHOTON_PORT || 27001);

const TPeerMagic = 0xFB;
const PingMagic = 0xF0;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const body = JSON.stringify({
      ok: true,
      service: "justfall-photon",
      transport: "websocket-tpeer"
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body)
    });
    return res.end(body);
  }
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("JustFall Photon relay");
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  perMessageDeflate: false,
  maxPayload: 8 * 1024 * 1024,
  handleProtocols(protocols) {
    return protocols.has("GpBinaryV16") ? "GpBinaryV16" : false;
  }
});

function buildUdpConnect(challenge) {
  const b = Buffer.alloc(24);
  b.writeUInt16BE(0, 0);
  b.writeUInt8(0, 2);
  b.writeUInt8(1, 3);
  b.writeUInt32BE(0, 4);
  b.writeInt32BE(challenge, 8);
  b.writeUInt8(2, 12);
  b.writeUInt8(0, 13);
  b.writeUInt8(1, 14);
  b.writeUInt8(0, 15);
  b.writeUInt32BE(12, 16);
  b.writeInt32BE(0, 20);
  return b;
}

function buildUdpMessage(payload, channel, reliable, sequence, timestamp, challenge) {
  const commandHeader = reliable ? 12 : 16;
  const b = Buffer.alloc(12 + commandHeader + payload.length);
  b.writeUInt16BE(0, 0);
  b.writeUInt8(0, 2);
  b.writeUInt8(1, 3);
  b.writeUInt32BE(timestamp >>> 0, 4);
  b.writeInt32BE(challenge, 8);

  const o = 12;
  b.writeUInt8(reliable ? 6 : 7, o);
  b.writeUInt8(channel & 255, o + 1);
  b.writeUInt8(reliable ? 1 : 0, o + 2);
  b.writeUInt8(0, o + 3);
  b.writeUInt32BE(commandHeader + payload.length, o + 4);
  b.writeInt32BE(sequence, o + 8);

  let payloadStart = o + 12;
  if (!reliable) {
    b.writeInt32BE(sequence, o + 12);
    payloadStart = o + 16;
  }
  payload.copy(b, payloadStart);
  return b;
}

function buildUdpAck(channel, ackedSeq, timestamp, challenge) {
  const b = Buffer.alloc(32);
  b.writeUInt16BE(0, 0);
  b.writeUInt8(0, 2);
  b.writeUInt8(1, 3);
  b.writeUInt32BE(timestamp >>> 0, 4);
  b.writeInt32BE(challenge, 8);

  const o = 12;
  b.writeUInt8(1, o);          // ACK
  b.writeUInt8(channel & 255, o + 1);
  b.writeUInt8(0, o + 2);      // ACK is unreliable
  b.writeUInt8(0, o + 3);
  b.writeUInt32BE(20, o + 4);  // 12-byte command + 8-byte payload
  b.writeInt32BE(0, o + 8);
  b.writeInt32BE(ackedSeq, o + 12);
  b.writeUInt32BE(timestamp >>> 0, o + 16);
  return b;
}

function buildTPeerFrame(payload, channel, reliable) {
  const b = Buffer.alloc(7 + payload.length);
  b.writeUInt8(TPeerMagic, 0);
  b.writeUInt32BE(b.length, 1);
  b.writeUInt8(channel & 255, 5);
  b.writeUInt8(reliable ? 1 : 0, 6);
  payload.copy(b, 7);
  return b;
}

function buildPingResult(clientStamp) {
  const b = Buffer.alloc(9);
  b.writeUInt8(PingMagic, 0);
  b.writeInt32BE(Date.now() | 0, 1);
  b.writeInt32BE(clientStamp, 5);
  return b;
}

function parseTPeer(buffer) {
  const out = [];
  let o = 0;

  while (o < buffer.length) {
    const magic = buffer[o];

    if (magic === PingMagic) {
      if (buffer.length - o < 5) throw new Error("incomplete Photon ping");
      out.push({ type: "ping", clientStamp: buffer.readInt32BE(o + 1) });
      o += 5;
      continue;
    }

    if (magic !== TPeerMagic || buffer.length - o < 7) {
      throw new Error("invalid TPeer frame");
    }

    const length = buffer.readUInt32BE(o + 1);
    if (length < 7 || length > 8 * 1024 * 1024 || o + length > buffer.length) {
      throw new Error("invalid TPeer frame length " + length);
    }

    out.push({
      type: "data",
      channel: buffer[o + 5],
      reliable: (buffer[o + 6] & 1) !== 0,
      payload: buffer.subarray(o + 7, o + length)
    });
    o += length;
  }

  return out;
}

function parseUdp(data) {
  if (data.length < 12) return [];
  const commands = [];
  let o = 12;

  for (let i = 0; i < data[3]; i++) {
    if (o + 12 > data.length) break;

    const type = data[o];
    const channel = data[o + 1];
    const flags = data[o + 2];
    const size = data.readInt32BE(o + 4);
    if (size < 12 || o + size > data.length) break;

    let start = o + 12;
    let fragment = null;

    if (type === 7) {
      if (size < 16) break;
      start = o + 16;
    } else if (type === 8) {
      if (size < 32) break;
      fragment = {
        startSeq: data.readInt32BE(o + 12),
        count: data.readInt32BE(o + 16),
        number: data.readInt32BE(o + 20),
        totalLength: data.readInt32BE(o + 24),
        offset: data.readInt32BE(o + 28)
      };
      start = o + 32;
    }

    commands.push({
      type,
      channel,
      reliable: (flags & 1) !== 0,
      reliableSeq: data.readInt32BE(o + 8),
      payload: data.subarray(start, o + size),
      fragment
    });
    o += size;
  }

  return commands;
}

wss.on("connection", (ws, req) => {
  const udp = dgram.createSocket("udp4");
  const challenge = crypto.randomBytes(4).readInt32BE(0);
  let ready = false;
  let closed = false;
  const reliableSeq = new Map();
  const unreliableSeq = new Map();
  const pending = [];
  const fragments = new Map();

  const sendUdp = packet => {
    try { udp.send(packet); } catch (e) { console.error("[UDP SEND]", e.message); }
  };

  const flush = () => {
    while (ready && pending.length) sendUdp(pending.shift());
  };

  udp.on("message", data => {
    try {
      for (const cmd of parseUdp(data)) {
        if (cmd.type === 3) {
          // The UDP relay sent VERIFY_CONNECT as a reliable command. ACK it
          // on the UDP side, but do not expose ENet control packets to TPeer.
          if (cmd.reliable) {
            sendUdp(buildUdpAck(cmd.channel, cmd.reliableSeq, data.readUInt32BE(4), challenge));
          }
          ready = true;
          console.log("[WS] Photon UDP peer verified");
          flush();
          continue;
        }

        if (cmd.type === 1) continue;

        if ((cmd.type === 6 || cmd.type === 7) && cmd.payload.length >= 2) {
          // The WebSocket client has TCP/WebSocket reliability, so translate
          // the UDP relay's reliable command into a TPeer frame. Still ACK the
          // UDP command so the relay does not retransmit the same operation.
          if (cmd.reliable) {
            sendUdp(buildUdpAck(cmd.channel, cmd.reliableSeq, data.readUInt32BE(4), challenge));
          }
          if (ws.readyState === ws.OPEN) {
            ws.send(buildTPeerFrame(cmd.payload, cmd.channel, cmd.reliable), { binary: true });
          }
          continue;
        }

        if (cmd.type === 8 && cmd.fragment) {
          const f = cmd.fragment;
          if (f.totalLength < 0 || f.totalLength > 8 * 1024 * 1024) continue;

          const key = f.startSeq + ":" + cmd.channel;
          let a = fragments.get(key);
          if (!a) {
            a = {
              buffer: Buffer.alloc(f.totalLength),
              count: f.count,
              received: 0,
              parts: new Set(),
              channel: cmd.channel,
              reliable: cmd.reliable
            };
            fragments.set(key, a);
          }

          if (cmd.reliable) {
            sendUdp(buildUdpAck(cmd.channel, cmd.reliableSeq, data.readUInt32BE(4), challenge));
          }

          if (!a.parts.has(f.number)) {
            cmd.payload.copy(a.buffer, f.offset);
            a.parts.add(f.number);
            a.received++;
          }

          if (a.received >= a.count) {
            fragments.delete(key);
            if (ws.readyState === ws.OPEN) {
              ws.send(buildTPeerFrame(a.buffer, a.channel, a.reliable), { binary: true });
            }
          }
        }
      }
    } catch (e) {
      console.error("[UDP RECV]", e.message);
    }
  });

  udp.on("error", e => {
    console.error("[UDP]", e.message);
    if (ws.readyState === ws.OPEN) ws.close(1011, "Photon relay error");
  });

  udp.connect(PHOTON_PORT, PHOTON_HOST, () => {
    console.log("[WS] Photon WebSocket client:", req.socket.remoteAddress);
    console.log("[WS] Using TPeer -> UDP/ENet adapter");
    sendUdp(buildUdpConnect(challenge));
  });

  ws.on("message", data => {
    if (closed) return;

    try {
      for (const frame of parseTPeer(Buffer.isBuffer(data) ? data : Buffer.from(data))) {
        if (frame.type === "ping") {
          if (ws.readyState === ws.OPEN) {
            ws.send(buildPingResult(frame.clientStamp), { binary: true });
          }
          continue;
        }

        const seqMap = frame.reliable ? reliableSeq : unreliableSeq;
        const seq = (seqMap.get(frame.channel) || 0) + 1;
        seqMap.set(frame.channel, seq);
        const packet = buildUdpMessage(
          frame.payload,
          frame.channel,
          frame.reliable,
          seq,
          Date.now() >>> 0,
          challenge
        );

        if (ready) sendUdp(packet);
        else pending.push(packet);
      }
    } catch (e) {
      console.error("[WS RECV]", e.message);
      if (ws.readyState === ws.OPEN) ws.close(1002, "Invalid Photon TPeer frame");
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try { udp.close(); } catch {}
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`JustFall Photon WSS/TPeer adapter listening on :${PORT}, UDP -> ${PHOTON_HOST}:${PHOTON_PORT}`);
});
