'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {World,CONFIG,isSquare,canFit,rotateCells,joinedCells,addMass,growthSpeed}=require('../server/world');
const same=(a,b)=>assert.deepEqual(new Set(a.map(c=>c.x+':'+c.y)),new Set(b.map(c=>c.x+':'+c.y)));
const fixture=()=>new World({initialShards:0});
function addShard(world,id,x,y,cells=[{x:0,y:0}]){
  const shard={id,x,y,cells};world.shards.set(id,shard);return shard;
}
test('solo los cuadrados sólidos completos califican como cerrados',()=>{
  assert.ok(isSquare([{x:2,y:2},{x:3,y:2},{x:2,y:3},{x:3,y:3}],2));
  assert.equal(isSquare([{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:0,y:1}],2),false);
  assert.equal(canFit([{x:0,y:0},{x:1,y:0},{x:2,y:0}],2),false);
});
test('una forma vuelve a su posición al rotarla cuatro veces',()=>{
  const shape=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];
  let cells=shape;
  for(let i=0;i<4;i++)cells=rotateCells(cells,1);
  same(cells,shape);
});
test('una pieza debe tocar por un lado y caber en el cuadrado siguiente',()=>{
  const p={x:10,y:10,rank:1,cells:[{x:0,y:0}]};
  assert.ok(joinedCells(p,{x:11,y:10,cells:[{x:0,y:0}]}));
  assert.equal(joinedCells(p,{x:12,y:10,cells:[{x:0,y:0}]}),null);
  assert.equal(joinedCells(p,{x:10,y:10,cells:[{x:0,y:0}]}),null);
});
test('cerrar 2x2 transforma 4 piezas en una estructura sólida de rango 2',()=>{
  const w=fixture(),p=w.addPlayer('Alice');p.x=10;p.y=10;
  addShard(w,100,11,10,[{x:0,y:0},{x:0,y:1}]);
  addShard(w,101,10,11);
  assert.equal(w.tryJoin(p,100),true);
  assert.equal(p.rank,1);
  assert.equal(p.cells.length,3);
  assert.equal(w.tryJoin(p,101),true);
  assert.equal(p.rank,2);
  assert.equal(p.cells.length,4);
  assert.ok(isSquare(p.cells,p.rank));
});
test('bloquea fragmentos que excederían los límites del próximo cuadrado',()=>{
  const w=fixture(),p=w.addPlayer('Alice');p.x=10;p.y=10;p.cells=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];
  addShard(w,200,2,2,[{x:0,y:0}]);
  assert.equal(w.tryJoin(p,200),false);
  addShard(w,201,12,10,[{x:0,y:0}]);
  assert.equal(w.tryJoin(p,201),false);
});
test('un cuadrado sólido más grande absorbe al rival menor',()=>{
  const w=fixture(),a=w.addPlayer('Grande'),b=w.addPlayer('Pequeño');
  a.x=10;a.y=10;a.rank=2;a.cells=[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}];
  b.x=12;b.y=10;b.rank=1;b.cells=[{x:0,y:0}];
  assert.equal(w.move(a,1,0),true);
  assert.equal(b.alive,false);
  assert.equal(a.captures,1);
  assert.equal(a.cells.length,5);
  assert.equal(a.rank,2);
  assert.equal(a.x,11);
});
test('un cuadrado incompleto no puede absorber aunque sea de rango superior',()=>{
  const w=fixture(),a=w.addPlayer('Cazador'),b=w.addPlayer('Pequeño');
  a.x=10;a.y=10;a.rank=2;a.cells=[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:0,y:2}];
  b.x=12;b.y=10;
  assert.equal(w.move(a,1,0),false);assert.equal(b.alive,true);
});
test('el bot se marca como bot; conteos separados',()=>{
  const w=fixture();w.addPlayer('Humana');w.populate(3);w.populate(3);
  const s=w.snapshot([...w.players.values()].find(p=>!p.bot));
  assert.equal(s.humans,1);assert.equal(s.bots,2);
  assert.equal(s.ranking.some(p=>p[3]===1),true);
});
test('la rotación busca pivote válido cerca del centro aunque esté cerca de pared',()=>{
  const w=fixture(),p=w.addPlayer('Lado');p.x=CONFIG.width-3;p.y=20;
  p.cells=[{x:0,y:0},{x:0,y:1},{x:0,y:2}];w.invalidate();
  const before={x:p.x,y:p.y+1};
  assert.equal(w.tryRotate(p,1),true);
  assert.ok(p.cells.every(c=>p.x+c.x>=1&&p.x+c.x<CONFIG.width-1));
  const center={x:p.x+1,y:p.y};
  assert.ok(Math.hypot(center.x-before.x,center.y-before.y)<2);
});
test('masa procedente de captura completa los anillos siguiente',()=>{
  const p={x:10,y:10,rank:2,cells:[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}]};
  const result=addMass(p,5);
  assert.equal(result.gained,5);assert.equal(result.upgraded,1);
  assert.equal(p.rank,3);assert.ok(isSquare(p.cells,3));
});

