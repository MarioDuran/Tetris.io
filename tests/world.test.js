'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {World,CONFIG,isSquare,canFit,rotateCells,joinedCells,addMass}=require('../server/world');
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
test('la rotación se bloquea si saldría de la arena',()=>{
  const w=fixture(),p=w.addPlayer('Lado');p.x=CONFIG.width-3;p.y=20;
  p.cells=[{x:0,y:0},{x:0,y:1},{x:0,y:2}];
  assert.equal(w.tryRotate(p,1),false);
});
test('masa procedente de captura completa los anillos siguiente',()=>{
  const p={x:10,y:10,rank:2,cells:[{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}]};
  const result=addMass(p,5);
  assert.equal(result.gained,5);assert.equal(result.upgraded,1);
  assert.equal(p.rank,3);assert.ok(isSquare(p.cells,3));
});
