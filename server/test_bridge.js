const assert = require("assert");
const dgram = require("dgram");
const http = require("http");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const path = require("path");

const udpPort = 27191;
const httpPort = 18191;
const repoRoot = path.resolve(__dirname, "..");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "127.0.0.1",
            port: httpPort,
            path: "/health",
            timeout: 300
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode, body }));
          }
        );
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("timeout")));
      });

      if (result.status === 200) return JSON.parse(result.body);
    } catch {}

    await wait(100);
  }

  throw new Error("bridge health endpoint did not become ready");
}

function waitForUdp(udp, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      udp.off("message", onMessage);
      reject(new Error("timed out waiting for UDP packet"));
    }, timeout);

    function onMessage(msg, rinfo) {
      try {
        if (!predicate(msg, rinfo)) return;
        clearTimeout(timer);
        udp.off("message", onMessage);
        resolve({ msg: Buffer.from(msg), rinfo });
      } catch (error) {
        clearTimeout(timer);
        udp.off("message", onMessage);
        reject(error);
      }
    }

    udp.on("message", onMessage);
  });
}

function buildVerifyConnect(peerId) {
  const verifyPayload = Buffer.alloc(32);
  verifyPayload.writeUInt16BE(peerId, 0);

  const command = Buffer.alloc(44);
  command.writeUInt8(3, 0);
  command.writeUInt8(0xFF, 1);
  command.writeUInt8(1, 2);
  command.writeUInt8(0, 3);
  command.writeUInt32BE(44, 4);
  command.writeInt32BE(1, 8);
  verifyPayload.copy(command, 12);

  const packet = Buffer.alloc(56);
  packet.writeUInt16BE(0, 0);
  packet.writeUInt8(0, 2);
  packet.writeUInt8(1, 3);
  packet.writeUInt32BE(1, 4);
  packet.writeInt32BE(0, 8);
  command.copy(packet, 12);
  return packet;
}

function buildAck(ackedSeq, challenge) {
  const command = Buffer.alloc(20);
  command.writeUInt8(1, 0);
  command.writeUInt8(0, 1);
  command.writeUInt8(0, 2);
  command.writeUInt8(0, 3);
  command.writeUInt32BE(20, 4);
  command.writeInt32BE(0, 8);
  command.writeInt32BE(ackedSeq, 12);
  command.writeUInt32BE(1, 16);

  const packet = Buffer.alloc(32);
  packet.writeUInt16BE(0, 0);
  packet.writeUInt8(0, 2);
  packet.writeUInt8(1, 3);
  packet.writeUInt32BE(1, 4);
  packet.writeInt32BE(challenge, 8);
  command.copy(packet, 12);
  return packet;
}

function buildReliableF3(payload, challenge, sequence = 1) {
  const command = Buffer.alloc(12 + payload.length);
  command.writeUInt8(6, 0);
  command.writeUInt8(0, 1);
  command.writeUInt8(1, 2);
  command.writeUInt8(4, 3);
  command.writeUInt32BE(command.length, 4);
  command.writeInt32BE(sequence, 8);
  payload.copy(command, 12);

  const packet = Buffer.alloc(12 + command.length);
  packet.writeUInt16BE(0, 0);
  packet.writeUInt8(0, 2);
  packet.writeUInt8(1, 3);
  packet.writeUInt32BE(2, 4);
  packet.writeInt32BE(challenge, 8);
  command.copy(packet, 12);
  return packet;
}

function buildTPeerFrame(payload, channel = 0, reliable = true) {
  const frame = Buffer.alloc(7 + payload.length);
  frame.writeUInt8(0xFB, 0);
  frame.writeUInt32BE(frame.length, 1);
  frame.writeUInt8(channel, 5);
  frame.writeUInt8(reliable ? 1 : 0, 6);
  payload.copy(frame, 7);
  return frame;
}

(async () => {
  const udp = dgram.createSocket("udp4");
  const child = spawn(process.execPath, ["server/render_bridge.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHOTON_HOST: "127.0.0.1",
      PHOTON_PORT: String(udpPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let childOutput = "";
  child.stdout.on("data", (chunk) => (childOutput += chunk.toString()));
  child.stderr.on("data", (chunk) => (childOutput += chunk.toString()));

  try {
    await new Promise((resolve, reject) => {
      udp.bind(udpPort, "127.0.0.1", resolve);
      udp.once("error", reject);
    });

    const health = await waitForHealth();
    assert.strictEqual(health.ok, true);

    const ws = new WebSocket("ws://127.0.0.1:" + httpPort + "/ws");

    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const connectPacket = await waitForUdp(
      udp,
      (msg) => msg.length === 56 && msg.readUInt8(12) === 2
    );

    assert.strictEqual(connectPacket.msg.length, 56);
    assert.strictEqual(connectPacket.msg.readUInt8(12), 2);
    assert.strictEqual(connectPacket.msg.readUInt32BE(16), 44);

    const bridgePort = connectPacket.rinfo.port;
    const challenge = connectPacket.msg.readInt32BE(8);

    const verify = buildVerifyConnect(0xC300);
    udp.send(verify, bridgePort, "127.0.0.1");

    const initPayload = Buffer.from([0xF3, 0x00, 0x10, 0x20]);
    ws.send(buildTPeerFrame(initPayload, 0, true));

    const clientPacket = await waitForUdp(
      udp,
      (msg) => {
        if (msg.length < 26) return false;
        return (
          msg.readUInt8(12) === 6 &&
          msg.readInt32BE(8) === challenge &&
          msg.subarray(24, 28).equals(initPayload.subarray(0, 4))
        );
      }
    );

    assert.strictEqual(clientPacket.msg.readUInt8(12), 6);
    assert.strictEqual(clientPacket.msg.readUInt8(13), 0);
    assert.strictEqual(clientPacket.msg.readUInt8(14), 1);
    assert.ok(clientPacket.msg.subarray(24).equals(initPayload));

    const clientReliableSeq = clientPacket.msg.readInt32BE(20);
    udp.send(buildAck(clientReliableSeq, challenge), bridgePort, "127.0.0.1");

    const responsePayload = Buffer.from([0xF3, 0x01, 0xAA]);
    udp.send(buildReliableF3(responsePayload, challenge, 7), bridgePort, "127.0.0.1");

    const responseFrame = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for WebSocket response")), 3000);

      ws.once("message", (data, isBinary) => {
        clearTimeout(timer);
        try {
          assert.strictEqual(isBinary, true);
          resolve(Buffer.from(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    assert.deepStrictEqual(responseFrame, buildTPeerFrame(responsePayload, 0, true));

    ws.close();
    console.log("Photon WSS bridge protocol test: PASS");
  } catch (error) {
    console.error("Photon WSS bridge protocol test: FAIL");
    console.error(error);
    if (childOutput) console.error(childOutput);
    process.exitCode = 1;
  } finally {
    try { child.kill("SIGTERM"); } catch {}
    try { udp.close(); } catch {}
  }
})();
