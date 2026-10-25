'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {World,CONFIG}=require('./world');
const {upgrade}=require('./net');

const PORT=Number(process.env.PORT)||10000;
const MIN_POPULATION=process.env.MIN_POPULATION === undefined ? 16 : Math.max(0,Math.min(26,Number(process.env.MIN_POPULATION)||0));
const MAX_HUMANS=Math.max(1,Math.min(80,Number(process.env.MAX_HUMANS)||40));
const world=new World();
const peers=new Set();
const DIRS=new Set(['-1,0','1,0','0,-1','0,1','-1,-1','-1,1','1,-1','1,1']);
const PUBLIC=path.resolve(__dirname,'../public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
function sendFile(req,res) {
  let file;
  try{file=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400);res.end();return;}
  if(file==='/') file='/index.html';
  if(!['/index.html','/styles.css','/client.js','/favicon.svg','/privacy.html','/ads.js','/robots.txt'].includes(file)) {
    res.writeHead(404,{'Content-Type':'text/plain'});res.end('404');return;
  }
  const name=path.resolve(PUBLIC,'.'+file);
  fs.stat(name,(err,stat)=>{
    if(err || !stat.isFile()){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{
      'Content-Type':mime[path.extname(name)]||'application/octet-stream',
      'Content-Length':stat.size,
      'Cache-Control':['/index.html','/client.js','/styles.css','/ads.js'].includes(file)?'no-store':'public, max-age=300',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net; connect-src 'self' ws: wss: https://*.google.com https://*.googleads.g.doubleclick.net; img-src 'self' data: https:; frame-src https:; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    });
    if(req.method==='HEAD')res.end();else fs.createReadStream(name).pipe(res);
  });
}
const server=http.createServer((req,res)=>{
  if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  if(req.url==='/health') {
    const humans=[...world.players.values()].filter(p=>!p.bot).length;
    const bots=[...world.players.values()].filter(p=>p.bot).length;
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,name:'QUADRIFT',version:'0.2.0',humans,bots,shards:world.shards.size,uptime:Math.round(process.uptime())}));return;
  }
  if(req.url==='/ads.txt') {
    const client=String(process.env.ADSENSE_CLIENT||'').trim();
    if(!/^ca-pub-\d{12,22}$/.test(client)){res.writeHead(404);res.end('Ads not configured');return;}
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'});
    res.end('google.com, '+client.replace('ca-','')+', DIRECT, f08c47fec0942fa0\n');return;
  }
  if(req.url==='/config.js') {
    const adsClient=(process.env.ADSENSE_CLIENT||'').trim();
    const adsSlot=(process.env.ADSENSE_SLOT||'').trim();
    const safe=/^ca-pub-\d{12,22}$/.test(adsClient)?adsClient:'';
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    res.end(`window.QUADRIFT_CONFIG=${JSON.stringify({adsClient:safe,adsSlot:/^\d{8,20}$/.test(adsSlot)?adsSlot:''})};`);return;
  }
  sendFile(req,res);
});
server.on('upgrade',(req,socket,head)=>upgrade(req,socket,head,(peer)=>{
  const clients=[...peers].filter(c=>c.player);
  if(clients.length>=MAX_HUMANS){peer.send({t:'error',message:'La arena está llena. Intenta de nuevo.'});setTimeout(()=>peer.close(),100);return;}
  peer.player=null;peer.inputs=0;peer.window=Date.now();peer.lastMove=0;peer.lastRotation=0;peer.lastJoin=0;peer.lastSprint=0;
  peers.add(peer);
  peer.send({t:'hello',name:'QUADRIFT',version:2,world:[CONFIG.width,CONFIG.height]});
  peer.onMessage=raw=>{
    if(raw.length>320)return;
    const now=Date.now();
    if(now-peer.window>1000){peer.window=now;peer.inputs=0;}
    if(++peer.inputs>38)return;
    let message;
    try{message=JSON.parse(raw);}catch{return;}
    if(typeof message!=='object'||message===null)return;
    if(message.t==='join' && !peer.player) {
      if(typeof message.name!=='string')return;
      peer.player=world.addPlayer(message.name||'SIN NOMBRE',false);
      peer.send({t:'welcome',id:peer.player.id});
      return;
    }
    const p=peer.player;
    if(!p)return;
    if(message.t==='mv' && p.alive && now-peer.lastMove>=42) {
      const dx=message.x,dy=message.y;
      if(DIRS.has(`${dx},${dy}`)) {peer.lastMove=now;world.move(p,dx,dy);}
    } else if(message.t==='rot' && p.alive && now-peer.lastRotation>=190) {
      if(message.dir===1||message.dir===-1){peer.lastRotation=now;world.tryRotate(p,message.dir);}
    } else if(message.t==='joinPiece' && p.alive && now-peer.lastJoin>=180) {
      peer.lastJoin=now;
      if(!world.tryJoin(p)) world.note(p,'no-fit');
    } else if(message.t==='sprint' && p.alive && now-peer.lastSprint>=400) {
      peer.lastSprint=now;world.trySprint(p);
    } else if(message.t==='respawn' && !p.alive && world.time>=p.cooldown) {
      world.respawn(p);peer.send({t:'respawned'});
    }
  };
  peer.onClose=()=>{peers.delete(peer);if(peer.player)world.removePlayer(peer.player.id);};
}));
// 20Hz authoritative world, 8Hz interest-filtered snapshots.
const sim=setInterval(()=>world.tick(50),50);
const population=setInterval(()=>world.populate(MIN_POPULATION),1700);
const updates=setInterval(()=>{
  for(const event of world.events){for(const peer of peers) if(peer.player?.id===event.id) peer.send({t:'event',...event});}
  world.events=[];
  for(const peer of peers) if(peer.player)peer.send(world.snapshot(peer.player));
},125);
const heartbeat=setInterval(()=>{
  for(const peer of peers){
    if(Date.now()-peer.lastPong>75_000)peer.close();else peer.ping();
  }
},22_000);
server.listen(PORT,'0.0.0.0',()=>console.log(`QUADRIFT on :${PORT}`));
function stop(){clearInterval(sim);clearInterval(population);clearInterval(updates);clearInterval(heartbeat);
 for(const peer of [...peers]) peer.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),4000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
