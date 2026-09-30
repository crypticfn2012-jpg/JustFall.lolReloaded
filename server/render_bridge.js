const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");
const { WebSocketServer, OPEN } = require("ws");

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
      transport: "websocket-tpeer",
      photon: PHOTON_HOST + ":" + PHOTON_PORT
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body)
    });
    return res.end(body);
  }

  res.writeHead(200, {
    "content-type": "text/plain",
    "cache-control": "no-store"
  });
  res.end("JustFall Photon relay");
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  perMessageDeflate: false,
  maxPayload: 8 * 1024 * 1024
});

function nowMs32() {
  return Date.now() >>> 0;
}

function randomInt32() {
  return crypto.randomBytes(4).readInt32BE(0);
}

function hex(buf, max = 96) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  return buf.subarray(0, max).toString("hex");
}

// Photon UDP packet = 12-byte packet header + ENet command.
// The Connect command is 44 bytes total (12 header + 32 payload).
function buildUdpConnect(challenge) {
  const command = Buffer.alloc(44);

  command.writeUInt8(2, 0);          // Connect
  command.writeUInt8(0xFF, 1);       // background/control channel
  command.writeUInt8(1, 2);          // reliable
  command.writeUInt8(0, 3);          // reserved
  command.writeUInt32BE(44, 4);      // command size
  command.writeInt32BE(0, 8);        // reliable sequence
  // 32-byte connect payload remains zeroed.

  const packet = Buffer.alloc(56);
  packet.writeUInt16BE(0, 0);        // peer id = 0
  packet.writeUInt8(0, 2);            // CRC disabled
  packet.writeUInt8(1, 3);            // one command
  packet.writeUInt32BE(0, 4);         // timestamp
  packet.writeInt32BE(challenge, 8); // connection challenge
  command.copy(packet, 12);

  return packet;
}

function buildUdpReliable(payload, channel, sequence, timestamp, challenge) {
  const command = Buffer.alloc(12 + payload.length);

  command.writeUInt8(6, 0);           // SendReliable
  command.writeUInt8(channel & 255, 1);
  command.writeUInt8(1, 2);            // reliable
  command.writeUInt8(4, 3);            // reserved
  command.writeUInt32BE(command.length, 4);
  command.writeInt32BE(sequence, 8);
  payload.copy(command, 12);

  const packet = Buffer.alloc(12 + command.length);
  packet.writeUInt16BE(0, 0);
  packet.writeUInt8(0, 2);
  packet.writeUInt8(1, 3);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeInt32BE(challenge, 8);
  command.copy(packet, 12);
  return packet;
}

function buildUdpAck(channel, ackedSeq, timestamp, challenge) {
  const command = Buffer.alloc(20);

  command.writeUInt8(1, 0);            // Ack
  command.writeUInt8(channel & 255, 1);
  command.writeUInt8(0, 2);             // unreliable
  command.writeUInt8(0, 3);
  command.writeUInt32BE(20, 4);
  command.writeInt32BE(0, 8);
  command.writeInt32BE(ackedSeq, 12);
  command.writeUInt32BE(timestamp >>> 0, 16);

  const packet = Buffer.alloc(32);
  packet.writeUInt16BE(0, 0);
  packet.writeUInt8(0, 2);
  packet.writeUInt8(1, 3);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeInt32BE(challenge, 8);
  command.copy(packet, 12);
  return packet;
}

function buildUdpDisconnect(channel, sequence, timestamp, challenge) {
  const command = Buffer.alloc(12);

  command.writeUInt8(4, 0);            // Disconnect
  command.writeUInt8(channel & 255, 1);
  command.writeUInt8(1, 2);             // reliable
  command.writeUInt8(0, 3);
  command.writeUInt32BE(12, 4);
  command.writeInt32BE(sequence, 8);

  const packet = Buffer.alloc(24);
  packet.writeUInt16BE(0, 0);
  packet.writeUInt8(0, 2);
  packet.writeUInt8(1, 3);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeInt32BE(challenge, 8);
  command.copy(packet, 12);
  return packet;
}

