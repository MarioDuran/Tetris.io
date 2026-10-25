'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {possible,replay}=require('../public/prediction');
const cell=[{x:0,y:0}];
test('predicción local adelanta dos movimientos libres y permite reconciliación',()=>{
  const pending=[{seq:1,dx:1,dy:0},{seq:2,dx:0,dy:1}];
  assert.deepEqual(replay(10,10,cell,pending,[],[]),{x:11,y:11,predicted:2});
  const afterAck=pending.filter(v=>v.seq>1);
  assert.deepEqual(replay(11,10,cell,afterAck,[],[]),{x:11,y:11,predicted:1});
  assert.deepEqual(replay(11,11,cell,[],[],[]),{x:11,y:11,predicted:0});
});
test('predicción local no atraviesa paredes, fragmentos ni rivales',()=>{
  const shards=[{x:11,y:10,cells:cell}];
  assert.equal(possible(10,10,cell,1,0,shards,[]),false);
  assert.equal(possible(10,10,cell,0,1,shards,[]),true);
  assert.equal(possible(1,10,cell,-1,0,[],[]),false);
  assert.equal(possible(10,10,cell,1,0,[],[{x:11,y:10,cells:cell}]),false);
});
test('predicción local solo acepta pasos de grid válidos y no predice capturas',()=>{
  assert.equal(possible(10,10,cell,0,0,[],[]),false);
  assert.equal(possible(10,10,cell,2,0,[],[]),false);
  assert.equal(possible(10,10,cell,1,1,[],[]),true);
  const enemies=[{x:11,y:10,cells:cell,rank:1}];
  assert.equal(possible(10,10,cell,1,0,[],enemies),false);
});
