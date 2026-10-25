'use strict';

const CONFIG = Object.freeze({ width: 76, height: 56, targetShards: 240, maxRank: 9 });
const COLORS = ['#4D6DDA', '#ED684D', '#E5B34A', '#42A69A', '#8C6FD5', '#D47895', '#6EAA54', '#466A84', '#CF8D4C'];
const BOT_NAMES = ['Nori','Pixel','Banda','Corte','Milo','Tiza','Trama','Faro','Duna','Menta','Goma','Chispa','Rombo','Tecla','Lado','Mosaico','Atlas','Vela','Maki','Topo','Nexo','Rulo','Pipa','Delta'];
const key = (x, y) => `${x}:${y}`;
const rngInt = (hi, rng = Math.random) => Math.floor(rng() * hi);
const four = [[1,0],[0,1],[-1,0],[0,-1]];
const contiguous = (a,b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

function normalizeCells(cells) {
  const minX = Math.min(...cells.map(c => c.x));
  const minY = Math.min(...cells.map(c => c.y));
  return { cells: cells.map(c => ({ x: c.x - minX, y: c.y - minY })), dx: minX, dy: minY };
}
function isSquare(cells, size) {
  if (cells.length !== size * size) return false;
  const seen = new Set(cells.map(c => key(c.x,c.y)));
  if (seen.size !== cells.length) return false;
  const norm = normalizeCells(cells);
  return norm.cells.every(c => c.x < size && c.y < size);
}
function canFit(cells, goal) {
  const norm = normalizeCells(cells);
  return new Set(cells.map(c => key(c.x,c.y))).size === cells.length &&
    norm.cells.every(c => c.x < goal && c.y < goal) && cells.length <= goal * goal;
}
function rotateCells(cells, turns = 1) {
  let result = cells.map(c => ({...c}));
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) result = result.map(c => ({ x:-c.y, y:c.x }));
  return normalizeCells(result).cells;
}
function absolute(player, dx = 0, dy = 0, shape = player.cells) {
  return shape.map(c => ({ x:player.x + c.x + dx, y:player.y + c.y + dy }));
}
function inBounds(cells) {
  return cells.every(c => c.x >= 1 && c.y >= 1 && c.x < CONFIG.width - 1 && c.y < CONFIG.height - 1);
}
function joinedCells(player, shard) {
  const old = absolute(player);
  const added = shard.cells.map(c=>({x:shard.x+c.x,y:shard.y+c.y}));
  const occupied = new Set(old.map(c=>key(c.x,c.y)));
  if (added.some(c=>occupied.has(key(c.x,c.y)))) return null;
  if (!added.some(c=>old.some(d=>contiguous(c,d)))) return null;
  const united = [...old,...added];
  if (!canFit(united, player.rank + 1)) return null;
  return { united, ...normalizeCells(united) };
}
function ringOrder(size) {
  const order = [];
  // Extend an existing square down and right; every added cell touches the old cluster.
  for(let x=0; x<size; x++) order.push({x, y:size});
  for(let y=0; y<=size; y++) order.push({x:size, y});
  return order;
}
function addMass(player, amount) {
  let gained = 0;
  let upgraded = 0;
  while(amount > 0 && player.rank < CONFIG.maxRank) {
    const goal = player.rank + 1;
    const existing = new Set(player.cells.map(c=>key(c.x,c.y)));
    const ring = ringOrder(player.rank);
    let updated = false;
    for (const c of ring) {
      if (amount <= 0) break;
      if (existing.has(key(c.x,c.y))) continue;
      if (!inBounds([{x:player.x+c.x,y:player.y+c.y}])) continue;
      // This helper is only used to incorporate captured territory; partial shapes
      // can have holes inside the frame, so fill these first if needed.
      if (player.cells.length >= goal * goal) break;
      player.cells.push(c);
      existing.add(key(c.x,c.y));
      gained++; amount--; updated = true;
    }
    if (player.cells.length === goal * goal && isSquare(player.cells, goal)) {
      player.rank = goal;
      upgraded++;
    } else if (!updated) break;
    else break;
  }
  return { gained, upgraded };
}
class World {
  constructor(opts = {}) {
    this.random = opts.random || Math.random;
    this.players = new Map();
    this.shards = new Map();
    this.nextId = 1;
    this.events = [];
    this.time = 0;
    this.botTick = 0;
    this.spawnInitial(opts.initialShards ?? CONFIG.targetShards);
  }
  randomPoint(margin=3) {
    return {x: margin + rngInt(CONFIG.width-2*margin,this.random), y:margin + rngInt(CONFIG.height-2*margin,this.random)};
  }
  blockedByPlayer(cells, ignoreId) {
    const set = new Set(cells.map(c=>key(c.x,c.y)));
    for(const p of this.players.values()) {
      if(!p.alive || p.id === ignoreId) continue;
      if(absolute(p).some(c=>set.has(key(c.x,c.y)))) return true;
    }
    return false;
  }
  blockedByShard(cells, ignoreId) {
    const set = new Set(cells.map(c=>key(c.x,c.y)));
    for(const shard of this.shards.values()) {
      if(shard.id === ignoreId) continue;
      if(shard.cells.some(c=>set.has(key(shard.x+c.x,shard.y+c.y)))) return true;
    }
    return false;
  }
  newShard() {
    const shapes = [
      [{x:0,y:0}], [{x:0,y:0}], [{x:0,y:0}],
      [{x:0,y:0},{x:1,y:0}], [{x:0,y:0},{x:0,y:1}],
      [{x:0,y:0},{x:1,y:0},{x:1,y:1}],
      [{x:0,y:0},{x:1,y:0},{x:2,y:0}]
    ];
    for(let i=0;i<65;i++) {
      const cells = shapes[rngInt(shapes.length,this.random)].map(c=>({...c}));
      const {x,y}=this.randomPoint();
      const abs=cells.map(c=>({x:x+c.x,y:y+c.y}));
      if (!inBounds(abs) || this.blockedByPlayer(abs) || this.blockedByShard(abs)) continue;
      const shard={id: this.nextId++, x,y,cells};
      this.shards.set(shard.id,shard);
      return shard;
    }
    return null;
  }
  spawnInitial(n) { for(let i=0;i<n;i++) this.newShard(); }
  addPlayer(name='Jugador', bot=false) {
    let spawn = this.randomPoint();
    for(let i=0;i<180;i++) {
      const p = this.randomPoint();
      if (this.blockedByPlayer([p]) || this.blockedByShard([p])) continue;
      let tooClose = false;
      for (const q of this.players.values()) if(q.alive && Math.abs(q.x-p.x)+Math.abs(q.y-p.y) < 6) tooClose=true;
      if (!tooClose) {spawn=p;break;}
    }
    const id = this.nextId++;
    const tag = String(name).trim().replace(/[\x00-\x1f<>]/g,'').slice(0,16) || 'Jugador';
    const p = { id, name:tag, bot, x:spawn.x, y:spawn.y, cells:[{x:0,y:0}], rank:1,
      color:COLORS[(id+Math.floor(this.random()*COLORS.length)) % COLORS.length],
      alive:true, joined:0, captures:0, best:1, born:this.time, cooldown:0,
      // Bots vary in patience, target priority, error rate and tendency to rotate.
      brain: bot ? {style:rngInt(4,this.random),reaction:145 + rngInt(210,this.random),
        next:0, wander:four[rngInt(4,this.random)], changeAt:0, target:null, stuck:0} : null
    };
    this.players.set(id,p);
    return p;
  }
  removePlayer(id) { this.players.delete(id); }
  note(p, code, extra={}) {
    if(!p.bot) this.events.push({id:p.id,type:code,...extra});
  }
  tryJoin(player, forcedShardId=null) {
    if(!player || !player.alive || player.rank >= CONFIG.maxRank) return false;
    let candidates=[];
    for (const shard of this.shards.values()) {
      if(forcedShardId!==null && forcedShardId!==shard.id) continue;
      if(Math.abs(shard.x-player.x)>player.rank+5 || Math.abs(shard.y-player.y)>player.rank+5) continue;
      const joint = joinedCells(player, shard);
      if(joint) candidates.push({shard,joint});
    }
    if(!candidates.length) return false;
    candidates.sort((a,b)=>a.shard.cells.length-b.shard.cells.length || a.shard.id-b.shard.id);
    const {shard,joint}=candidates[candidates.length-1];
    const oldX=player.x,oldY=player.y,oldCells=player.cells;
    player.x=joint.dx; player.y=joint.dy; player.cells=joint.cells;
    // Assembled shapes never overlap another player's piece or lie outside board.
    if(!inBounds(absolute(player)) || this.blockedByPlayer(absolute(player),player.id)) {
      player.x=oldX;player.y=oldY;player.cells=oldCells;return false;
    }
    this.shards.delete(shard.id);
    player.joined++;
    const target=player.rank+1;
    if(isSquare(player.cells,target)) {
      player.rank=target;
      player.best=Math.max(player.best,target);
      this.note(player,'level',{rank:target});
    } else this.note(player,'join',{cells:shard.cells.length});
    return true;
  }
  tryRotate(player, dir=1) {
    if(!player?.alive) return false;
    const rotated=rotateCells(player.cells,dir===-1 ? 3:1);
    const before=player.cells;
    player.cells=rotated;
    if(!inBounds(absolute(player)) || this.blockedByPlayer(absolute(player),player.id) || this.blockedByShard(absolute(player))) {
      player.cells=before;return false;
    }
    return true;
  }
  findOverlapping(playersCells, ignoreId) {
    const occupied = new Set(playersCells.map(c=>key(c.x,c.y)));
    return [...this.players.values()].filter(p=>p.alive && p.id !== ignoreId && absolute(p).some(c=>occupied.has(key(c.x,c.y))));
  }
  respawn(p) {
    let pt=this.randomPoint();
    for(let i=0;i<200;i++) {
      const sample=this.randomPoint();
      if(!this.blockedByPlayer([sample],p.id) && !this.blockedByShard([sample])) {pt=sample;break;}
    }
    p.x=pt.x;p.y=pt.y;p.cells=[{x:0,y:0}];p.rank=1;p.alive=true;
    p.joined=0;p.captures=0;p.born=this.time;p.cooldown=0;
    if(p.bot && p.brain) {p.brain.target=null;p.brain.stuck=0;}
  }
  kill(p, by=null) {
    if(!p.alive) return;
    p.alive=false;
    p.cooldown=this.time+1600;
    this.note(p,'dead',{by:by?.name||null,best:p.best,joins:p.joined,captures:p.captures});
  }
  capture(attacker,victim) {
    const cells=victim.cells.length;
    attacker.captures++;
    this.kill(victim,attacker);
    // If the victim overlaps the moving shape, its territory converts into
    // the winner's color as growth cells along the outer ring.
    const result=addMass(attacker,cells);
    attacker.best=Math.max(attacker.best,attacker.rank);
    this.note(attacker,'capture',{name:victim.name,rank:attacker.rank,cells});
    if(result.upgraded) this.note(attacker,'level',{rank:attacker.rank});
  }
  move(p,dx,dy) {
    if(!p?.alive || !Number.isInteger(dx) || !Number.isInteger(dy) ||
       (dx===0 && dy===0) || Math.abs(dx)>1 || Math.abs(dy)>1) return false;
    const target=absolute(p,dx,dy);
    if(!inBounds(target)) return false;
    // Touching a shard attempts to attach it without pushing the player.
    const encounter=[];
    const moved=new Set(target.map(c=>key(c.x,c.y)));
    for(const s of this.shards.values()) if(s.cells.some(c=>moved.has(key(s.x+c.x,s.y+c.y)))) encounter.push(s);
    if(encounter.length) {
      if(this.tryJoin(p,encounter[0].id)) return true;
      return false;
    }
    const rivals=this.findOverlapping(target,p.id);
    if(rivals.length) {
      const cannot=rivals.some(q=>!isSquare(p.cells,p.rank) || p.rank<=q.rank);
      if(cannot) {
        // A mature larger square can swallow a smaller challenger on contact.
        const superior=rivals.find(q=>isSquare(q.cells,q.rank) && q.rank>p.rank);
        if(superior) this.capture(superior,p);
        return false;
      }
      // Move first; then turn captured occupied cells into our territory.
      p.x+=dx;p.y+=dy;
      for(const q of rivals) this.capture(p,q);
      return true;
    }
    p.x+=dx;p.y+=dy;
    return true;
  }
  botAction(p) {
    if(!p.alive) return;
    const b=p.brain;
    if(this.time < b.next) return;
    b.next=this.time+b.reaction+this.random()*65;
    // Some bots fail to notice convenient opportunities; others are efficient.
    if(this.random() > (b.style===0 ? .82:.96) && this.tryJoin(p)) return;
    if(this.tryJoin(p)) {b.stuck=0;return;}
    const origin={x:p.x+Math.floor(p.rank/2),y:p.y+Math.floor(p.rank/2)};
    const enemy=[...this.players.values()].filter(q=>q.id!==p.id && q.alive)
      .sort((a,c)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)-Math.abs(c.x-p.x)-Math.abs(c.y-p.y));
    const dangerous=enemy.find(q=>q.rank>p.rank && Math.abs(q.x-p.x)+Math.abs(q.y-p.y)<10);
    const prey=enemy.find(q=>q.rank<p.rank && isSquare(p.cells,p.rank) &&
      Math.abs(q.x-p.x)+Math.abs(q.y-p.y)<(b.style===1?19:10));
    let tx,ty;
    if(dangerous && b.style!==2) {tx=p.x*2-dangerous.x;ty=p.y*2-dangerous.y;}
    else if(prey && b.style!==3) {tx=prey.x;ty=prey.y;}
    else {
      const targetChoices=[];
      for(const s of this.shards.values()) {
        const d=Math.abs(s.x-origin.x)+Math.abs(s.y-origin.y);
        if(d>29) continue;
        const score=d - Math.min(5,s.cells.length)*1.25 + this.random()*(b.style===2?11:3);
        targetChoices.push({s,score});
      }
      targetChoices.sort((a,c)=>a.score-c.score);
      if(targetChoices.length) {tx=targetChoices[0].s.x;ty=targetChoices[0].s.y;}
      else {tx=p.x+b.wander[0]*10;ty=p.y+b.wander[1]*10;}
    }
    if(this.time>b.changeAt) {
      b.changeAt=this.time+1100+this.random()*3000;
      if(this.random()<.24) b.wander=four[rngInt(4,this.random)];
    }
    const vx=tx-origin.x,vy=ty-origin.y;
    let choices=[];
    if(Math.abs(vx)>0) choices.push([Math.sign(vx),0]);
    if(Math.abs(vy)>0) choices.push([0,Math.sign(vy)]);
    if(Math.abs(vy)>Math.abs(vx)) choices.reverse();
    if(this.random()<(b.style===2?.32:.1)) choices.reverse();
    choices.push(b.wander,[1,0],[0,1],[-1,0],[0,-1]);
    let success=false;
    for(const [dx,dy] of choices) {if(this.move(p,dx,dy)){success=true;break;}}
    if(!success) {
      b.stuck++;
      if(this.random()<.82) this.tryRotate(p,this.random()<.5?1:-1);
      if(b.stuck>6) {b.wander=four[rngInt(4,this.random)];b.stuck=0;}
    } else b.stuck=0;
  }
  tick(dt=50) {
    this.time+=dt;
    if(this.shards.size<CONFIG.targetShards) {
      for(let i=0;i<Math.min(5,CONFIG.targetShards-this.shards.size);i++) this.newShard();
    }
    for(const p of this.players.values()) if(p.bot && !p.alive && this.time>=p.cooldown) this.respawn(p);
    for(const p of this.players.values()) if(p.bot) this.botAction(p);
  }
  populate(target=12) {
    const humans=[...this.players.values()].filter(p=>!p.bot).length;
    const bots=[...this.players.values()].filter(p=>p.bot);
    const desired=Math.max(0,target-humans);
    if(bots.length<desired) this.addPlayer(BOT_NAMES[rngInt(BOT_NAMES.length,this.random)]+' ·BOT',true);
    else if(bots.length>desired) {
      // Do not remove a bot directly in a player's viewport.
      const chosen=bots.sort((a,b)=>a.rank-b.rank)[0];
      if(chosen) this.removePlayer(chosen.id);
    }
  }
  snapshot(player) {
    const view=player?.alive?player:{x:CONFIG.width/2,y:CONFIG.height/2};
    const marginX=26, marginY=20;
    const inView=(x,y)=>Math.abs(x-view.x)<marginX && Math.abs(y-view.y)<marginY;
    const players=[...this.players.values()].filter(p=>p.alive && (p.id===player?.id || inView(p.x,p.y)))
      .map(p=>[p.id,p.x,p.y,p.rank,p.color,p.name,p.bot?1:0,p.cells.flatMap(c=>[c.x,c.y]),p.captures,p.joined]);
    const shards=[...this.shards.values()].filter(s=>inView(s.x,s.y))
      .map(s=>[s.id,s.x,s.y,s.cells.flatMap(c=>[c.x,c.y])]);
    const ranking=[...this.players.values()].filter(p=>p.alive).sort((a,b)=>
      b.rank-a.rank || b.cells.length-a.cells.length || b.captures-a.captures).slice(0,8)
      .map(p=>[p.id,p.name,p.rank,p.bot?1:0,p.cells.length]);
    const humans=[...this.players.values()].filter(p=>!p.bot).length;
    const bots=[...this.players.values()].filter(p=>p.bot).length;
    return {t:'state',time:this.time,me:player?.id||null,players,shards,ranking,
      humans,bots,world:[CONFIG.width,CONFIG.height]};
  }
}
module.exports={World,CONFIG,COLORS,isSquare,canFit,rotateCells,joinedCells,addMass,absolute,inBounds};
