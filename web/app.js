(() => {
  const $ = (s) => document.querySelector(s);
  const menu = $("#menu"), locker = $("#locker"), match = $("#match");
  const statusPill = $(".status-pill"), statusText = $("#statusText");
  const gameCanvas = $("#gameCanvas"), previewCanvas = $("#previewCanvas");
  const ctx = gameCanvas.getContext("2d"), pctx = previewCanvas.getContext("2d");
  const modeGrid = $("#modeGrid"), skinGrid = $("#skinGrid"), cosmeticGrid = $("#cosmeticGrid");
  const modeLabel = $("#modeLabel"), phaseLabel = $("#phaseLabel"), timer = $("#timer"), objective = $("#objective"), aliveCount = $("#aliveCount");
  const banner = $("#matchBanner");

  const MODES = [
    {id:"hexagon",name:"Hexagon",icon:"⬡",desc:"The classic survival arena. Step on ice and it starts disappearing. Last penguin standing wins.",tag:"SURVIVAL"},
    {id:"blocks",name:"Just Blocks",icon:"▦",desc:"A block course collapses beneath everyone. Keep moving and don't run out of floor.",tag:"COLLAPSE"},
    {id:"jump",name:"Just Jump",icon:"↟",desc:"Stay inside the arena and jump over the rotating sweep. Timing beats speed.",tag:"TIMING"},
    {id:"parkour",name:"Parkour",icon:"→",desc:"Race across the course, hit checkpoints and reach the finish before the clock.",tag:"RACE"}
  ];
  const SKINS = [
    ["Ice","#c9ecf4"],["Sky","#66b6ff"],["Mint","#78e5a4"],["Lime","#b9ec4e"],["Sun","#ffd75c"],["Orange","#ff9d52"],
    ["Coral","#ff6f7d"],["Pink","#f78ed0"],["Violet","#ac86ff"],["Ocean","#4c7fe8"],["Berry","#a94cf0"],["Shadow","#7d8790"]
  ].map(([name,color])=>({name,color}));
  const COSMETICS = ["None","Beanie","Crown","Horns","Halo","Top Hat","Bunny","Sunglasses"];

  let socket=null,connected=false,queueMode="hexagon",roomId=null;
  let selectedSkin=Number(localStorage.getItem("jf-skin")||0),selectedCosmetic=Number(localStorage.getItem("jf-cosmetic")||0);
  let state={phase:"menu",mode:"hexagon",players:[],tiles:[],remaining:0,round:0,serverTime:Date.now(),level:0};
  const keys=new Set();let lastInputSent=0,lastFrame=performance.now(),previewT=0;

  function setStatus(ok,text){statusPill.classList.toggle("ok",ok);statusText.textContent=text}
  function wsUrl(){if(window.RELOADED_WS_URL)return window.RELOADED_WS_URL;const proto=location.protocol==="https:"?"wss":"ws";return proto+"://"+location.host+"/ws"}

  function connect(){
    try{socket=new WebSocket(wsUrl())}catch{setStatus(false,"OFFLINE");return}
    socket.addEventListener("open",()=>{connected=true;setStatus(true,"ONLINE");socket.send(JSON.stringify({type:"auth",name:"Player",skin:selectedSkin,cosmetic:selectedCosmetic}))});
    socket.addEventListener("close",()=>{connected=false;setStatus(false,"OFFLINE");if(!match.classList.contains("hidden")&&state.phase!=="results"){showBanner("SERVER DISCONNECTED","Returning to lobby...");setTimeout(backToMenu,1500)}});
    socket.addEventListener("error",()=>setStatus(false,"RECONNECTING"));
    socket.addEventListener("message",e=>{let m;try{m=JSON.parse(e.data)}catch{return}handleMessage(m)});
  }
  function handleMessage(m){
    if(m.type==="welcome")return;
    if(m.type==="stats"){$("#serverInfo").textContent=m.players+" players · "+m.rooms+" rooms";return}
    if(m.type==="queued"){state.phase="countdown";modeLabel.textContent=m.mode.toUpperCase();phaseLabel.textContent="QUEUED";showBanner("ROOM "+m.room,"Starting...");return}
    if(m.type==="snapshot"){
      state=m;roomId=m.room;modeLabel.textContent=String(m.mode).toUpperCase();phaseLabel.textContent=String(m.phase).toUpperCase();
      aliveCount.textContent=(m.players||[]).filter(p=>p.alive).length;objective.textContent=m.objective||"";
      if(m.phase==="countdown")showBanner(String(m.countdown||3),"Get ready");else if(m.phase==="running")hideBanner();else if(m.phase==="results")showBanner(m.winner?m.winner+" WINS":"ROUND OVER","Click here to return");
      return;
    }
    if(m.type==="result"){state.phase="results";phaseLabel.textContent="RESULTS";showBanner(m.title||"RESULT",m.subtitle||"Back to lobby");return}
    if(m.type==="error")showBanner("ERROR",m.message||"Something went wrong")
  }
  function send(o){if(socket&&connected&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(o))}
  function queue(){state.mode=queueMode;if(!connected){startLocal(queueMode);return}showMatch();send({type:"queue",mode:queueMode,skin:selectedSkin,cosmetic:selectedCosmetic})}
  function cancelMatch(){send({type:"leave"});backToMenu()}
  function showMatch(){menu.classList.add("hidden");locker.classList.add("hidden");match.classList.remove("hidden");resize()}
  function backToMenu(){send({type:"leave"});match.classList.add("hidden");locker.classList.add("hidden");menu.classList.remove("hidden");hideBanner();state.phase="menu"}
  function openLocker(){menu.classList.add("hidden");locker.classList.remove("hidden")}
  function showBanner(title,sub){banner.innerHTML="<div>"+escapeHtml(title)+"</div><small>"+escapeHtml(sub||"")+"</small>";banner.classList.remove("hidden")}
  function hideBanner(){banner.classList.add("hidden")}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

  function renderModes(){
    modeGrid.innerHTML="";
    MODES.forEach(m=>{const el=document.createElement("button");el.className="mode-card"+(m.id===queueMode?" selected":"");el.innerHTML="<div class='mode-icon'>"+m.icon+"</div><h3>"+m.name+"</h3><p>"+m.desc+"</p><div class='tag'>"+m.tag+" · 8 PLAYERS</div>";el.addEventListener("click",()=>{queueMode=m.id;state.mode=m.id;document.querySelectorAll(".mode-card").forEach(x=>x.classList.remove("selected"));el.classList.add("selected")});modeGrid.appendChild(el)})
  }
  function renderLocker(){
    skinGrid.innerHTML="";
    SKINS.forEach((s,i)=>{const el=document.createElement("button");el.className="skin-card"+(i===selectedSkin?" selected":"");el.innerHTML="<div class='skin-swatch' style='background:"+s.color+"'><div class='mini-penguin' style='background:"+s.color+"'></div></div><div class='skin-name'>"+s.name+"</div><span>UNLOCKED</span>";el.addEventListener("click",()=>{selectedSkin=i;localStorage.setItem("jf-skin",i);renderLocker();send({type:"cosmetic",skin:i,cosmetic:selectedCosmetic})});skinGrid.appendChild(el)});
    cosmeticGrid.innerHTML="";
    COSMETICS.forEach((c,i)=>{const el=document.createElement("button");el.className="cosmetic"+(i===selectedCosmetic?" selected":"");el.textContent=c+" · UNLOCKED";el.addEventListener("click",()=>{selectedCosmetic=i;localStorage.setItem("jf-cosmetic",i);renderLocker();send({type:"cosmetic",skin:selectedSkin,cosmetic:i})});cosmeticGrid.appendChild(el)})
  }

  function resize(){const dpr=Math.min(2,window.devicePixelRatio||1);gameCanvas.width=Math.floor(innerWidth*dpr);gameCanvas.height=Math.floor(innerHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
  window.addEventListener("resize",resize);

  function sendInput(){if(state.phase!=="running")return;const now=performance.now();if(now-lastInputSent<50)return;lastInputSent=now;send({type:"input",keys:[...keys]})}
  window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)||e.code.startsWith("Shift"))e.preventDefault();if(k===" ")keys.add("space");else if(k.startsWith("arrow"))keys.add(k.replace("arrow",""));else if(e.code.startsWith("Shift"))keys.add("shift");else if(["w","a","s","d"].includes(k))keys.add(k);sendInput()});
  window.addEventListener("keyup",e=>{const k=e.key.toLowerCase();if(k===" ")keys.delete("space");else if(k.startsWith("arrow"))keys.delete(k.replace("arrow",""));else if(e.code.startsWith("Shift"))keys.delete("shift");else if(["w","a","s","d"].includes(k))keys.delete(k);sendInput()});
  document.querySelectorAll("[data-key]").forEach(b=>{const k=b.dataset.key,on=()=>{keys.add(k);sendInput()},off=()=>{keys.delete(k);sendInput()};b.addEventListener("pointerdown",e=>{e.preventDefault();on()});b.addEventListener("pointerup",off);b.addEventListener("pointerleave",off);b.addEventListener("pointercancel",off)});

  function startLocal(mode){showMatch();state=localState(mode);showBanner(mode.toUpperCase(),"LOCAL PRACTICE · server offline")}
  function localState(mode){
    const ps=[];for(let i=0;i<8;i++)ps.push({id:"p"+i,name:i===0?"You":["Frost","Flake","Chill","Glacier","Mint","Blue","Snow"][i-1],real:i===0,x:(i%4-1.5)*2,z:(Math.floor(i/4)-.5)*3,y:0,rot:0,alive:true,skin:i%12,cosmetic:i%8});
    const tiles=[];if(mode==="hexagon")for(let r=-4;r<=4;r++)for(let q=-4;q<=4;q++)tiles.push({q,r,state:0});
    return {phase:"running",mode,players:ps,tiles,remaining:90,round:1,level:0,serverTime:Date.now(),objective:mode==="parkour"?"Reach the finish":"Stay alive"}
  }

  function project(x,z,y=0){const scale=Math.min(innerWidth,innerHeight)*.055;return{x:innerWidth*.5+(x-z)*scale,y:innerHeight*.57+(x+z)*scale*.5-y*scale}}
  function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
  function hex(cx,cy,r){const a=[];for(let i=0;i<6;i++){const ang=Math.PI/3*i+Math.PI/6;a.push({x:cx+Math.cos(ang)*r,y:cy+Math.sin(ang)*r*.72})}return a}
  function drawTile(x,z,alive,warning,depth=0){const p=project(x,z,0),r=Math.min(innerWidth,innerHeight)*.047,hp=hex(p.x,p.y,r);if(!alive){poly(hp,"rgba(11,19,13,.35)");return}poly(hp,warning?"#e1c96b":"#91d9e8","rgba(0,0,0,.16)");const side=hp.map(v=>({x:v.x,y:v.y+12+depth}));poly([hp[3],hp[4],hp[5],side[5],side[4],side[3]],"rgba(47,86,62,.7)")}
  function drawPenguin(p){
    if(!p.alive)return;const s=innerHeight*.045,q=project(p.x,p.z,p.y||0),skin=SKINS[p.skin%SKINS.length].color;
    ctx.save();ctx.translate(q.x,q.y);ctx.rotate(-(p.rot||0)*.35);ctx.fillStyle="rgba(0,0,0,.25)";ctx.beginPath();ctx.ellipse(0,12,s*.66,s*.18,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(0,-3,s*.55,s*.74,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f7fbf8";ctx.beginPath();ctx.ellipse(0,1,s*.37,s*.42,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#0a110c";ctx.beginPath();ctx.arc(-s*.16,-14,s*.075,0,Math.PI*2);ctx.arc(s*.16,-14,s*.075,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f0aa42";ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(s*.16,-3);ctx.lineTo(0,0);ctx.lineTo(-s*.16,-3);ctx.closePath();ctx.fill();
    if(p.cosmetic===1){ctx.fillStyle="#e6ece8";ctx.fillRect(-s*.44,-30,s*.88,s*.18);ctx.beginPath();ctx.arc(0,-31,s*.44,Math.PI,0);ctx.fill()}
    if(p.cosmetic===2){ctx.fillStyle="#f6cd57";for(let i=-1;i<=1;i++)ctx.fillRect(i*s*.18-2,-32,4,10)}
    if(p.cosmetic===3){ctx.strokeStyle="#e77950";ctx.lineWidth=4;ctx.beginPath();ctx.arc(-s*.33,-25,s*.12,Math.PI,Math.PI*2);ctx.arc(s*.33,-25,s*.12,Math.PI,Math.PI*2);ctx.stroke()}
    if(p.cosmetic===4){ctx.strokeStyle="#f9e58a";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-24,s*.6,0,Math.PI*2);ctx.stroke()}
    if(p.cosmetic===5){ctx.fillStyle="#131916";ctx.fillRect(-s*.4,-34,s*.8,s*.1);ctx.fillRect(-s*.2,-44,s*.4,s*.12)}
    if(p.cosmetic===6){ctx.strokeStyle="#f4f1f0";ctx.lineWidth=3;ctx.beginPath();ctx.arc(-s*.33,-25,s*.1,0,Math.PI*2);ctx.arc(s*.33,-25,s*.1,0,Math.PI*2);ctx.stroke()}
    if(p.cosmetic===7){ctx.fillStyle="#18211b";ctx.fillRect(-s*.32,-15,s*.64,s*.18)}
    ctx.restore();if(p.real){ctx.fillStyle="#eef6ef";ctx.font="700 11px system-ui";ctx.textAlign="center";ctx.fillText("YOU",q.x,q.y-s*.95)}
  }

  function drawWorld(){
    const g=ctx.createLinearGradient(0,0,0,innerHeight);g.addColorStop(0,"#0b1910");g.addColorStop(1,"#07100a");ctx.fillStyle=g;ctx.fillRect(0,0,innerWidth,innerHeight);
    ctx.fillStyle="rgba(116,222,137,.05)";ctx.beginPath();ctx.arc(innerWidth*.5,innerHeight*.55,Math.min(innerWidth,innerHeight)*.43,0,Math.PI*2);ctx.fill();
    const mode=state.mode;
    if(mode==="hexagon"){(state.tiles||[]).forEach(t=>drawTile(t.q*1.58,t.r*1.37,t.state!==2,t.state===1,t.r))}
    else if(mode==="blocks"){for(let x=-5;x<=5;x++)for(let z=-3;z<=3;z++)drawTile(x*1.45,z*1.45,true,false,Math.abs((x+z)%5))}
    else if(mode==="jump"){const c=project(0,0,0),r=Math.min(innerWidth,innerHeight)*.36;ctx.fillStyle="#6aa9bd";ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=3;ctx.beginPath();ctx.arc(c.x,c.y,r*.92,0,Math.PI*2);ctx.stroke();const ang=((state.serverTime||Date.now())/1000)*2.4;ctx.save();ctx.translate(c.x,c.y);ctx.rotate(ang);ctx.fillStyle="#d96565";ctx.fillRect(-r*.95,-5,r*1.9,10);ctx.restore()}
    else if(mode==="parkour"){for(let i=0;i<13;i++){const x=-8+i*1.45,z=Math.sin(i*.9)*2;drawTile(x,z,true,false,i)}const goal=project(10,Math.sin(12*.9)*2,0);ctx.fillStyle="#72e18b";ctx.fillRect(goal.x-10,goal.y-30,20,30)}
    const ps=[...(state.players||[])].filter(p=>p.alive).sort((a,b)=>(a.y||0)-(b.y||0));ps.forEach(drawPenguin);
  }

  function tick(now){const dt=Math.min(.04,(now-lastFrame)/1000);lastFrame=now;previewT+=dt;sendInput();if(!match.classList.contains("hidden")){drawWorld();const sec=Math.max(0,Math.ceil(Number(state.remaining||0)));timer.textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}else drawPreview();requestAnimationFrame(tick)}
  function drawPreview(){
    const w=previewCanvas.clientWidth||520,h=previewCanvas.clientHeight||360,scale=window.devicePixelRatio||1;
    if(previewCanvas.width!==Math.floor(w*scale)){previewCanvas.width=Math.floor(w*scale);previewCanvas.height=Math.floor(h*scale)}
    pctx.setTransform(scale,0,0,scale,0,0);pctx.clearRect(0,0,w,h);pctx.fillStyle="#09140d";pctx.fillRect(0,0,w,h);
    for(let r=-3;r<=3;r++)for(let q=-3;q<=3;q++){const x=w/2+(q-r)*28,y=h/2+(q+r)*14,a=[];for(let i=0;i<6;i++){const ang=Math.PI/3*i+Math.PI/6;a.push({x:x+Math.cos(ang)*24,y:y+Math.sin(ang)*17})}polyPreview(a,"#6ca9b5")}
    const x=w/2+Math.sin(previewT)*34,y=h/2+Math.cos(previewT*.7)*14-30;pctx.save();pctx.translate(x,y);pctx.fillStyle=SKINS[selectedSkin].color;pctx.beginPath();pctx.ellipse(0,0,24,33,0,0,Math.PI*2);pctx.fill();pctx.fillStyle="#f7fbf8";pctx.beginPath();pctx.ellipse(0,8,15,18,0,0,Math.PI*2);pctx.fill();pctx.fillStyle="#0c140e";pctx.beginPath();pctx.arc(-7,-10,3,0,Math.PI*2);pctx.arc(7,-10,3,0,Math.PI*2);pctx.fill();pctx.restore();
  }
  function polyPreview(ps,f){pctx.beginPath();ps.forEach((p,i)=>i?pctx.lineTo(p.x,p.y):pctx.moveTo(p.x,p.y));pctx.closePath();pctx.fillStyle=f;pctx.fill()}

  $("#playBtn").addEventListener("click",queue);$("#lockerBtn").addEventListener("click",openLocker);$("#lockerBack").addEventListener("click",()=>{locker.classList.add("hidden");menu.classList.remove("hidden")});$("#leaveBtn").addEventListener("click",cancelMatch);banner.addEventListener("click",()=>{if(state.phase==="results")backToMenu()});
  connect();renderModes();renderLocker();requestAnimationFrame(tick);
})();
