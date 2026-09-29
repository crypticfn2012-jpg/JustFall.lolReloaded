const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 10000);
const PHOTON_HOST = process.env.PHOTON_HOST || "127.0.0.1";
const PHOTON_PORT = Number(process.env.PHOTON_PORT || 27001);
const MTU = 1100;

function u16(n){ return Buffer.from([(n >>> 8) & 255, n & 255]); }
function u32(n){ const b=Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }
function i32(n){ const b=Buffer.alloc(4); b.writeInt32BE(n|0); return b; }

function packet(challenge, commands){
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0,0);
  header[2]=0;
  header[3]=commands.length & 255;
  header.writeUInt32BE(Date.now() >>> 0,4);
  header.writeInt32BE(challenge|0,8);
  return Buffer.concat([header, ...commands]);
}

function connectCommand(){
  const c=Buffer.alloc(12);
  c[0]=2; c[1]=0; c[2]=1; c[3]=0;
  c.writeInt32BE(12,4);
  c.writeInt32BE(0,8);
  return c;
}

function ackCommand(channel, seq, timestamp){
  const c=Buffer.alloc(20);
  c[0]=1; c[1]=channel; c[2]=0; c[3]=0;
  c.writeInt32BE(20,4);
  c.writeInt32BE(0,8);
  c.writeInt32BE(seq|0,12);
  c.writeUInt32BE(timestamp >>> 0,16);
  return c;
}

function reliableCommand(channel, seq, payload){
  const c=Buffer.alloc(12 + payload.length);
  c[0]=6; c[1]=channel; c[2]=1; c[3]=4;
  c.writeInt32BE(c.length,4);
  c.writeInt32BE(seq|0,8);
  payload.copy(c,12);
  return c;
}

function fragmentCommand(channel, seq, startSeq, count, num, total, offset, payload){
  const c=Buffer.alloc(32 + payload.length);
  c[0]=8; c[1]=channel; c[2]=1; c[3]=4;
  c.writeInt32BE(c.length,4);
  c.writeInt32BE(seq|0,8);
  c.writeInt32BE(startSeq|0,12);
  c.writeInt32BE(count|0,16);
  c.writeInt32BE(num|0,20);
  c.writeInt32BE(total|0,24);
  c.writeInt32BE(offset|0,28);
  payload.copy(c,32);
  return c;
}

function parsePacket(buf){
  if(buf.length < 12) return null;
  const count=buf[3], timestamp=buf.readUInt32BE(4), challenge=buf.readInt32BE(8);
  let o=12, commands=[];
  for(let i=0;i<count;i++){
    if(o+12>buf.length) break;
    const type=buf[o], channel=buf[o+1], flags=buf[o+2];
    const size=buf.readInt32BE(o+4);
    const seq=buf.readInt32BE(o+8);
    if(size<12 || o+size>buf.length) break;
    let payloadStart=o+12, extra={};
    if(type===7){ if(o+16>buf.length) break; payloadStart=o+16; extra.unreliableSeq=buf.readInt32BE(o+12); }
    if(type===8){
      if(o+32>buf.length) break;
      extra.startSeq=buf.readInt32BE(o+12);
      extra.count=buf.readInt32BE(o+16);
      extra.number=buf.readInt32BE(o+20);
      extra.total=buf.readInt32BE(o+24);
      extra.offset=buf.readInt32BE(o+28);
      payloadStart=o+32;
    }
    commands.push({type,channel,flags,seq,payload:buf.subarray(payloadStart,o+size),...extra});
    o+=size;
  }
  return {timestamp,challenge,commands};
}

const server=http.createServer((req,res)=>{
  if(req.url==="/health"){
    res.writeHead(200,{"content-type":"application/json"});
    return res.end(JSON.stringify({ok:true,service:"justfall-photon-ws-bridge"}));
  }
  res.writeHead(200,{"content-type":"text/plain"});
  res.end("JustFall.lol Reloaded Photon bridge");
});

const wss=new WebSocket.Server({
  server,
  path:"/ws",
  handleProtocols:(protocols)=>protocols.values().next().value || false
});

wss.on("connection",(ws,req)=>{
  const udp=dgram.createSocket("udp4");
  const challenge=crypto.randomInt(-2147483648,2147483647);
  let closed=false;
  let nextSeq=1;
  const fragments=new Map();

  function sendUdp(commands){
    if(closed) return;
    udp.send(packet(challenge,commands),PHOTON_PORT,PHOTON_HOST);
  }

  udp.on("message",(buf)=>{
    const p=parsePacket(buf);
    if(!p || p.challenge!==challenge) return;

    for(const c of p.commands){
      if(c.type===6 || c.type===7 || c.type===8){
        if(c.flags & 1) sendUdp([ackCommand(c.channel,c.seq,p.timestamp)]);
      }
      if(c.type===6 || c.type===7){
        if(c.payload.length) ws.send(c.payload,{binary:true});
      } else if(c.type===8){
        let f=fragments.get(c.startSeq);
        if(!f){
          f={total:c.total,count:c.count,received:0,parts:new Map()};
          fragments.set(c.startSeq,f);
        }
        if(!f.parts.has(c.number)){
          f.parts.set(c.number,c.payload);
          f.received++;
        }
        if(f.received>=f.count){
          const out=Buffer.alloc(f.total);
          let ok=true;
          for(const [n,part] of f.parts){
            const off = n===0 ? 0 : null;
            if(off===null){ ok=false; break; }
          }
          if(ok){
            const ordered=[...f.parts.entries()].sort((a,b)=>a[0]-b[0]);
            let off=0;
            for(const [,part] of ordered){ part.copy(out,off); off+=part.length; }
            if(off===f.total) ws.send(out,{binary:true});
          }
          fragments.delete(c.startSeq);
        }
      }
    }
  });

  udp.on("error",(e)=>{
    if(!closed) console.error("[udp]",e.message);
    try{ws.close();}catch{}
  });

  udp.bind(()=>{
    sendUdp([connectCommand()]);
  });

  ws.on("message",(data,isBinary)=>{
    if(closed || !isBinary) return;
    const payload=Buffer.from(data);
    if(payload.length===0) return;
    if(payload.length<=MTU){
      sendUdp([reliableCommand(0,nextSeq++,payload)]);
      return;
    }
    const count=Math.ceil(payload.length/MTU);
    const start=nextSeq;
    for(let n=0;n<count;n++){
      const part=payload.subarray(n*MTU,Math.min(payload.length,(n+1)*MTU));
      const seq=nextSeq++;
      sendUdp([fragmentCommand(0,seq,start,count,n,payload.length,n*MTU,part)]);
    }
  });

  ws.on("close",()=>{
    closed=true;
    try{ udp.close(); }catch{}
  });
  ws.on("error",()=>{
    closed=true;
    try{ udp.close(); }catch{}
  });
});

server.listen(PORT,"0.0.0.0",()=>console.log("Photon WSS bridge listening on "+PORT+" -> UDP "+PHOTON_HOST+":"+PHOTON_PORT));