test('sprint sacrifica únicamente el último anillo y tiene recarga',()=>{
  const w=fixture(),p=w.addPlayer('Rapida');
  p.x=10;p.y=10;p.rank=4;p.cells=[];
  for(let y=0;y<4;y++)for(let x=0;x<4;x++)p.cells.push({x,y});
  w.invalidate();
  assert.equal(w.trySprint(p),true);
  assert.equal(p.rank,3);assert.equal(p.cells.length,9);
  assert.ok(isSquare(p.cells,3));
  assert.equal(w.events.at(-1).lost,7);
  assert.equal(w.trySprint(p),false);
  assert.ok(p.sprintUntil>w.time);
  assert.ok(growthSpeed(p,w.time)<growthSpeed({...p,sprintUntil:0},w.time));
  w.time=p.sprintReadyAt;
  assert.equal(w.trySprint(p),true);
  assert.equal(p.rank,2);assert.equal(p.cells.length,4);
});
test('una figura incompleta no puede sacrificar un anillo',()=>{
  const w=fixture(),p=w.addPlayer('Incompleta');
  p.x=10;p.y=10;p.rank=2;
  p.cells=[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:0,y:2}];
  w.invalidate();
  assert.equal(w.trySprint(p),false);
  assert.equal(p.cells.length,5);
});
test('piezas temporales caducan y se reemplazan sin saturar el mapa',()=>{
  const w=new World({initialShards:68});
  const original=new Set(w.shards.keys());
  for(let i=0;i<750;i++)w.tick(50);
  assert.ok(w.shards.size>=CONFIG.minShards);
  assert.ok(w.shards.size<=CONFIG.maxShards);
  assert.equal([...w.shards.keys()].filter(id=>original.has(id)).length,0);
  const s=w.snapshot(null);
  assert.ok(s.shards.every(p=>p[4]>0&&p[4]<=CONFIG.shardLifeMax));
});
test('los fragmentos de 4 celdas también existen',()=>{
  const w=fixture();
  for(let i=0;i<110;i++)w.newShard();
  assert.ok([...w.shards.values()].some(s=>s.cells.length===4));
});
test('captura rellena huecos de forma conectada',()=>{
  const p={x:10,y:10,rank:2,cells:[{x:1,y:1},{x:2,y:1},{x:1,y:2},{x:2,y:2},{x:0,y:1}]};
  const result=addMass(p,4);
  assert.equal(result.gained,4);
  assert.equal(result.upgraded,1);
  assert.ok(isSquare(p.cells,3));
});
test('un fragmento que no cabe bloquea sin unirse, pero movimiento diagonal resbala',()=>{
  const w=fixture(),p=w.addPlayer('Gira');p.x=10;p.y=10;w.invalidate();
  addShard(w,123,11,11,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);w.invalidate();
  assert.equal(w.move(p,1,1),true);
  assert.ok(p.x===11||p.y===11);
  assert.equal(p.cells.length,1);
});
test('los bots localizan piezas y construyen cuadrados',()=>{
  let seed=123456789;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const w=new World({initialShards:0,random}),p=w.addPlayer('CPU',true);p.x=10;p.y=10;w.invalidate();
  addShard(w,800,13,10,[{x:0,y:0}]);w.invalidate();
  for(let i=0;i<150;i++)w.tick(50);
  assert.ok(p.joined>0,'bot debe recolectar pieza cercana');
});
test('radar devuelve amenazas incluso fuera del encuadre',()=>{
  const w=fixture(),a=w.addPlayer('Azul'),b=w.addPlayer('Rojo');
  a.x=5;a.y=5;b.x=70;b.y=50;w.invalidate();
  const snap=w.snapshot(a);
  assert.equal(snap.enemies[0][0],b.id);
  assert.equal(snap.players.some(p=>p[0]===b.id),false);
});
