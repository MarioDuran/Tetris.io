/* QUADRIFT client movement prediction: conservative collisions, authoritative corrections. */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.QuadriftPrediction=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function possible(x,y,cells,dx,dy,shards,players,width=76,height=56){
    if(!Number.isInteger(dx)||!Number.isInteger(dy)||(!dx&&!dy)||Math.abs(dx)>1||Math.abs(dy)>1)return false;
    const taken=new Set();
    for(const s of shards)for(const c of s.cells)taken.add((s.x+c.x)+':'+(s.y+c.y));
    for(const p of players)for(const c of p.cells)taken.add((p.x+c.x)+':'+(p.y+c.y));
    for(const c of cells){
      const nx=x+c.x+dx,ny=y+c.y+dy;
      if(nx<1||ny<1||nx>=width-1||ny>=height-1||taken.has(nx+':'+ny))return false;
    }
    return true;
  }
  function replay(x,y,cells,pending,shards,players,width=76,height=56){
    let predicted=0;
    for(const item of pending){
      if(possible(x,y,cells,item.dx,item.dy,shards,players,width,height)){
        x+=item.dx;y+=item.dy;predicted++;
      }
    }
    return {x,y,predicted};
  }
  return {possible,replay};
});
