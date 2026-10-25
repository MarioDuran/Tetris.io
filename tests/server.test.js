'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const delay=n=>new Promise(resolve=>setTimeout(resolve,n));
async function freePort(){return await new Promise((resolve,reject)=>{
  const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});
});}
async function awaitMessage(ws,predicate,timeout=3200){
  return await new Promise((resolve,reject)=>{
    const t=setTimeout(()=>{cleanup();reject(new Error('WebSocket sin mensaje esperado'));},timeout);
    function cleanup(){clearTimeout(t);ws.removeEventListener('message',handler);}
    function handler(event){let msg;try{msg=JSON.parse(event.data);}catch{return;}
      if(predicate(msg)){cleanup();resolve(msg);}}
    ws.addEventListener('message',handler);
  });
}
async function connectedClient(url,name) {
  const ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const welcome=awaitMessage(ws,m=>m.t==='welcome');
  ws.send(JSON.stringify({t:'join',name}));
  const w=await welcome;
  const state=await awaitMessage(ws,m=>m.t==='state');
  return {ws,w,state};
}
test('servidor HTTP + dos jugadores concurrentes usando WebSockets reales',async(t)=>{
  const port=await freePort();
  const child=spawn(process.execPath,[path.resolve(__dirname,'../server/index.js')],{
    cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),MIN_POPULATION:'0'},stdio:'ignore'
  });
  t.after(()=>child.kill('SIGTERM'));
  const base=`http://127.0.0.1:${port}`;
  let health;
  for(let i=0;i<70;i++){
    try{const response=await fetch(base+'/health');if(response.ok){health=await response.json();break;}}
    catch{} await delay(45);
  }
  assert.equal(health?.ok,true);
  assert.equal(health?.bots,0);
  const index=await fetch(base+'/');
  assert.equal(index.status,200);
  assert.match(await index.text(),/QUADRIFT/);
  const a=await connectedClient(`ws://127.0.0.1:${port}/ws`,'Uno');
  const b=await connectedClient(`ws://127.0.0.1:${port}/ws`,'Dos');
  t.after(()=>{a.ws.close();b.ws.close();});
  assert.notEqual(a.w.id,b.w.id);
  const state=await awaitMessage(a.ws,m=>m.t==='state'&&m.humans===2);
  assert.equal(state.humans,2);
  assert.equal(state.bots,0);
  assert.equal(state.ranking.length,2);
  assert.deepEqual(state.world,[76,56]);
  a.ws.send(JSON.stringify({t:'mv',x:1,y:0}));
  a.ws.send(JSON.stringify({t:'rot',dir:1}));
  a.ws.send(JSON.stringify({t:'joinPiece'}));
  const next=await awaitMessage(a.ws,m=>m.t==='state');
  assert.equal(next.t,'state');
}, {timeout:10000});
