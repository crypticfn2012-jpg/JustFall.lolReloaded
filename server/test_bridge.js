const assert = require("assert");
const dgram = require("dgram");
const http = require("http");
const WebSocket = require("ws");
const { spawn } = require("child_process");
const path = require("path");

const udpPort = 27191;
const httpPort = 18191;
const repoRoot = path.resolve(__dirname, "..");
let udp;
let child;
let passed = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get(
          { hostname: "127.0.0.1", port: httpPort, path: "/health", timeout: 200 },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode, body }));
          }
        );
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error("timeout")));
      });
      if (result.status === 200) return;
    } catch {}
    await wait(100);
  }
  throw new Error("bridge health endpoint did not become ready");
}

(async () => {
  udp = dgram.createSocket("udp4");

  const udpMessage = new Promise((resolve) => {
    udp.once("message", (msg, rinfo) => {
      resolve({ msg: Buffer.from(msg), rinfo });
      // Echo the exact Photon datagram back to the bridge.
      udp.send(msg, rinfo.port, rinfo.address);
    });
  });

  await new Promise((resolve) => udp.bind(udpPort, "127.0.0.1", resolve));

  child = spawn(process.execPath, ["server/photon_ws_bridge.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(httpPort),
      PHOTON_HOST: "127.0.0.1",
      PHOTON_PORT: String(udpPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await waitForHealth();

  const source = Buffer.from([
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x2a,
    0x12, 0x34, 0x56, 0x78,
    0x02, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x0c,
    0x00, 0x00, 0x00, 0x01
  ]);

  const client = new WebSocket("ws://127.0.0.1:" + httpPort + "/ws");
  const received = new Promise((resolve, reject) => {
    client.once("message", (data, isBinary) => {
      try {
        assert.strictEqual(isBinary, true);
        resolve(Buffer.from(data));
      } catch (error) {
        reject(error);
      }
    });
    client.once("error", reject);
  });

  await new Promise((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });

  client.send(source);

  const forwarded = await Promise.race([
    udpMessage,
    wait(2000).then(() => {
      throw new Error("bridge did not forward WebSocket packet to UDP");
    })
  ]);

  assert.deepStrictEqual(forwarded.msg, source);

  const echoed = await Promise.race([
    received,
    wait(2000).then(() => {
      throw new Error("bridge did not forward UDP packet back to WebSocket");
    })
  ]);

  assert.deepStrictEqual(echoed, source);

  client.close();
  passed = true;
  console.log("Photon WSS bridge transport test: PASS");
})()
  .catch((error) => {
    console.error("Photon WSS bridge transport test: FAIL");
    console.error(error);
    if (stderr) console.error(stderr);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { if (child) child.kill("SIGTERM"); } catch {}
    try { if (udp) udp.close(); } catch {}
  });
