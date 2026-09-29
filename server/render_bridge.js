const http = require("http");
const dgram = require("dgram");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 10000);
const PHOTON_HOST = process.env.PHOTON_HOST || "127.0.0.1";
const PHOTON_PORT = Number(process.env.PHOTON_PORT || 27001);

const server = http.createServer((req,res)=>{
  if(req.url === "/health"){
    res.writeHead(200, {"content-type":"application/json","cache-control":"no-store"});
    res.end(JSON.stringify({ok:true,service:"justfall-photon"}));
    return;
  }
  res.writeHead(200, {"content-type":"text/plain"});
  res.end("JustFall Photon relay");
});

const wss = new WebSocketServer({server, path:"/ws", perMessageDeflate:false, maxPayload:8*1024*1024});

wss.on("connection",(ws,req)=>{
  const udp = dgram.createSocket("udp4");
  let closed=false;

  udp.on("message",(data)=>{
    if(ws.readyState === ws.OPEN) ws.send(data, {binary:true});
  });

  udp.on("error",(err)=>{
    console.error("[UDP]", err.message);
    if(ws.readyState === ws.OPEN) ws.close(1011, "Photon relay error");
  });

  udp.connect(PHOTON_PORT, PHOTON_HOST, ()=>{
    console.log("[WS] Photon client connected from", req.socket.remoteAddress);
  });

  ws.on("message",(data,isBinary)=>{
    if(closed) return;
    const packet = Buffer.isBuffer(data) ? data : Buffer.from(data);
    udp.send(packet);
  });

  const cleanup=()=>{
    if(closed) return;
    closed=true;
    try{udp.close()}catch{}
  };

  ws.on("close",cleanup);
  ws.on("error",cleanup);
});

server.listen(PORT,"0.0.0.0",()=>{
  console.log(`JustFall Photon WSS listening on :${PORT}, UDP -> ${PHOTON_HOST}:${PHOTON_PORT}`);
});
