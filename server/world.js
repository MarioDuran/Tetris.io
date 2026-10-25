'use strict';

const CONFIG = Object.freeze({
  width:76, height:56, targetShards:72, minShards:55, maxShards:95,
  shardLifeMin:14500, shardLifeMax:27500, maxRank:9,
  sprintDuration:1650, sprintCooldown:11500
});
const COLORS=['#4D6DDA','#ED684D','#E5B34A','#42A69A','#8C6FD5','#D47895','#6EAA54','#466A84','#CF8D4C'];
const BOT_NAMES=['Nori','Pixel','Banda','Corte','Milo','Tiza','Trama','Faro','Duna','Menta','Goma','Chispa','Rombo','Tecla','Lado','Mosaico','Atlas','Vela','Maki','Topo','Nexo','Rulo','Pipa','Delta'];
const four=[[1,0],[0,1],[-1,0],[0,-1]];
const dirs=[...four,[1,1],[1,-1],[-1,1],[-1,-1]];
const key=(x,y)=>`${x}:${y}`;
const randomInt=(n,rng=Math.random)=>Math.floor(rng()*n);
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const contiguous=(a,b)=>dist(a,b)===1;
const complete=p=>isSquare(p.cells,p.rank);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function normalizeCells(cells) {
  const minX=Math.min(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y));
  return {cells:cells.map(c=>({x:c.x-minX,y:c.y-minY})),dx:minX,dy:minY};
}
function isSquare(cells,size) {
  if(cells.length!==size*size)return false;
  const norm=normalizeCells(cells);
  return new Set(cells.map(c=>key(c.x,c.y))).size===cells.length && norm.cells.every(c=>c.x<size&&c.y<size);
}
function canFit(cells,goal) {
  if(cells.length>goal*goal||new Set(cells.map(c=>key(c.x,c.y))).size!==cells.length)return false;
  const norm=normalizeCells(cells);
  return norm.cells.every(c=>c.x<goal&&c.y<goal);
}
function rotateCells(cells,turns=1) {
  let result=cells.map(c=>({...c}));
  for(let i=0;i<((turns%4)+4)%4;i++)result=result.map(c=>({x:-c.y,y:c.x}));
  return normalizeCells(result).cells;
}
function absolute(player,dx=0,dy=0,shape=player.cells) {
  return shape.map(c=>({x:player.x+c.x+dx,y:player.y+c.y+dy}));
}
function inBounds(cells) {
  return cells.every(c=>c.x>=1&&c.y>=1&&c.x<CONFIG.width-1&&c.y<CONFIG.height-1);
}
function joinedCells(player,shard) {
  const old=absolute(player),added=shard.cells.map(c=>({x:shard.x+c.x,y:shard.y+c.y}));
  const occupied=new Set(old.map(c=>key(c.x,c.y)));
  if(added.some(c=>occupied.has(key(c.x,c.y))))return null;
  if(!added.some(c=>old.some(d=>contiguous(c,d))))return null;
  const united=[...old,...added];
  if(!canFit(united,player.rank+1))return null;
  return {united,...normalizeCells(united)};
}
function cellCentroid(cells) {
  return {x:cells.reduce((n,c)=>n+c.x,0)/cells.length,
    y:cells.reduce((n,c)=>n+c.y,0)/cells.length};
}
function growthSpeed(p,time) {
  return time<p.sprintUntil ? 50 : 115+Math.max(0,p.rank-1)*14;
}

