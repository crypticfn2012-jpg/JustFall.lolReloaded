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

function buildTPeerFrame(payload) {
  // Photon TPeer WebSocket framing:
  // 0xFB + 4-byte total frame length + 2 framing bytes + Photon payload.
  const b = Buffer.alloc(7 + payload.length);
  b.writeUInt8(0xFB, 0);
  b.writeUInt32BE(b.length, 1);
  b.writeUInt8(0, 5);
  b.writeUInt8(0, 6);
  payload.copy(b, 7);
  return b;
}

function buildPingResult(clientStamp) {
  const b = Buffer.alloc(5);
  b.writeUInt8(PingMagic, 0);
  b.writeInt32BE(clientStamp, 1);
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

    // Bytes 5-6 are TPeer framing/control bytes. The actual Photon
    // operation/event payload begins at byte 7.
    out.push({
      type: "data",
      payload: buffer.subarray(o + 7, o + length)
    });
    o += length;
  }

  return out;
}


