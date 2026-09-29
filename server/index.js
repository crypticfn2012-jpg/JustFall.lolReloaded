const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const WebSocket=require("ws");

const PORT=Number(process.env.PORT||8080),ROOT=path.join(__dirname,"..","web");
const rooms=new Map(),waiting=new Map(),sockets=new Set();
const NAMES=["Frost","Flake","Chill","Glacier","Mint","Snow","Blue","Drift"],COSMETICS=8;
const MODES=new Set(["hexagon","blocks","jump","parkour"]);
let nextPlayer=1;

function send(ws,data){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))}
function json(res,code,data){const body=JSON.stringify(data);res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(body)}
function file(res,pathname){const clean=pathname==="/"?"index.html":pathname.replace(/^\/+/, ""),root=path.resolve(ROOT),target=path.resolve(ROOT,clean);if(!target.startsWith(root+path.sep))return json(res,403,{error:"forbidden"});fs.readFile(target,(err,data)=>{if(err)return json(res,404,{error:"not found"});const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};res.writeHead(200,{"Content-Type":types[path.extname(target)]||"application/octet-stream","Cache-Control":"no-cache"});res.end(data)})}
const server=http.createServer((req,res)=>{const url=new URL(req.url,"http://localhost");if(url.pathname==="/health"){let players=0;for(const r of rooms.values())players+=r.players.size;return json(res,200,{ok:true,service:"JustFall.lol Reloaded",rooms:rooms.size,players})}if(url.pathname==="/stats"){let players=0;for(const r of rooms.values())players+=r.players.size;return json(res,200,{players,rooms:rooms.size,version:"1.0.0"})}file(res,url.pathname)});
const wss=new WebSocket.Server({server,path:"/ws"});