function buildTPeerFrame(payload) {
  // Photon TPeer: FB + 4-byte big-endian total frame length + 2 framing bytes + payload.
  const frame = Buffer.alloc(7 + payload.length);
  frame.writeUInt8(TPeerMagic, 0);
  frame.writeUInt32BE(frame.length, 1);
  frame.writeUInt8(0, 5);
  frame.writeUInt8(0, 6);
  payload.copy(frame, 7);
  return frame;
}

function buildPingResult(clientStamp) {
  const frame = Buffer.alloc(5);
  frame.writeUInt8(PingMagic, 0);
  frame.writeInt32BE(clientStamp, 1);
  return frame;
}

function parseTPeer(buffer) {
  const out = [];
  let offset = 0;

  while (offset < buffer.length) {
    const magic = buffer[offset];

    if (magic === PingMagic) {
      if (buffer.length - offset < 5) {
        throw new Error("incomplete Photon ping");
      }
      out.push({
        type: "ping",
        clientStamp: buffer.readInt32BE(offset + 1)
      });
      offset += 5;
      continue;
    }

    if (magic !== TPeerMagic || buffer.length - offset < 7) {
      throw new Error(
        "invalid TPeer frame: magic=0x" +
        magic.toString(16).padStart(2, "0") +
        " remaining=" + (buffer.length - offset)
      );
    }

    const length = buffer.readUInt32BE(offset + 1);

    if (length < 7 || length > 8 * 1024 * 1024) {
      throw new Error("invalid TPeer frame length " + length);
    }

    if (offset + length > buffer.length) {
      throw new Error(
        "partial TPeer frame: need=" + length +
        " have=" + (buffer.length - offset)
      );
    }

    out.push({
      type: "data",
      payload: Buffer.from(buffer.subarray(offset + 7, offset + length))
    });

    offset += length;
  }

  return out;
}

function parseUdpPacket(buffer) {
  if (buffer.length < 12) return null;

  const commandCount = buffer.readUInt8(3);
  let offset = 12;
  const commands = [];

  for (let i = 0; i < commandCount; i++) {
    if (offset + 12 > buffer.length) {
      throw new Error("truncated UDP command header");
    }

    const type = buffer.readUInt8(offset);
    const channel = buffer.readUInt8(offset + 1);
    const flags = buffer.readUInt8(offset + 2);
    const size = buffer.readUInt32BE(offset + 4);
    const reliableSeq = buffer.readInt32BE(offset + 8);

    if (size < 12 || offset + size > buffer.length) {
      throw new Error(
        "invalid UDP command size " + size +
        " at offset " + offset +
        " packet=" + buffer.length
      );
    }

    let payloadOffset = offset + 12;

    if (type === 7) {
      payloadOffset += 4;
    } else if (type === 8) {
      payloadOffset += 20;
    }

    if (payloadOffset > offset + size) {
      throw new Error("invalid UDP payload offset");
    }

    const command = {
      type,
      channel,
      flags,
      size,
      reliableSeq,
      payload: Buffer.from(buffer.subarray(payloadOffset, offset + size)),
      fragment: null
    };

    if (type === 8) {
      command.fragment = {
        startSeq: buffer.readInt32BE(offset + 12),
        count: buffer.readInt32BE(offset + 16),
        number: buffer.readInt32BE(offset + 20),
        totalLength: buffer.readInt32BE(offset + 24),
        offset: buffer.readInt32BE(offset + 28)
      };
    }

    commands.push(command);
    offset += size;
  }

  return {
    peerId: buffer.readUInt16BE(0),
    timestamp: buffer.readUInt32BE(4),
    challenge: buffer.readInt32BE(8),
    commands
  };
}

class PhotonBridgePeer {
  constructor(ws, requestUrl) {
    this.ws = ws;
    this.requestUrl = requestUrl;
    this.udp = dgram.createSocket("udp4");

    this.challenge = randomInt32();
    this.udpReady = false;
    this.closed = false;

    this.nextReliableSeq = 1;
    this.udpConnectTimer = null;
    this.handshakeDeadline = Date.now() + 10000;

    this.pendingWsPayloads = [];
    this.fragmentAssemblies = new Map();

    this.udp.on("message", (data, rinfo) => this.onUdpMessage(data, rinfo));

    this.udp.on("error", (err) => {
      this.log("UDP error: " + err.message);
      this.close(1011, "UDP error");
    });

    this.udp.bind(0, "0.0.0.0", () => {
      if (this.closed) return;

      this.log(
        "UDP bound local=" +
        this.udp.address().address + ":" + this.udp.address().port +
        " -> " + PHOTON_HOST + ":" + PHOTON_PORT
      );

      this.sendUdpConnect();

      this.udpConnectTimer = setInterval(() => {
        if (this.closed || this.udpReady) return;

        if (Date.now() > this.handshakeDeadline) {
          this.log("UDP handshake timed out");
          this.close(1011, "Photon UDP handshake timeout");
          return;
        }

        this.sendUdpConnect();
      }, 1000);
    });
  }

