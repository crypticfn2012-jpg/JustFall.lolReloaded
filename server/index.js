const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 8080);
const WEB_ROOT = path.join(__dirname, "..", "web");
const rooms = new Map();
let nextPlayerId = 1;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(body);
}

function serve(res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(WEB_ROOT, relative);
  if (!file.startsWith(path.resolve(WEB_ROOT) + path.sep)) return json(res, 403, {error:"forbidden"});
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, {error:"not found"});
    const types = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
    res.writeHead(200, {"Content-Type":types[path.extname(file)] || "application/octet-stream","Cache-Control":"no-cache"});
    res.end(data);
  });
}

const httpServer = http.createServer((req,res) => {
  const url = new URL(req.url,"http://localhost");
  if (url.pathname === "/health") {
    return json(res,200,{ok:true,service:"JustFall.lol Reloaded",rooms:rooms.size,players:[...rooms.values()].reduce((n,r)=>n+r.players.size,0)});
  }
  serve(res,url.pathname);
});

const wss = new WebSocket.Server({server:httpServer,path:"/ws"});

function broadcast(room,message,except) {
  const data = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.ws !== except && player.ws.readyState === WebSocket.OPEN) player.ws.send(data);
  }
}

wss.on("connection",(ws) => {
  const player={id:String(nextPlayerId++),name:"Player",room:null,ws,x:0,y:2,z:0,rotation:0};
  ws.send(JSON.stringify({type:"welcome",playerId:player.id,protocol:"reloaded-v1"}));

  ws.on("message",(raw)=>{
    let msg;
    try { msg=JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join") {
      const roomId=String(msg.room || "public");
      if (!rooms.has(roomId)) rooms.set(roomId,{id:roomId,players:new Map()});
      const room=rooms.get(roomId);
      player.room=roomId;
      player.name=String(msg.name || "Player").slice(0,20);
      room.players.set(player.id,player);
      ws.send(JSON.stringify({type:"room",room:room.id,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,z:p.z,rotation:p.rotation}))}));
      broadcast(room,{type:"player-joined",player:{id:player.id,name:player.name,x:player.x,y:player.y,z:player.z,rotation:player.rotation}},ws);
      return;
    }

    if (msg.type === "state" && player.room && rooms.has(player.room)) {
      player.x=Number(msg.x)||0; player.y=Number(msg.y)||0; player.z=Number(msg.z)||0; player.rotation=Number(msg.rotation)||0;
      broadcast(rooms.get(player.room),{type:"player-state",player:{id:player.id,x:player.x,y:player.y,z:player.z,rotation:player.rotation}},ws);
    }
  });

  ws.on("close",()=>{
    if (!player.room || !rooms.has(player.room)) return;
    const room=rooms.get(player.room);
    room.players.delete(player.id);
    broadcast(room,{type:"player-left",playerId:player.id});
    if (room.players.size===0) rooms.delete(room.id);
  });
});

httpServer.listen(PORT,()=>console.log("JustFall.lol Reloaded server listening on http://localhost:"+PORT));