function newRoom(mode,owner=null,code=null){const id=code||crypto.randomBytes(3).toString("hex").toUpperCase();const room={id,mode,phase:"countdown",players:new Map(),created:Date.now(),started:Date.now()+3500,lastBroadcast:0,round:1,level:1,time:0,maxTime:mode==="parkour"?90:mode==="hexagon"?90:60,winner:null,roundEndsAt:0,tiles:[],platforms:[],finish:null,hazard:0};rooms.set(id,room);if(owner)room.owner=owner;buildArena(room);return room}
function addBot(room,i){const id="bot"+i+"-"+Math.random().toString(36).slice(2,6);room.players.set(id,{id,name:NAMES[i%NAMES.length],real:false,ws:null,x:(i%4-1.5)*2,z:(Math.floor(i/4)-.5)*2.5,y:0,vy:0,rot:0,vx:0,vz:0,grounded:true,alive:true,skin:i%12,cosmetic:i%COSMETICS,fallAt:0,checkpoint:0,wone:false,input:new Set()})}
function addPlayer(room,ws){if(room.players.size>=8){const bot=[...room.players.values()].find(p=>!p.real);if(bot)room.players.delete(bot.id);else return null}const id=String(nextPlayer++),p={id,name:ws._name||"Player",real:true,ws,x:0,z:0,y:0,vy:0,rot:0,vx:0,vz:0,grounded:true,alive:true,skin:ws._skin||0,cosmetic:ws._cosmetic||0,fallAt:0,checkpoint:0,wone:false,input:new Set()};room.players.set(id,p);ws._player=p;ws._room=room;return p}
function ensureBots(room){let i=0;while(room.players.size<8){addBot(room,i);i++}}
function buildArena(room){
  if(room.mode==="hexagon"){room.tiles=[];for(let r=-4;r<=4;r++)for(let q=-4;q<=4;q++)room.tiles.push({q,r,state:0,goneAt:0})}
  else if(room.mode==="blocks"){room.platforms=[];let id=0;for(let x=-5;x<=5;x++)for(let z=-3;z<=3;z++)room.platforms.push({id:id++,x:x*1.45,z:z*1.45,safe:true,goneAt:Date.now()+16000+((id*137)%26000)})}
  else if(room.mode==="parkour"){room.platforms=[];for(let i=0;i<13;i++)room.platforms.push({x:-8+i*1.45,z:Math.sin(i*.9)*2,w:1.05,d:1.05});room.finish={x:10,z:Math.sin(12*.9)*2}}
}
function spawnPlayer(room,p,index){if(room.mode==="parkour"){const cp=Math.max(0,Math.min(12,p.checkpoint||0)),plat=room.platforms[Math.min(cp,room.platforms.length-1)];p.x=plat?plat.x:-8;p.z=plat?plat.z:0}else{const i=index%8;p.x=(i%4-1.5)*2;p.z=(Math.floor(i/4)-.5)*2.4}p.y=0;p.vy=0;p.vx=0;p.vz=0;p.grounded=true;p.alive=true;p.fallAt=0;p.wone=false}
function resetRound(room){room.round++;room.level=room.round;room.time=0;room.players.forEach((p,i)=>{if(p.alive){p.checkpoint=0;spawnPlayer(room,p,i)}});room.tiles.forEach(t=>{t.state=0;t.goneAt=0});room.platforms.forEach(p=>{p.safe=true;p.goneAt=Date.now()+12000+Math.floor(Math.random()*22000)});room.roundEndsAt=Date.now()+18000}
function hexUnder(room,p){let best=null,bd=1e9;for(const t of room.tiles){const x=t.q*1.58,z=t.r*1.37,d=(p.x-x)**2+(p.z-z)**2;if(d<bd){bd=d;best=t}}return bd<1.1?best:null}
function platformUnder(room,p){if(room.mode==="parkour")return room.platforms.find(pl=>Math.abs(p.x-pl.x)<pl.w*.72&&Math.abs(p.z-pl.z)<pl.d*.72);if(room.mode==="blocks"){let best=null,bd=1e9;for(const pl of room.platforms){if(!pl.safe)continue;const d=(p.x-pl.x)**2+(p.z-pl.z)**2;if(d<bd){bd=d;best=pl}}return best&&bd<1.18?best:null}}
function isGrounded(room,p){if(room.mode==="hexagon"){const t=hexUnder(room,p);return !!(t&&t.state!==2&&p.y<=.65)}if(room.mode==="jump")return p.x*p.x+p.z*p.z<58&&p.y<=.65;return !!(platformUnder(room,p)&&p.y<=.65)}
function kill(room,p,reason="FELL"){if(!p.alive)return;p.alive=false;p.fallAt=Date.now();p.y=-3;p.reason=reason}
function botInput(room,p){
  const k=new Set();if(!p.alive)return k;
  if(room.mode==="hexagon"){let best=null,bd=1e9;for(const t of room.tiles){if(t.state===2)continue;const x=t.q*1.58,z=t.r*1.37,d=(p.x-x)**2+(p.z-z)**2;if(d<bd&&d>.55){bd=d;best={x,z}}}if(best){if(best.x>p.x+.2)k.add("d");if(best.x<p.x-.2)k.add("a");if(best.z>p.z+.2)k.add("s");if(best.z<p.z-.2)k.add("w");if(Math.random()<.04)k.add("space")}}
  else if(room.mode==="blocks"){const targets=room.platforms.filter(x=>x.safe),best=targets[Math.floor(Math.random()*Math.max(1,targets.length))];if(best){if(best.x>p.x+.2)k.add("d");if(best.x<p.x-.2)k.add("a");if(best.z>p.z+.2)k.add("s");if(best.z<p.z-.2)k.add("w");if(Math.random()<.05)k.add("space")}}
  else if(room.mode==="jump"){const a=Math.atan2(p.z,p.x)+.5;if(Math.cos(a)>0)k.add("d");else k.add("a");if(Math.sin(a)>0)k.add("s");else k.add("w");if(Math.random()<.09)k.add("space")}
  else {const target=room.platforms[Math.min(12,p.checkpoint||0)];if(target){if(target.x>p.x+.2)k.add("d");if(target.x<p.x-.2)k.add("a");if(target.z>p.z+.2)k.add("s");if(target.z<p.z-.2)k.add("w");if(Math.random()<.07)k.add("space")}}
  return k
}
function simulate(room,dt){
  const now=Date.now();
  if(room.phase==="countdown"&&now>=room.started){room.phase="running";room.roundEndsAt=now+18000}
  if(room.phase!=="running")return;
  room.time+=dt;room.hazard+=dt*2.4;
  if(room.mode==="hexagon")room.tiles.forEach(t=>{if(t.state===1&&now>=t.goneAt)t.state=2});
  if(room.mode==="blocks")room.platforms.forEach(p=>{if(p.safe&&now>=p.goneAt)p.safe=false});
  for(const p of room.players.values()){
    if(!p.alive)continue;if(!p.real)p.input=botInput(room,p);
    const input=p.input;let ax=0,az=0;if(input.has("a")||input.has("left"))ax--;if(input.has("d")||input.has("right"))ax++;if(input.has("w")||input.has("up"))az--;if(input.has("s")||input.has("down"))az++;const len=Math.hypot(ax,az)||1;ax/=len;az/=len;
    const speed=room.mode==="parkour"?6.3:6.8;p.vx+=ax*10*dt;p.vz+=az*10*dt;p.vx*=Math.pow(.03,dt);p.vz*=Math.pow(.03,dt);const mag=Math.hypot(p.vx,p.vz);if(mag>speed){p.vx=p.vx/mag*speed;p.vz=p.vz/mag*speed}
    if(input.has("shift")&&mag>1){p.vx*=1.06;p.vz*=1.06}if(input.has("space")&&p.grounded){p.vy=7.3;p.grounded=false}
    p.vy-=18*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;if(Math.abs(p.vx)+Math.abs(p.vz)>.1)p.rot=Math.atan2(p.vz,p.vx);
    if(room.mode==="hexagon"){p.x=Math.max(-6.2,Math.min(6.2,p.x));p.z=Math.max(-6.2,Math.min(6.2,p.z));const t=hexUnder(room,p);if(t&&t.state===0&&p.y<.9){t.state=1;t.goneAt=now+900}p.grounded=!!(t&&t.state!==2&&p.y<=.72);if(p.grounded){p.y=0;p.vy=0}if(!t||t.state===2||p.y<-2.5)kill(room,p)}
    else if(room.mode==="blocks"){p.grounded=isGrounded(room,p);if(p.grounded){p.y=0;p.vy=0}if(p.y<-2.5)kill(room,p)}
    else if(room.mode==="jump"){const radius=Math.hypot(p.x,p.z);p.grounded=radius<7.7&&p.y<=.72;if(p.grounded){p.y=0;p.vy=0}const a=Math.atan2(p.z,p.x),bar=room.hazard%(Math.PI*2),d=Math.abs(Math.atan2(Math.sin(a-bar),Math.cos(a-bar)));if(p.y<1.0&&radius>1.4&&d<.09)kill(room,p,"HIT");if(radius>8.6)kill(room,p)}
    else {p.grounded=isGrounded(room,p);if(p.grounded){p.y=0;p.vy=0}const target=room.platforms[p.checkpoint||0];if(target&&Math.abs(p.x-target.x)<.8&&Math.abs(p.z-target.z)<.8)p.checkpoint=Math.min(12,(p.checkpoint||0)+1);if((p.checkpoint||0)>=12&&p.x>8.9){p.wone=true}if(p.wone){finish(room,p);return}if(p.y<-3){p.x=-8+(p.checkpoint||0)*1.45;p.z=Math.sin((p.checkpoint||0)*.9)*2;p.y=0;p.vy=0}}
  }
  const alive=[...room.players.values()].filter(p=>p.alive);
  if(room.mode==="parkour"){if(room.time>=room.maxTime)finish(room,alive[0]||null)}
  else if(alive.length<=1||room.time>=room.maxTime){if(room.mode==="hexagon"&&room.round<3&&alive.length>1){resetRound(room);return}finish(room,alive[0]||null)}
}
function pOut(p){return{id:p.id,name:p.name,real:p.real,x:+p.x.toFixed(3),y:+p.y.toFixed(3),z:+p.z.toFixed(3),rot:+p.rot.toFixed(3),alive:p.alive,skin:p.skin,cosmetic:p.cosmetic,checkpoint:p.checkpoint||0}}
function snapshot(room){return{type:"snapshot",room:room.id,phase:room.phase,mode:room.mode,round:room.round,level:room.level,countdown:room.phase==="countdown"?Math.max(0,Math.ceil((room.started-Date.now())/1000)):0,remaining:Math.max(0,room.maxTime-room.time),serverTime:Date.now(),players:[...room.players.values()].map(pOut),tiles:room.mode==="hexagon"?room.tiles.map(t=>({q:t.q,r:t.r,state:t.state})):[],objective:room.mode==="parkour"?"Reach the finish":"Stay alive"}}
function finish(room,winner){if(room.phase==="results")return;room.phase="results";room.winner=winner?.name||null;for(const p of room.players.values())if(p.real)send(p.ws,{type:"result",title:winner?.name?winner.name+" wins":"Round over",subtitle:room.mode==="parkour"?"Race complete":"Last penguin standing"});setTimeout(()=>{rooms.delete(room.id);if(waiting.get(room.mode)===room)waiting.delete(room.mode)},6000)}
function runRoom(room){const now=Date.now(),dt=Math.min(.1,(now-(room._lastTick||now))/1000);room._lastTick=now;simulate(room,dt);if(now-room.lastBroadcast>=100){room.lastBroadcast=now;const s=snapshot(room);for(const p of room.players.values())if(p.real)send(p.ws,s)}}
function joinQueue(ws,mode){mode=MODES.has(mode)?mode:"hexagon";let room=waiting.get(mode);if(!room||!rooms.has(room.id)||room.phase!=="countdown"||room.players.size>=8){room=newRoom(mode);waiting.set(mode,room)}const p=addPlayer(room,ws);if(!p)return send(ws,{type:"error",message:"Room is full"});ensureBots(room);send(ws,{type:"queued",room:room.id,mode});}