  log(message) {
    console.log("[Bridge] " + message);
  }

  sendUdpConnect() {
    const packet = buildUdpConnect(this.challenge);

    this.udp.send(packet, PHOTON_PORT, PHOTON_HOST, (err) => {
      if (err) {
        this.log("UDP Connect send failed: " + err.message);
        this.close(1011, "UDP connect failed");
        return;
      }

      this.log(
        "UDP CONNECT sent 56b challenge=0x" +
        (this.challenge >>> 0).toString(16)
      );
    });
  }

  sendUdpAck(cmd, packet) {
    const ack = buildUdpAck(
      cmd.channel,
      cmd.reliableSeq,
      packet.timestamp,
      this.challenge
    );

    this.udp.send(ack, PHOTON_PORT, PHOTON_HOST);
  }

  sendUdpPayload(payload) {
    if (this.closed || !this.udpReady) return;

    const seq = this.nextReliableSeq++;

    const packet = buildUdpReliable(
      payload,
      0,
      seq,
      nowMs32(),
      this.challenge
    );

    this.udp.send(packet, PHOTON_PORT, PHOTON_HOST, (err) => {
      if (err) {
        this.log("UDP payload send failed: " + err.message);
        this.close(1011, "UDP payload failed");
      }
    });
  }

  flushPendingWs() {
    if (!this.udpReady || this.closed) return;

    while (this.pendingWsPayloads.length > 0) {
      this.sendUdpPayload(this.pendingWsPayloads.shift());
    }
  }

  handleWsBuffer(data) {
    let frames;

    try {
      frames = parseTPeer(Buffer.from(data));
    } catch (err) {
      this.log("WS parse failed: " + err.message + " data=" + hex(data, 160));
      this.close(1002, "Invalid Photon frame");
      return;
    }

    for (const frame of frames) {
      if (frame.type === "ping") {
        if (this.ws.readyState === OPEN) {
          this.ws.send(buildPingResult(frame.clientStamp), { binary: true });
        }
        continue;
      }

      const payload = frame.payload;

      if (payload.length < 2 || payload[0] !== 0xF3) {
        this.log("WS payload is not F3 data=" + hex(payload, 160));
        continue;
      }

      this.log(
        "WS -> UDP type=0x" +
        payload[1].toString(16).padStart(2, "0") +
        " len=" + payload.length
      );

      if (this.udpReady) {
        this.sendUdpPayload(payload);
      } else {
        this.pendingWsPayloads.push(payload);
      }
    }

    this.flushPendingWs();
  }

  onUdpMessage(data, rinfo) {
    if (this.closed) return;

    let packet;

    try {
      packet = parseUdpPacket(data);
    } catch (err) {
      this.log("UDP parse failed: " + err.message + " data=" + hex(data, 160));
      return;
    }

    if (!packet) {
      this.log("UDP packet too short: " + data.length + "b");
      return;
    }

    this.log(
      "UDP <- " + data.length + "b peer=0x" +
      packet.peerId.toString(16).padStart(4, "0") +
      " challenge=0x" + (packet.challenge >>> 0).toString(16) +
      " commands=" + packet.commands.length
    );

    for (const cmd of packet.commands) {
      if (cmd.type === 3) {
        this.udpReady = true;

        this.log(
          "UDP VERIFY_CONNECT seq=" + cmd.reliableSeq +
          " channel=" + cmd.channel +
          " payload=" + cmd.payload.length + "b"
        );

        this.sendUdpAck(cmd, packet);
        this.flushPendingWs();
        continue;
      }

      if (cmd.type === 1) {
        this.log(
          "UDP ACK seq=" +
          (cmd.payload.length >= 4 ? cmd.payload.readInt32BE(0) : "?")
        );
        continue;
      }

      if (cmd.type === 6 || cmd.type === 7) {
        if ((cmd.flags & 1) !== 0) {
          this.sendUdpAck(cmd, packet);
        }

        if (cmd.payload.length < 2 || cmd.payload[0] !== 0xF3) {
          this.log(
            "UDP message is not F3 type=" + cmd.type +
            " len=" + cmd.payload.length +
            " data=" + hex(cmd.payload, 160)
          );
          continue;
        }

        this.log(
          "UDP -> WS type=0x" +
          cmd.payload[1].toString(16).padStart(2, "0") +
          " len=" + cmd.payload.length
        );

        if (this.ws.readyState === OPEN) {
          this.ws.send(buildTPeerFrame(cmd.payload), { binary: true });
        }

        continue;
      }

      if (cmd.type === 8) {
        if ((cmd.flags & 1) !== 0) {
          this.sendUdpAck(cmd, packet);
        }

        this.handleUdpFragment(cmd);
        continue;
      }

      if (cmd.type === 4) {
        this.log("UDP SERVER DISCONNECT");
        this.close(1000, "Photon disconnect");
        continue;
      }
    }
  }