// Gain cells in the current bounding square, filling holes before extending the
// ring. Enforce adjacency and all collision constraints at every insertion.
function addMass(player,amount,world=null) {
  let gained=0,upgraded=0;
  while(amount>0&&player.rank<CONFIG.maxRank) {
    const goal=player.rank+1,existing=new Set(player.cells.map(c=>key(c.x,c.y)));
    const candidates=[];
    for(let y=0;y<goal;y++)for(let x=0;x<goal;x++)if(!existing.has(key(x,y))){
      candidates.push({x,y,inner:x<player.rank&&y<player.rank});
    }
    // Prefer missing interior cells, then neighboring cells closest to the core.
    candidates.sort((a,b)=>Number(b.inner)-Number(a.inner)||(a.x+a.y)-(b.x+b.y));
    let placed=false;
    for(const c of candidates) {
      if(!player.cells.some(old=>contiguous(old,c)))continue;
      const at=[{x:player.x+c.x,y:player.y+c.y}];
      if(!inBounds(at))continue;
      if(world&&(world.blockedByPlayer(at,player.id)||world.blockedByShard(at)))continue;
      player.cells.push({x:c.x,y:c.y});amount--;gained++;placed=true;
      if(world)world.invalidate();
      break;
    }
    if(!placed)break;
    if(isSquare(player.cells,goal)){
      player.rank=goal;upgraded++;
    }
  }
  return {gained,upgraded};
}
class World {
  constructor(opts={}) {
    this.random=opts.random||Math.random;
    this.players=new Map();this.shards=new Map();this.events=[];
    this.time=0;this.nextId=1;this.spawnTimer=0;this._spatial=null;
    this.spawnInitial(opts.initialShards??CONFIG.targetShards);
  }
  invalidate(){this._spatial=null;}
  spatial() {
    if(this._spatial)return this._spatial;
    const players=new Map(),shards=new Map();
    for(const p of this.players.values())if(p.alive)for(const c of absolute(p))players.set(key(c.x,c.y),p.id);
    for(const s of this.shards.values())for(const c of s.cells)shards.set(key(s.x+c.x,s.y+c.y),s.id);
    return this._spatial={players,shards};
  }
  blockedByPlayer(cells,ignoreId) {
    const index=this.spatial().players;
    return cells.some(c=>{const id=index.get(key(c.x,c.y));return id!==undefined&&id!==ignoreId;});
  }
  blockedByShard(cells,ignoreId=null) {
    const index=this.spatial().shards;
    return cells.some(c=>{const id=index.get(key(c.x,c.y));return id!==undefined&&id!==ignoreId;});
  }
  randomPoint(margin=3) {
    return {x:margin+randomInt(CONFIG.width-2*margin,this.random),y:margin+randomInt(CONFIG.height-2*margin,this.random)};
  }
  newShard() {
    const shapes=[
      [{x:0,y:0}], [{x:0,y:0}], [{x:0,y:0}], [{x:0,y:0}],
      [{x:0,y:0},{x:1,y:0}], [{x:0,y:0},{x:0,y:1}],
      [{x:0,y:0},{x:1,y:0},{x:1,y:1}], [{x:0,y:0},{x:1,y:0},{x:2,y:0}],
      [{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:1,y:1}], // T
      [{x:0,y:0},{x:0,y:1},{x:0,y:2},{x:1,y:2}], // L
      [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:2,y:1}]  // Z
    ];
    for(let i=0;i<80;i++) {
      const cells=shapes[randomInt(shapes.length,this.random)].map(c=>({...c}));
      let spot;
      const nearby=[...this.players.values()].filter(p=>p.alive);
      if(nearby.length&&this.random()<.47){
        const p=nearby[randomInt(nearby.length,this.random)];
        const angle=this.random()*Math.PI*2,rad=6+this.random()*12;
        spot={x:Math.round(p.x+Math.cos(angle)*rad),y:Math.round(p.y+Math.sin(angle)*rad)};
      } else spot=this.randomPoint();
      const abs=cells.map(c=>({x:spot.x+c.x,y:spot.y+c.y}));
      if(!inBounds(abs)||this.blockedByPlayer(abs)||this.blockedByShard(abs))continue;
      // A short lifetime and a visible countdown keep the arena changing.
      const life=CONFIG.shardLifeMin+Math.round(this.random()*(CONFIG.shardLifeMax-CONFIG.shardLifeMin));
      const s={id:this.nextId++,x:spot.x,y:spot.y,cells,expiresAt:this.time+life};
      this.shards.set(s.id,s);this.invalidate();return s;
    }
    return null;
  }
  spawnInitial(n){for(let i=0;i<n;i++)this.newShard();}
  addPlayer(name='Jugador',bot=false){
    let spot=null;
    for(let i=0;i<230;i++){
      const p=this.randomPoint();
      if(this.blockedByPlayer([p])||this.blockedByShard([p]))continue;
      if([...this.players.values()].some(q=>q.alive&&dist(q,p)<7))continue;
      spot=p;break;
    }
    if(!spot){spot=this.randomPoint();for(let i=0;i<100&&!(!this.blockedByPlayer([spot])&&!this.blockedByShard([spot]));i++)spot=this.randomPoint();}
    const id=this.nextId++;
    const clean=String(name).trim().replace(/[\x00-\x1f<>]/g,'').slice(0,16)||'Jugador';
    const p={id,name:clean,bot,x:spot.x,y:spot.y,cells:[{x:0,y:0}],rank:1,
      color:COLORS[(id+randomInt(COLORS.length,this.random))%COLORS.length],
      alive:true,joined:0,captures:0,best:1,born:this.time,cooldown:0,
      nextMoveAt:0,sprintUntil:0,sprintReadyAt:0,noticeAt:0,
      brain:bot?{
        style:randomInt(4,this.random),reaction:140+randomInt(85,this.random),
        next:0,target:null,plan:null,lastPos:[],stuck:0,rotateAt:0,
        drift:dirs[randomInt(dirs.length,this.random)],driftUntil:0,
        patience:.77+this.random()*.2
      }:null};
    this.players.set(id,p);this.invalidate();return p;
  }
  removePlayer(id){this.players.delete(id);this.invalidate();}
  note(p,code,extra={}){if(!p.bot)this.events.push({id:p.id,type:code,...extra});}
  tryJoin(p,id=null) {
    if(!p?.alive||p.rank>=CONFIG.maxRank)return false;
    const matches=[];
    for(const shard of this.shards.values()){
      if(id!==null&&id!==shard.id)continue;
      if(Math.abs(shard.x-p.x)>p.rank+5||Math.abs(shard.y-p.y)>p.rank+5)continue;
      const joint=joinedCells(p,shard);
      if(joint)matches.push({shard,joint});
    }
    if(!matches.length)return false;
    matches.sort((a,b)=>b.shard.cells.length-a.shard.cells.length||a.shard.id-b.shard.id);
    for(const {shard,joint} of matches){
      const candidate={...p,x:joint.dx,y:joint.dy,cells:joint.cells};
      if(!inBounds(absolute(candidate))||this.blockedByPlayer(absolute(candidate),p.id))continue;
      p.x=joint.dx;p.y=joint.dy;p.cells=joint.cells;
      this.shards.delete(shard.id);this.invalidate();p.joined++;
      const target=p.rank+1;
      if(isSquare(p.cells,target)){
        p.rank=target;p.best=Math.max(p.best,target);
        this.note(p,'level',{rank:target});
      } else this.note(p,'join',{cells:shard.cells.length});
      return true;
    }
    return false;
  }
  tryRotate(p,dir=1) {
    if(!p?.alive)return false;
    const shape=rotateCells(p.cells,dir===-1?3:dir);
    const oldCenter=cellCentroid(absolute(p)),newCenter=cellCentroid(shape);
    const preferredX=oldCenter.x-newCenter.x,preferredY=oldCenter.y-newCenter.y;
    const guesses=[];
    for(let x=Math.floor(preferredX)-1;x<=Math.ceil(preferredX)+1;x++)for(let y=Math.floor(preferredY)-1;y<=Math.ceil(preferredY)+1;y++){
      guesses.push({x,y,score:(x-preferredX)**2+(y-preferredY)**2});
    }
    guesses.sort((a,b)=>a.score-b.score);
    for(const {x,y} of guesses){
      const candidate={...p,x,y,cells:shape},abs=absolute(candidate);
      if(!inBounds(abs)||this.blockedByPlayer(abs,p.id)||this.blockedByShard(abs))continue;
      p.cells=shape;p.x=x;p.y=y;this.invalidate();return true;
    }
    return false;
  }
  findOverlapping(cells,ignoreId) {
    const spatial=this.spatial().players,ids=new Set();
    for(const c of cells){const id=spatial.get(key(c.x,c.y));if(id!==undefined&&id!==ignoreId)ids.add(id);}
    return [...ids].map(id=>this.players.get(id)).filter(p=>p?.alive);
  }
  respawn(p){
    let spot=this.randomPoint();
    for(let i=0;i<200;i++){
      const point=this.randomPoint();
      if(!this.blockedByPlayer([point],p.id)&&!this.blockedByShard([point])){spot=point;break;}
    }
    p.x=spot.x;p.y=spot.y;p.cells=[{x:0,y:0}];p.rank=1;p.alive=true;
    p.joined=0;p.captures=0;p.born=this.time;p.cooldown=0;
    p.sprintUntil=0;p.sprintReadyAt=this.time+1200;p.nextMoveAt=0;
    if(p.bot&&p.brain){p.brain.target=null;p.brain.plan=null;p.brain.stuck=0;}
    this.invalidate();
  }
  kill(p,by=null){
    if(!p.alive)return;
    p.alive=false;p.cooldown=this.time+1700;this.invalidate();
    this.note(p,'dead',{by:by?.name||null,best:p.best,joins:p.joined,captures:p.captures});
  }
  capture(attacker,victim){
    if(!victim.alive)return;
    const cells=victim.cells.length;
    attacker.captures++;
    this.kill(victim,attacker);
    const result=addMass(attacker,cells,this);
    attacker.best=Math.max(attacker.best,attacker.rank);
    this.note(attacker,'capture',{name:victim.name,rank:attacker.rank,cells:result.gained});
    if(result.upgraded)this.note(attacker,'level',{rank:attacker.rank});
  }
  trySprint(p){
    if(!p?.alive)return false;
    if(p.rank<2||!complete(p)||this.time<p.sprintReadyAt){
      if(this.time>=p.noticeAt){
        this.note(p,'no-sprint',{reason:p.rank<2||!complete(p)?'CIERRA UN CUADRADO 2×2 PARA ACELERAR':'SPRINT RECARGÁNDOSE'});
        p.noticeAt=this.time+900;
      }
      return false;
    }
    const previous=p.rank,next=previous-1;
    p.cells=[];
    for(let y=0;y<next;y++)for(let x=0;x<next;x++)p.cells.push({x,y});
    p.rank=next;p.sprintUntil=this.time+CONFIG.sprintDuration;
    p.sprintReadyAt=this.time+CONFIG.sprintCooldown;p.nextMoveAt=this.time;
    this.invalidate();
    this.note(p,'sprint',{lost:previous*previous-next*next,rank:next,duration:CONFIG.sprintDuration});
    return true;
  }
  // Assess a possible step without changing any state. Helps tactical AI and pathfinding.
  stepStatus(p,dx,dy) {
    const at=absolute(p,dx,dy);
    if(!inBounds(at))return 'wall';
    const idx=this.spatial();
    const shards=new Set(),rivals=new Set();
    for(const c of at){
      const atKey=key(c.x,c.y),sid=idx.shards.get(atKey),pid=idx.players.get(atKey);
      if(sid!==undefined)shards.add(sid);
      if(pid!==undefined&&pid!==p.id)rivals.add(pid);
    }
    if(shards.size) {
      if(shards.size===1&&joinedCells(p,this.shards.get([...shards][0])))return 'join';
      return 'shard';
    }
    if(rivals.size) {
      for(const id of rivals) {
        const q=this.players.get(id);
        if(!complete(p)||p.rank<=q.rank)return 'enemy';
      }
      return 'capture';
    }
    return 'free';
  }
  move(p,dx,dy){
    if(!p?.alive||!Number.isInteger(dx)||!Number.isInteger(dy)||(!dx&&!dy)||Math.abs(dx)>1||Math.abs(dy)>1)return false;
    if(this.time<p.nextMoveAt)return false;
    const status=this.stepStatus(p,dx,dy);
    if(status==='join'){
      const target=absolute(p,dx,dy),set=new Set(target.map(c=>key(c.x,c.y)));
      for(const shard of this.shards.values())if(shard.cells.some(c=>set.has(key(shard.x+c.x,shard.y+c.y)))){
        if(this.tryJoin(p,shard.id)){p.nextMoveAt=this.time+growthSpeed(p,this.time);return true;}
      }
    }
    if(status==='free'||status==='capture'){
      const rivals=status==='capture'?this.findOverlapping(absolute(p,dx,dy),p.id):[];
      p.x+=dx;p.y+=dy;this.invalidate();
      for(const q of rivals)this.capture(p,q);
      p.nextMoveAt=this.time+growthSpeed(p,this.time);
      return true;
    }
    if(status==='enemy'){
      const enemy=this.findOverlapping(absolute(p,dx,dy),p.id).find(q=>complete(q)&&q.rank>p.rank);
      if(enemy)this.capture(enemy,p);
      return false;
    }
    if(Math.abs(dx)+Math.abs(dy)===2){
      // Diagonal sliding: do not get stuck on a fragment occupying one axis.
      for(const [x,y] of [[dx,0],[0,dy]]){
        const partial=this.stepStatus(p,x,y);
        if(partial==='free'||partial==='capture'||partial==='join')return this.move(p,x,y);
      }
    }
    if(status==='shard'&&this.time>=p.noticeAt){
      p.noticeAt=this.time+1100;this.note(p,'blocked',{reason:'ESTA PIEZA NO ENCAJA · RODÉALA O GIRA'});
    }
    return false;
  }
  dangerNear(p,radius=10){
    return [...this.players.values()].filter(q=>q.alive&&q.id!==p.id&&q.rank>p.rank&&complete(q)&&dist(p,q)<radius)
      .sort((a,b)=>dist(p,a)-dist(p,b))[0]||null;
  }
  // Path search with shape-sized collisions, bounded to keep multiplayer simulation cheap.
  pathStep(p,tx,ty,budget=440){
    if(tx===p.x&&ty===p.y)return [0,0];
    const root={x:p.x,y:p.y,first:null};
    const queue=[root],seen=new Set([key(p.x,p.y)]);
    let head=0,closest=root,closestScore=dist(root,{x:tx,y:ty});
    while(head<queue.length&&head<budget){
      const node=queue[head++];
      for(const [dx,dy] of dirs){
        const x=node.x+dx,y=node.y+dy,k=key(x,y);
        if(seen.has(k))continue;
        seen.add(k);
        const abs=absolute({x,y,cells:p.cells});
        if(!inBounds(abs)||this.blockedByShard(abs)||this.blockedByPlayer(abs,p.id))continue;
        const next={x,y,first:node.first||[dx,dy]};
        const score=dist(next,{x:tx,y:ty});
        if(score<closestScore){closest=next;closestScore=score;}
        if(x===tx&&y===ty)return next.first;
        queue.push(next);
      }
    }
    return closest.first;
  }
  // Find positions where collecting a shard is geometrically legal. Includes rotation options.
  shardPlan(p){
    const goal=p.rank+1,ordered=[...this.shards.values()].filter(s=>s.cells.length+p.cells.length<=goal*goal)
      .map(s=>({s,d:dist(p,s)})).filter(v=>v.d<24)
      .sort((a,b)=>a.d-b.d).slice(0,19);
    let best=null;
    for(const {s,d} of ordered){
      const variations=p.cells.length>24?[0]:[0,1,3,2];
      for(const turns of variations){
        const shape=turns?rotateCells(p.cells,turns):p.cells;
        const seen=new Set();
        for(const c of s.cells)for(const dcell of shape)for(const [ax,ay] of four){
          const x=s.x+c.x+ax-dcell.x,y=s.y+c.y+ay-dcell.y,k=key(x,y);
          if(seen.has(k))continue;seen.add(k);
          const trial={...p,x,y,cells:shape};
          if(!joinedCells(trial,s))continue;
          const at=absolute(trial);
          if(!inBounds(at)||this.blockedByPlayer(at,p.id)||this.blockedByShard(at,s.id))continue;
          const distance=dist(p,{x,y});
          const danger=this.dangerNear(trial,6);
          const penalty=danger?12:0;
          const score=distance + (turns?3:0) - s.cells.length*1.4+penalty+
            (p.brain.style===2?this.random()*4:this.random()*1.5);
          if(!best||score<best.score)best={kind:'shard',id:s.id,x,y,turns,score};
        }
      }
    }
    return best;
  }
  botAction(p){
    if(!p.alive)return;
    const b=p.brain;
    if(this.time<b.next)return;
    b.next=this.time+(this.time<p.sprintUntil?75:b.reaction)+(this.random()-.5)*65;
    const hazard=this.dangerNear(p,11);
    if(hazard){
      b.plan=null;
      if(complete(p)&&p.rank>=2&&dist(p,hazard)<6&&this.time>=p.sprintReadyAt&&this.random()<.4) {
        this.trySprint(p);
      }
      const steps=dirs.map(([dx,dy])=>{
        const s=this.stepStatus(p,dx,dy);
        if(!['free','join','capture'].includes(s))return null;
        const away=dist({x:p.x+dx,y:p.y+dy},hazard);
        return {dx,dy,score:away+(this.random()-.5)*1.2+(s==='join'?1:0)};
      }).filter(Boolean).sort((a,b)=>b.score-a.score);
      if(steps.length){this.move(p,steps[0].dx,steps[0].dy);return;}
    }
    if(this.tryJoin(p)){b.stuck=0;b.plan=null;return;}
    const enemies=[...this.players.values()].filter(q=>q.alive&&q.id!==p.id&&q.rank<p.rank);
    const prey=complete(p)?enemies.sort((a,b)=>dist(a,p)-dist(b,p))[0]:null;
    if(prey&&dist(prey,p)<(b.style===1?20:12)&&b.style!==3){
      b.plan=null;
      const choices=dirs.map(([dx,dy])=>{
        const status=this.stepStatus(p,dx,dy);
        if(!['free','capture','join'].includes(status))return null;
        const score=dist({x:p.x+dx,y:p.y+dy},prey)-(status==='capture'?15:0)+this.random()*.75;
        return {dx,dy,score};
      }).filter(Boolean).sort((a,b)=>a.score-b.score);
      if(choices.length&&this.move(p,choices[0].dx,choices[0].dy))return;
    }
    if(!b.plan||this.time>b.plan.until||!this.shards.has(b.plan.id)||b.stuck>=4){
      b.plan=this.shardPlan(p);
      if(b.plan)b.plan.until=this.time+1200+this.random()*900;
      b.stuck=0;
    }
    if(b.plan){
      if(b.plan.turns){
        // Rotate deliberately, not at random, before attempting a path.
        if(this.time>b.rotateAt&&this.tryRotate(p,b.plan.turns)){
          b.plan=null;b.rotateAt=this.time+900;return;
        }
      }
      const plan=b.plan;
      const step=this.pathStep(p,plan.x,plan.y);
      if(step&&step[0]===0&&step[1]===0){
        if(this.tryJoin(p,plan.id)){b.plan=null;b.stuck=0;return;}
        b.plan=null;
      } else if(step){
        const success=this.move(p,...step);
        if(success){b.stuck=0;return;}
        b.stuck++;
      }else{b.plan=null;b.stuck++;}
    }
    // Exploratory behavior, memory of repeated positions and short hesitations.
    if(this.time>b.driftUntil||b.stuck>3){
      b.driftUntil=this.time+950+this.random()*1500;
      b.drift=dirs[randomInt(dirs.length,this.random)];b.stuck=0;
    }
    const attempts=[b.drift,...dirs].filter(([x,y],i)=>i===0||this.random()<.75);
    for(const [dx,dy] of attempts){if(this.move(p,dx,dy))return;}
  }
  tick(dt=50){
    this.time+=dt;
    // Expire fragments each simulation step; respawn only on the scheduled wave.
    for(const [id,s] of this.shards)if(s.expiresAt<=this.time){this.shards.delete(id);this.invalidate();}
    if(this.time>=this.spawnTimer){
      this.spawnTimer=this.time+520;
      const alive=[...this.players.values()].filter(p=>p.alive).length;
      const target=clamp(CONFIG.targetShards+Math.floor((alive-8)*1.2),CONFIG.minShards,CONFIG.maxShards);
      for(let i=0;i<Math.min(3,target-this.shards.size);i++)this.newShard();
    }
    for(const p of this.players.values())if(p.bot&&!p.alive&&this.time>=p.cooldown)this.respawn(p);
    for(const p of this.players.values())if(p.bot)this.botAction(p);
  }
  populate(target=12){
    const humans=[...this.players.values()].filter(p=>!p.bot).length;
    const bots=[...this.players.values()].filter(p=>p.bot);
    const desired=Math.max(0,target-humans);
    if(bots.length<desired)this.addPlayer(BOT_NAMES[randomInt(BOT_NAMES.length,this.random)]+' ·BOT',true);
    else if(bots.length>desired){
      const selected=bots.sort((a,b)=>a.rank-b.rank)[0];if(selected)this.removePlayer(selected.id);
    }
  }
  snapshot(player){
    const view=player?.alive?player:{x:CONFIG.width/2,y:CONFIG.height/2};
    const inView=(x,y)=>Math.abs(x-view.x)<26&&Math.abs(y-view.y)<20;
    const players=[...this.players.values()].filter(p=>p.alive&&(p.id===player?.id||inView(p.x,p.y)))
      .map(p=>[p.id,p.x,p.y,p.rank,p.color,p.name,p.bot?1:0,p.cells.flatMap(c=>[c.x,c.y]),p.captures,p.joined,
        Math.max(0,p.sprintUntil-this.time),Math.max(0,p.sprintReadyAt-this.time)]);
    const shards=[...this.shards.values()].filter(s=>inView(s.x,s.y))
      .map(s=>[s.id,s.x,s.y,s.cells.flatMap(c=>[c.x,c.y]),Math.max(0,s.expiresAt-this.time)]);
    const ranking=[...this.players.values()].filter(p=>p.alive)
      .sort((a,b)=>b.rank-a.rank||b.cells.length-a.cells.length||b.captures-a.captures).slice(0,8)
      .map(p=>[p.id,p.name,p.rank,p.bot?1:0,p.cells.length]);
    const enemies=[...this.players.values()].filter(p=>p.alive&&p.id!==player?.id)
      .sort((a,b)=>dist(view,a)-dist(view,b)).slice(0,6)
      .map(p=>[p.id,p.x,p.y,p.rank,complete(p)?1:0,p.name,p.bot?1:0]);
    const humans=[...this.players.values()].filter(p=>!p.bot).length,bots=[...this.players.values()].filter(p=>p.bot).length;
    return {t:'state',time:this.time,me:player?.id||null,players,shards,ranking,enemies,humans,bots,world:[CONFIG.width,CONFIG.height]};
  }
}
module.exports={World,CONFIG,COLORS,isSquare,canFit,rotateCells,joinedCells,addMass,absolute,inBounds,growthSpeed};