function stats(){let players=0;for(const r of rooms.values())for(const p of r.players.values())if(p.real)players++;const msg={type:"stats",players,rooms:rooms.size};for(const ws of sockets)send(ws,msg)}
wss.on("connection",ws=>{
  sockets.add(ws);ws._name="Player";ws._skin=0;ws._cosmetic=0;send(ws,{type:"welcome",protocol:"reloaded-v1",version:"1.0.0"});stats();
  ws.on("message",buf=>{let m;try{m=JSON.parse(buf.toString())}catch{return}
    if(m.type==="auth"){ws._name=String(m.name||"Player").slice(0,18)||"Player";ws._skin=Math.max(0,Math.min(11,Number(m.skin)||0));ws._cosmetic=Math.max(0,Math.min(7,Number(m.cosmetic)||0));return}
    if(m.type==="queue"){if(ws._room)return;joinQueue(ws,m.mode);stats();return}
    if(m.type==="cosmetic"){ws._skin=Math.max(0,Math.min(11,Number(m.skin)||0));ws._cosmetic=Math.max(0,Math.min(7,Number(m.cosmetic)||0));if(ws._player){ws._player.skin=ws._skin;ws._player.cosmetic=ws._cosmetic}return}
    if(m.type==="input"){if(ws._player&&ws._player.alive&&Array.isArray(m.keys))ws._player.input=new Set(m.keys.map(String).slice(0,12));return}
    if(m.type==="leave"){const p=ws._player,room=ws._room;if(p&&room){room.players.delete(p.id);ws._player=null;ws._room=null;if(room.players.size===0){rooms.delete(room.id);if(waiting.get(room.mode)===room)waiting.delete(room.mode)}}send(ws,{type:"left"});stats()}
  });
  ws.on("close",()=>{sockets.delete(ws);const p=ws._player,room=ws._room;if(p&&room){room.players.delete(p.id);if(room.players.size===0){rooms.delete(room.id);if(waiting.get(room.mode)===room)waiting.delete(room.mode)}}stats()});
});
setInterval(()=>{for(const room of rooms.values())runRoom(room);stats()},50);
server.listen(PORT,()=>console.log("JustFall.lol Reloaded listening on http://localhost:"+PORT));