  handleUdpFragment(cmd) {
    const f = cmd.fragment;

    if (!f || f.totalLength < 0 || f.totalLength > 8 * 1024 * 1024) {
      this.log("invalid UDP fragment");
      return;
    }

    const key = String(f.startSeq);

    let asm = this.fragmentAssemblies.get(key);

    if (!asm) {
      asm = {
        total: f.totalLength,
        count: f.count,
        pieces: new Map(),
        received: 0
      };
      this.fragmentAssemblies.set(key, asm);
    }

    if (!asm.pieces.has(f.number)) {
      asm.pieces.set(f.number, Buffer.from(cmd.payload));
      asm.received++;
    }

    if (asm.received < asm.count) return;

    const result = Buffer.alloc(asm.total);
    let offset = 0;

    for (let i = 0; i < asm.count; i++) {
      const piece = asm.pieces.get(i);
      if (!piece) return;
      piece.copy(result, offset);
      offset += piece.length;
    }

    this.fragmentAssemblies.delete(key);

    if (result.length >= 2 && result[0] === 0xF3 && this.ws.readyState === OPEN) {
      this.log("UDP fragments -> WS len=" + result.length);
      this.ws.send(buildTPeerFrame(result), { binary: true });
    }
  }

  close(code = 1000, reason = "closed") {
    if (this.closed) return;

    this.closed = true;

    if (this.udpConnectTimer) {
      clearInterval(this.udpConnectTimer);
      this.udpConnectTimer = null;
    }

    try {
      if (this.udpReady) {
        const packet = buildUdpDisconnect(
          0,
          this.nextReliableSeq++,
          nowMs32(),
          this.challenge
        );

        this.udp.send(packet, PHOTON_PORT, PHOTON_HOST, () => {
          try { this.udp.close(); } catch {}
        });
      } else {
        try { this.udp.close(); } catch {}
      }
    } catch {}

    if (this.ws.readyState === OPEN) {
      try { this.ws.close(code, reason); } catch {}
    }

    this.log("CLOSED code=" + code + " reason=" + reason);
  }
}

wss.on("connection", (ws, req) => {
  const requestUrl = req.url || "/";

  console.log("[Bridge] WS CONNECT " + requestUrl);

  const peer = new PhotonBridgePeer(ws, requestUrl);

  ws.binaryType = "nodebuffer";

  ws.on("message", (data, isBinary) => {
    if (!isBinary && typeof data === "string") {
      peer.log("Ignoring unexpected text WebSocket message");
      return;
    }

    peer.handleWsBuffer(data);
  });

  ws.on("close", (code, reason) => {
    peer.log(
      "WS CLOSED code=" + code +
      " reason=" + Buffer.from(reason || "").toString()
    );
    peer.close(1000, "WebSocket closed");
  });

  ws.on("error", (err) => {
    peer.log("WS ERROR " + err.message);
    peer.close(1011, "WebSocket error");
  });

  peer.log("WS connection accepted");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[Bridge] LISTENING on 0.0.0.0:" + PORT);
  console.log("[Bridge] Photon UDP target " + PHOTON_HOST + ":" + PHOTON_PORT);
});
