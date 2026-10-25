(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('field'),ctx=canvas.getContext('2d',{alpha:false});
const field=$('gameframe'),startOverlay=$('startOverlay'),endOverlay=$('endOverlay');
const playerName=$('nickname'),hud=$('hud'),rankboard=$('rankboard');
const mobileControls=$('mobileControls');
const mobile=()=>window.matchMedia('(max-width:700px)').matches || ('ontouchstart' in window && window.innerWidth<950);
const C={paper:'#eee8da',line:'#d9d2c4',ink:'#19222a',white:'#fffdf6',blue:'#3d5dd6',red:'#e85640'};
let socket=null, connected=false, wantedName='', active=false, meId=null, lastState=null;
const predictor=window.QuadriftPrediction;
let moveSeq=0,pendingMoves=[],pingMs=null,lastPingAt=0;
let reconnectDelay=700, reconnectTimer=0, statePlayers=new Map(), stateShards=[], shardIndex=new Map();
let viewport={w:1,h:1,dpr:1},tile=30,camera={x:38,y:28},focused=false;
let keyDown=new Set(),mobileDir=null,walkTarget=null,lastStep=0,lastHUD=0,lastRankJSON='',effects=[],lastNetworkAt=0;
let lastEnemies=[],selectedPreview=null,rivalCells=new Set(),audio=null,soundEnabled=true;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const worldToScreen=(x,y)=>({x:Math.round((x-camera.x)*tile+viewport.w/2),y:Math.round((y-camera.y)*tile+viewport.h/2)});
const toWorld=(sx,sy)=>({x:Math.floor((sx-viewport.w/2)/tile+camera.x),y:Math.floor((sy-viewport.h/2)/tile+camera.y)});
function resize() {
  viewport.w=field.clientWidth;viewport.h=field.clientHeight;
  viewport.dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(viewport.w*viewport.dpr));
  canvas.height=Math.max(1,Math.round(viewport.h*viewport.dpr));
  canvas.style.width=viewport.w+'px';canvas.style.height=viewport.h+'px';
  tile=mobile()?32:34;
}
window.addEventListener('resize',()=>{resize(); if(active){mobileControls.hidden=!mobile();rankboard.hidden=mobile();}});
resize();
function send(msg) {if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(msg));return true;}return false;}
function setConnection(status) {
  connected=status==='online';
  $('connectionLabel').textContent=status==='online'?'EN LÍNEA':status==='connecting'?'CONECTANDO':'SIN CONEXIÓN';
  $('onlineDot').className='online-dot '+(status==='online'?'live':'offline');
}
function connect() {
  if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)) return;
  setConnection('connecting');
  const scheme=location.protocol==='https:'?'wss:':'ws:';
  try{socket=new WebSocket(scheme+'//'+location.host+'/ws');}catch{setConnection('offline');return;}
  const instance=socket;
  socket.addEventListener('open',()=>{if(socket!==instance)return;
    setConnection('online');reconnectDelay=700;lastNetworkAt=performance.now();
  });
  socket.addEventListener('message',ev=>{
    if(socket!==instance)return;
    let msg;try{msg=JSON.parse(ev.data);}catch{return;}
    if(msg.t==='hello') {if(wantedName)send({t:'join',name:wantedName});}
    else if(msg.t==='welcome') {meId=msg.id;active=true;lastState=null;
      statePlayers.clear();shardIndex.clear();stateShards=[];moveSeq=0;pendingMoves=[];pingMs=null;walkTarget=null;startOverlay.hidden=true;endOverlay.hidden=true;
      hud.hidden=false;rankboard.hidden=mobile();mobileControls.hidden=!mobile();$('aimHint').hidden=mobile();
      setTimeout(()=>$('aimHint').hidden=true,6800);
    } else if(msg.t==='state') {lastState=msg;lastNetworkAt=performance.now();applySnapshot(msg);}
    else if(msg.t==='event') eventMessage(msg);
    else if(msg.t==='pong'){
      const sample=performance.now()-msg.ts;
      if(Number.isFinite(sample)&&sample>=0&&sample<30000){
        pingMs=pingMs===null?sample:pingMs*.72+sample*.28;
        $('pingValue').textContent=Math.round(pingMs);
        $('simValue').textContent=Number(msg.simMs||0).toFixed(1);
        $('loopValue').textContent=Number(msg.loopMs||0).toFixed(1);
        $('networkStats').classList.toggle('slow',pingMs>180||msg.loopMs>45);
      }
    }
    else if(msg.t==='respawned'){endOverlay.hidden=true;walkTarget=null;}
    else if(msg.t==='error') toast(msg.message||'No se pudo entrar.');
  });
  socket.addEventListener('close',()=>{
    if(socket!==instance)return;
    setConnection('offline');statePlayers.clear();shardIndex.clear();stateShards=[];pendingMoves=[];lastState=null;
    $('pingValue').textContent='—';$('simValue').textContent='—';$('loopValue').textContent='—';
    if(active)toast('CONEXIÓN PERDIDA · RECONECTANDO');
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(connect,reconnectDelay);
    reconnectDelay=Math.min(11000,Math.round(reconnectDelay*1.7));
  });
  socket.addEventListener('error',()=>{/* close handler retries */});
}
connect();
$('joinForm').addEventListener('submit',e=>{
  e.preventDefault();
  wantedName=playerName.value.trim().slice(0,16)||'JUGADOR';
  $('playBtn').textContent='CONECTANDO…';
  if(socket?.readyState===WebSocket.OPEN) send({t:'join',name:wantedName});
  else connect();
});
$('respawnBtn').addEventListener('click',()=>send({t:'respawn'}));
function flattenCells(flat){const a=[];for(let i=0;i<flat.length;i+=2)a.push({x:flat[i],y:flat[i+1]});return a;}
function applySnapshot(s) {
  const present=new Set();
  for(const raw of s.players){
    const [id,x,y,rank,color,name,isBot,flat,captures,joined,sprintLeft,readyLeft]=raw;
    present.add(id);
    let p=statePlayers.get(id);
    if(!p){p={id,x,y,drawX:x,drawY:y,rank,color,name,isBot:!!isBot,cells:[],captures:0,joined:0};statePlayers.set(id,p);}
    p.x=x;p.y=y;p.rank=rank;p.color=color;p.name=name;p.isBot=!!isBot;p.cells=flattenCells(flat);
    p.captures=captures;p.joined=joined||0;
    p.sprintUntil=performance.now()+(sprintLeft||0);p.sprintReady=performance.now()+(readyLeft||0);
  }
  for(const id of statePlayers.keys()) if(!present.has(id))statePlayers.delete(id);
  rivalCells=new Set();for(const player of statePlayers.values())if(player.id!==meId)for(const c of player.cells)rivalCells.add((player.x+c.x)+':'+(player.y+c.y));
  function decodeShard(raw){return {id:raw[0],x:raw[1],y:raw[2],cells:flattenCells(raw[3]),expiresAt:performance.now()+(raw[4]||0)};}
  if(Array.isArray(s.shards))shardIndex=new Map(s.shards.map(raw=>[raw[0],decodeShard(raw)]));
  else if(s.shardsDelta){
    for(const id of s.shardsDelta.remove)shardIndex.delete(id);
    for(const raw of s.shardsDelta.add)shardIndex.set(raw[0],decodeShard(raw));
  }
  stateShards=[...shardIndex.values()];
  const self=statePlayers.get(meId);
  if(self){
    // Rewind to the authoritative server pose, then reapply only unconfirmed
    // local inputs. We never predict pickups, rotation or combat outcomes.
    pendingMoves=pendingMoves.filter(move=>move.seq>(s.ack||0));
    const opponents=[...statePlayers.values()].filter(q=>q.id!==meId);
    const pose=predictor.replay(self.x,self.y,self.cells,pendingMoves,stateShards,opponents);
    self.x=pose.x;self.y=pose.y;
  }
  lastEnemies=s.enemies||[];updateEnemyReadout();
  $('humanCount').textContent=s.humans;
  $('botCount').textContent=s.bots;
  updateRankboard(s.ranking);
  updateHUD();
}
function updateRankboard(list) {
  const serialized=JSON.stringify(list);
  if(serialized===lastRankJSON)return;
  lastRankJSON=serialized;
  const root=$('ranking');root.replaceChildren();
  list.forEach((entry,idx)=>{
    const [id,name,rank,bot]=entry;
    const row=document.createElement('li');row.className=id===meId?'me':'';
    const place=document.createElement('span');place.className='place';place.textContent=String(idx+1).padStart(2,'0');
    const pip=document.createElement('span');pip.className='pip';
    const p=statePlayers.get(id);pip.style.background=p?.color||'#566177';
    const title=document.createElement('span');title.className='name';title.textContent=name.replace(' ·BOT','');
    const badge=document.createElement('small');badge.textContent=bot?'BOT':'';
    const score=document.createElement('b');score.textContent=rank+'×'+rank;
    row.append(place,pip,title,badge,score);root.append(row);
  });
}
function updateHUD() {
  const p=statePlayers.get(meId);if(!p)return;
  const completed=p.cells.length===p.rank*p.rank;
  const goal=Math.min(9,p.rank+1),needed=goal*goal;
  $('hudName').textContent=p.name.replace(' ·BOT','');
  $('rankSize').innerHTML=String(p.rank).padStart(2,'0')+'<small>×'+String(p.rank).padStart(2,'0')+'</small>';
  $('structureState').textContent=completed?'CUADRADO COMPLETO':'EN CONSTRUCCIÓN';
  $('structureState').style.color=completed?'#3d5dd6':'#e85640';
  $('nextLevel').textContent=p.rank>=9?'TAMAÑO MÁXIMO':'SIGUIENTE / '+goal+'×'+goal;
  $('rankProgress').style.width=(p.rank>=9?100:Math.min(100,100*p.cells.length/needed))+'%';
  $('rankCells').textContent=p.cells.length+' / '+(p.rank>=9?81:needed);
  $('joinedCount').textContent=p.joined;
  $('captureCount').textContent=p.captures;
  updateSprintButton(p);
}
function updateSprintButton(p) {
  const cd=Math.max(0,(p.sprintReady-performance.now())/1000);
  const ready=p.rank>=2 && p.cells.length===p.rank*p.rank && cd<=0;
  $('sprintDesktop').disabled=!ready;
  $('sprintMobile').disabled=!ready;
  $('sprintStatus').textContent=ready?'−'+(p.rank*2-1)+' CELDAS':cd>0?cd.toFixed(1)+'s / RECARGA':'CIERRA UN 2×2';
  $('sprintDesktop').classList.toggle('sprinting',performance.now()<p.sprintUntil);
}
function updateEnemyReadout() {
  const self=statePlayers.get(meId);
  if(!self||!active)return;
  const enemy=lastEnemies[0],view=$('enemyReadout');
  view.hidden=!enemy;
  if(!enemy)return;
  const [id,x,y,rank,solid,name,bot]=enemy;
  const d=Math.round(Math.hypot(x-self.x,y-self.y));
  const dangerous=rank>self.rank&&solid===1;
  view.classList.toggle('danger',dangerous&&d<15);
  $('enemyHeadline').textContent=dangerous&&d<15?'¡CUADRADO MAYOR!':name.replace(' ·BOT','').slice(0,14).toUpperCase();
  $('enemyDetail').textContent=(bot?'BOT · ':'JUGADOR · ')+rank+'×'+rank+' · '+d+' CELDAS';
}
function playTone(kind) {
  if(!soundEnabled)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audio)audio=new AC();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    osc.type='square';osc.frequency.setValueAtTime(kind==='level'?330:kind==='sprint'?180:kind==='join'?270:190,t);
    osc.frequency.exponentialRampToValueAtTime(kind==='level'?630:kind==='sprint'?115:kind==='join'?360:140,t+.13);
    gain.gain.setValueAtTime(.045,t);gain.gain.exponentialRampToValueAtTime(.001,t+.17);
    osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.18);
  } catch { /* audio is entirely optional */ }
}
function sprint(){if(isAlive())send({t:'sprint'});}
function toast(message,kind='') {
  const el=document.createElement('div');el.className='toast '+kind;el.textContent=message;
  $('toastContainer').append(el);setTimeout(()=>el.remove(),2300);
}
function burst() {
  const p=statePlayers.get(meId);if(!p)return;
  const cx=p.x+p.rank/2,cy=p.y+p.rank/2;
  for(let i=0;i<32;i++){
    const theta=Math.random()*Math.PI*2,vel=2+Math.random()*7;
    effects.push({x:cx,y:cy,vx:Math.cos(theta)*vel,vy:Math.sin(theta)*vel,age:0,color:i%3===0?C.red:p.color});
  }
}
function eventMessage(msg) {
  if(msg.type==='level') {toast('CUADRADO '+msg.rank+'×'+msg.rank+' COMPLETADO','level');burst();playTone('level');}
  if(msg.type==='capture') {toast('TERRITORIO CAPTURADO · '+msg.name,'level');burst();}
  if(msg.type==='join') {toast('+'+msg.cells+' CELDA'+(msg.cells===1?'':'S')+' UNIDAS');playTone('join');}
  if(msg.type==='no-fit') toast('ACÉRCATE A UNA PIEZA QUE ENCAJE');
  if(msg.type==='blocked') toast(msg.reason||'PIEZA INCOMPATIBLE');
  if(msg.type==='no-sprint')toast(msg.reason||'SPRINT NO DISPONIBLE');
  if(msg.type==='sprint'){toast('SPRINT · −'+msg.lost+' CELDAS · +VELOCIDAD','level');playTone('sprint');burst();}
  if(msg.type==='dead') {
    pendingMoves=[];walkTarget=null;endOverlay.hidden=false;
    $('killedBy').textContent=msg.by?msg.by+' se quedó con tu territorio.':'Tu estructura ha sido absorbida.';
    $('endRank').textContent=msg.best+'×'+msg.best;
    $('endJoins').textContent=msg.joins;$('endCaps').textContent=msg.captures;
    const button=$('respawnBtn');button.disabled=true;
    $('respawnWait').textContent='REORGANIZANDO CELDAS…';
    setTimeout(()=>{button.disabled=false;$('respawnWait').textContent='';},1750);
    window.dispatchEvent(new Event('quadrift:break'));
  }
}
function isAlive() {return active && endOverlay.hidden && !!statePlayers.get(meId) && connected;}
function handleKeyboard(e,down) {
  const code=e.code;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code)) e.preventDefault();
  if(!isAlive())return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code)) {
    if(down){keyDown.add(code);walkTarget=null;}else keyDown.delete(code);
  }
  if(down && !e.repeat) {
    if(code==='KeyR'||code==='KeyE')send({t:'rot',dir:1});
    else if(code==='KeyQ')send({t:'rot',dir:-1});
    else if(code==='KeyF'||code==='Space'||code==='Enter')send({t:'joinPiece'});
    else if(code==='ShiftLeft'||code==='ShiftRight')sprint();
  }
}
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;handleKeyboard(e,true);});
window.addEventListener('keyup',e=>handleKeyboard(e,false));
window.addEventListener('blur',()=>{keyDown.clear();mobileDir=null;});
canvas.addEventListener('pointerdown',e=>{
  if(!isAlive()||mobile())return;
  const rect=canvas.getBoundingClientRect();walkTarget=toWorld(e.clientX-rect.left,e.clientY-rect.top);
  focused=true;canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(!isAlive()||mobile()||!focused)return;
  const r=canvas.getBoundingClientRect();walkTarget=toWorld(e.clientX-r.left,e.clientY-r.top);
});
canvas.addEventListener('pointerup',()=>focused=false);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
for(const btn of document.querySelectorAll('.pad')) {
  btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);mobileDir=btn.dataset.dir.split(',').map(Number);btn.classList.add('pressed');walkTarget=null;});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(type,()=>{mobileDir=null;btn.classList.remove('pressed');});
}
$('rotateMobile').addEventListener('click',()=>send({t:'rot',dir:1}));
$('joinMobile').addEventListener('click',()=>send({t:'joinPiece'}));
$('sprintMobile').addEventListener('click',sprint);
$('sprintDesktop').addEventListener('click',sprint);
function actionStep(now) {
  if(!isAlive())return;
  if(now-lastPingAt>1500){lastPingAt=now;send({t:'ping',ts:performance.now()});}
  const self=statePlayers.get(meId);
  const interval=self&&now<self.sprintUntil?50:Math.ceil((115+Math.max(0,(self?.rank||1)-1)*14)/50)*50;
  if(now-lastStep<interval)return;
  const p=statePlayers.get(meId);if(!p)return;
  let dx=0,dy=0;
  if(mobileDir){[dx,dy]=mobileDir;}
  else if(keyDown.size) {
    dx=Number(keyDown.has('KeyD')||keyDown.has('ArrowRight'))-Number(keyDown.has('KeyA')||keyDown.has('ArrowLeft'));
    dy=Number(keyDown.has('KeyS')||keyDown.has('ArrowDown'))-Number(keyDown.has('KeyW')||keyDown.has('ArrowUp'));
  } else if(walkTarget) {
    const midX=p.x+Math.floor((p.rank-1)/2),midY=p.y+Math.floor((p.rank-1)/2);
    const vx=walkTarget.x-midX,vy=walkTarget.y-midY;
    if(Math.abs(vx)<1 && Math.abs(vy)<1)walkTarget=null;
    else {
      // Choose the dominant axis for precision and predictable grid snapping.
      if(Math.abs(vx)>Math.abs(vy)*1.7) dx=Math.sign(vx);
      else if(Math.abs(vy)>Math.abs(vx)*1.7) dy=Math.sign(vy);
      else {dx=Math.sign(vx);dy=Math.sign(vy);}
    }
  }
  if((dx||dy) && pendingMoves.length<7){
    lastStep=now;
    const seq=++moveSeq;
    if(send({t:'mv',x:dx,y:dy,seq})){
      const opponents=[...statePlayers.values()].filter(q=>q.id!==meId);
      if(predictor.possible(p.x,p.y,p.cells,dx,dy,stateShards,opponents)){
        p.x+=dx;p.y+=dy;
        // The local player reacts this frame, not on the next server snapshot.
        p.drawX=p.x;p.drawY=p.y;
      }
      pendingMoves.push({seq,dx,dy});
    }
  }
}
function background() {
  const w=viewport.w,h=viewport.h;
  ctx.fillStyle=C.paper;ctx.fillRect(0,0,w,h);
  const startX=Math.max(0,Math.floor(camera.x-w/(2*tile))-1);
  const endX=Math.min(76,Math.ceil(camera.x+w/(2*tile))+2);
  const startY=Math.max(0,Math.floor(camera.y-h/(2*tile))-1);
  const endY=Math.min(56,Math.ceil(camera.y+h/(2*tile))+2);
  const corner=worldToScreen(0,0),edge=worldToScreen(76,56);
  ctx.fillStyle='#e0dacd';
  if(corner.x>0)ctx.fillRect(0,0,corner.x,h);
  if(corner.y>0)ctx.fillRect(0,0,w,corner.y);
  if(edge.x<w)ctx.fillRect(edge.x,0,w-edge.x,h);
  if(edge.y<h)ctx.fillRect(0,edge.y,w,h-edge.y);
  ctx.strokeStyle=C.line;ctx.lineWidth=1;
  ctx.beginPath();
  for(let x=startX;x<=endX;x++){const px=worldToScreen(x,0).x+.5;ctx.moveTo(px,Math.max(0,corner.y));ctx.lineTo(px,Math.min(h,edge.y));}
  for(let y=startY;y<=endY;y++){const py=worldToScreen(0,y).y+.5;ctx.moveTo(Math.max(0,corner.x),py);ctx.lineTo(Math.min(w,edge.x),py);}
  ctx.stroke();
  ctx.strokeStyle='#9c9a8e';ctx.lineWidth=2;ctx.strokeRect(corner.x+.5,corner.y+.5,edge.x-corner.x,edge.y-corner.y);
  ctx.fillStyle='#a0a39d';ctx.font='9px monospace';
  for(let x=Math.ceil(startX/10)*10;x<=endX;x+=10){const p=worldToScreen(x,0);if(p.x>0&&p.x<w)ctx.fillText(String(x).padStart(2,'0'),p.x+4,Math.max(11,corner.y+14));}
}
function rectTile(x,y,color,outline=C.ink,offset=0) {
  const p=worldToScreen(x,y),s=tile;
  if(p.x+s<0||p.y+s<0||p.x>viewport.w||p.y>viewport.h)return;
  ctx.fillStyle=color;ctx.fillRect(p.x+offset,p.y+offset,s-offset*2,s-offset*2);
  ctx.strokeStyle=outline;ctx.lineWidth=1.25;ctx.strokeRect(p.x+offset+.6,p.y+offset+.6,s-offset*2-1.2,s-offset*2-1.2);
}
function previewJoin(p,shard){
  if(!p||p.rank>=9)return null;
  const own=p.cells.map(c=>({x:p.x+c.x,y:p.y+c.y}));
  const candidate=shard.cells.map(c=>({x:shard.x+c.x,y:shard.y+c.y}));
  const occupied=new Set(own.map(c=>c.x+':'+c.y));
  const overlapped=candidate.some(c=>occupied.has(c.x+':'+c.y));
  const touching=candidate.some(c=>own.some(d=>Math.abs(c.x-d.x)+Math.abs(c.y-d.y)===1));
  if(!touching||overlapped)return null;
  const union=own.concat(candidate),minX=Math.min(...union.map(c=>c.x)),minY=Math.min(...union.map(c=>c.y));
  const valid=union.length<=(p.rank+1)**2&&union.every(c=>c.x-minX<p.rank+1&&c.y-minY<p.rank+1&&!rivalCells.has(c.x+':'+c.y));
  return {valid,union,minX,minY,newCells:candidate,shard};
}
function drawShards(p,now) {
  selectedPreview=null;
  const nearby=[];
  for(const shard of stateShards){
    const distance=p?Math.abs(shard.x-p.x)+Math.abs(shard.y-p.y):Infinity;
    const near=distance<Math.max(7,(p?.rank||1)+4);
    const test=near?previewJoin(p,shard):null;
    if(test)nearby.push({test,distance});
    const ttl=Math.max(0,shard.expiresAt-now);
    const alpha=ttl<3600?Math.max(.2,ttl/3600):1;
    ctx.globalAlpha=alpha;
    for(const c of shard.cells){
      const x=shard.x+c.x,y=shard.y+c.y;
      const fill=test?(test.valid?'#dbebd7':'#f0d4c7'):'#fff8e5';
      const stroke=test?(test.valid?'#277a59':'#c55242'):'#867a6d';
      rectTile(x,y,fill,stroke,3);
      const screen=worldToScreen(x,y);
      ctx.fillStyle=test?(test.valid?'#277a59':'#c55242'):'#d1aa62';
      ctx.fillRect(screen.x+tile*.42,screen.y+tile*.42,tile*.16,tile*.16);
    }
    ctx.globalAlpha=1;
  }
  nearby.sort((a,b)=>Number(b.test.valid)-Number(a.test.valid)||a.distance-b.distance);
  selectedPreview=nearby[0]?.test||null;
}
function drawJoinPreview(p){
  const test=selectedPreview;
  if(!test)return;
  const color=test.valid?'#277a59':'#c55242';
  if(test.valid){
    ctx.globalAlpha=.22;
    for(const cell of test.newCells)rectTile(cell.x,cell.y,color,color,2);
    ctx.globalAlpha=1;
    const box=worldToScreen(test.minX,test.minY);
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([6,4]);
    ctx.strokeRect(box.x-3,box.y-3,(p.rank+1)*tile+6,(p.rank+1)*tile+6);
    ctx.setLineDash([]);
  }
  const first=test.shard;
  const at=worldToScreen(first.x+.5,first.y);
  const text=test.valid?'✓ ENCAJA / F':'× NO CABE';
  ctx.font='800 10px monospace';ctx.textAlign='center';
  const width=ctx.measureText(text).width+14;
  ctx.fillStyle=color;ctx.fillRect(at.x-width/2,at.y-22,width,17);
  ctx.fillStyle='#fffdf6';ctx.fillText(text,at.x,at.y-10);ctx.textAlign='left';
}
function drawEnemyIndicators(p){
  if(!p||!lastEnemies.length)return;
  const list=lastEnemies.slice(0,3);
  let drawn=0;
  for(const [id,x,y,rank,solid,name,isBot] of list){
    const marker=worldToScreen(x+rank*.5,y+rank*.5);
    const m=48;
    if(marker.x>m&&marker.x<viewport.w-m&&marker.y>m&&marker.y<viewport.h-m)continue;
    const sx=viewport.w/2,sy=viewport.h/2,vx=marker.x-sx,vy=marker.y-sy;
    if(Math.hypot(vx,vy)<1)continue;
    const factor=Math.min((viewport.w/2-m)/(Math.abs(vx)||1),(viewport.h/2-m)/(Math.abs(vy)||1));
    const xx=sx+factor*vx,yy=sy+factor*vy;
    const threat=solid&&rank>p.rank,color=threat?'#c55242':'#19222a';
    const angle=Math.atan2(vy,vx);
    ctx.save();ctx.translate(xx,yy);ctx.rotate(angle);
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-7,-8);ctx.lineTo(-7,8);ctx.closePath();ctx.fill();ctx.restore();
    const label=rank+'×'+rank+(isBot?' BOT':'');
    ctx.font='800 10px monospace';ctx.textAlign='center';
    const width=ctx.measureText(label).width+14;
    ctx.fillStyle=color;ctx.fillRect(xx-width/2,yy+13+drawn*2,width,17);
    ctx.fillStyle='#fffdf6';ctx.fillText(label,xx,yy+25+drawn*2);ctx.textAlign='left';drawn++;
  }
}
function drawAim(p) {
  if(p.rank>=9)return;
  const target=p.rank+1,point=worldToScreen(p.drawX,p.drawY);
  ctx.strokeStyle='rgba(61,93,214,.6)';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);
  ctx.strokeRect(point.x-2,point.y-2,target*tile+4,target*tile+4);ctx.setLineDash([]);
  const marked=new Set(p.cells.map(c=>c.x+':'+c.y));
  ctx.fillStyle='rgba(61,93,214,.07)';
  for(let y=0;y<target;y++)for(let x=0;x<target;x++)if(!marked.has(x+':'+y)){
    const xy=worldToScreen(p.drawX+x,p.drawY+y);
    ctx.fillRect(xy.x+3,xy.y+3,tile-6,tile-6);
  }
}
function drawPlayer(p,own=false) {
  const solid=p.cells.length===p.rank*p.rank;
  if(own&&!solid)drawAim(p);
  if(solid) {
    const point=worldToScreen(p.drawX,p.drawY),side=tile*p.rank;
    ctx.fillStyle='rgba(25,34,42,.16)';ctx.fillRect(point.x+4,point.y+5,side,side);
    ctx.fillStyle=p.color;ctx.fillRect(point.x+1,point.y+1,side-2,side-2);
    ctx.strokeStyle=C.ink;ctx.lineWidth=2.2;ctx.strokeRect(point.x+1,point.y+1,side-2,side-2);
    ctx.fillStyle='rgba(255,255,255,.28)';ctx.fillRect(point.x+4,point.y+4,side-8,Math.max(3,side*.045));
    ctx.fillStyle='rgba(25,34,42,.68)';ctx.fillRect(point.x+side-6,point.y+6,2,side-12);
    if(p.rank>=2){ctx.fillStyle=own?'#fcfbec':'#faf6df';ctx.font=`900 ${Math.min(42,Math.max(14,side*.34))}px Impact, Arial Black, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(p.rank+'²',point.x+side/2,point.y+side/2+1);ctx.textAlign='left';ctx.textBaseline='alphabetic';}
  } else {
    for(const c of p.cells)rectTile(p.drawX+c.x,p.drawY+c.y,p.color,C.ink,1);
    // Corner marks show an unfinished, potentially rotating silhouette.
    for(const c of p.cells){const pt=worldToScreen(p.drawX+c.x,p.drawY+c.y);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fillRect(pt.x+5,pt.y+5,5,5);}
  }
  let centroidX=0,centroidY=0;
  for(const c of p.cells){centroidX+=c.x;centroidY+=c.y;}
  centroidX/=p.cells.length;centroidY/=p.cells.length;
  const tag=worldToScreen(p.drawX+centroidX+.5,p.drawY+centroidY);
  ctx.textAlign='center';ctx.textBaseline='bottom';ctx.font=`${own?'900':'800'} 11px Consolas,monospace`;
  const text=p.name.replace(' ·BOT','').slice(0,13)+(p.isBot?' [BOT]':'');
  const textWidth=ctx.measureText(text).width;
  const ypos=tag.y-Math.max(17,p.rank>=3?25:17);
  ctx.fillStyle=own?C.ink:'rgba(25,34,42,.82)';ctx.fillRect(tag.x-textWidth/2-5,ypos-13,textWidth+10,15);
  ctx.fillStyle=own?'#fff2c2':'#fdf8ec';ctx.fillText(text,tag.x,ypos-2);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function demo() {
  const x=Math.floor(camera.x)-5,y=Math.floor(camera.y)-3;
  const cells=[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:2},{x:1,y:2}];
  drawPlayer({drawX:x,drawY:y,rank:2,cells,color:C.blue,name:'UNA CELDA MÁS',isBot:false},false);
  for(let i=0;i<14;i++){const a=i*2.399,x2=Math.round(camera.x+Math.cos(a)*(5+i*.6)),y2=Math.round(camera.y+Math.sin(a)*(3+i*.35));
    rectTile(x2,y2,'#fff8e5','#a7a196',5);}
}
function frame(now) {
  requestAnimationFrame(frame);
  if(!viewport.w||!viewport.h)return;
  actionStep(now);
  if(now-lastHUD>220){lastHUD=now;const self=statePlayers.get(meId);if(self&&active)updateSprintButton(self);}
  const p=statePlayers.get(meId);
  if(p){
    const targetX=p.x+Math.max(1,p.rank)/2,targetY=p.y+Math.max(1,p.rank)/2;
    camera.x+=clamp(targetX-camera.x,-5,5)*.13;
    camera.y+=clamp(targetY-camera.y,-5,5)*.13;
  } else if(!active){camera.x=38+Math.sin(now*.00012)*3;camera.y=28+Math.cos(now*.00009)*3;}
  for(const q of statePlayers.values()) {
    const factor=q.id===meId?.65:.28;
    q.drawX+=(q.x-q.drawX)*factor;
    q.drawY+=(q.y-q.drawY)*factor;
  }
  ctx.setTransform(viewport.dpr,0,0,viewport.dpr,0,0);
  background();
  if(lastState){
    drawShards(p,now);
    if(p)drawJoinPreview(p);
    for(const q of statePlayers.values())if(q.id!==meId)drawPlayer(q);
    if(p){drawPlayer(p,true);drawEnemyIndicators(p);}
  } else demo();
  for(const spark of effects){
    spark.age+=.025;spark.x+=spark.vx*.02;spark.y+=spark.vy*.02;
    const px=worldToScreen(spark.x,spark.y);ctx.globalAlpha=Math.max(0,1-spark.age);
    ctx.fillStyle=spark.color;ctx.fillRect(px.x,px.y,6,6);
  }
  ctx.globalAlpha=1;
  effects=effects.filter(s=>s.age<1);
  if(walkTarget && p && isAlive()) {
    const aim=worldToScreen(walkTarget.x+.5,walkTarget.y+.5);
    ctx.strokeStyle=C.red;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(aim.x-10,aim.y);ctx.lineTo(aim.x+10,aim.y);ctx.moveTo(aim.x,aim.y-10);ctx.lineTo(aim.x,aim.y+10);ctx.stroke();
  }
}
requestAnimationFrame(frame);
})();
