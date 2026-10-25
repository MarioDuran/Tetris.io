'use strict';
// Small RFC 6455 text WebSocket transport. Zero runtime dependencies.
// Supports browser text frames, fragmentation, masked input, ping/pong and close.
const {createHash} = require('node:crypto');
const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function makeFrame(opcode, value=Buffer.alloc(0)) {
  const payload=Buffer.isBuffer(value)?value:Buffer.from(value);
  const size=payload.length;
  let header;
  if(size<126) {header=Buffer.alloc(2);header[1]=size;}
  else if(size<=65535) {header=Buffer.alloc(4);header[1]=126;header.writeUInt16BE(size,2);}
  else {header=Buffer.alloc(10);header[1]=127;header.writeBigUInt64BE(BigInt(size),2);}
  header[0]=0x80|opcode;
  return Buffer.concat([header,payload]);
}
class Peer {
  constructor(socket) {
    this.socket=socket;this.buffer=Buffer.alloc(0);this.parts=[];
    this.partSize=0;this.closed=false;this.lastPong=Date.now();
    this.onMessage=()=>{};this.onClose=()=>{};
    socket.setNoDelay(true);socket.setKeepAlive(true,15000);
    socket.on('data',chunk=>this.read(chunk));
    socket.on('error',()=>this.close());
    socket.on('close',()=>this.close());
  }
  send(obj) {
    if(this.closed || !this.socket.writable || this.socket.writableLength > 512*1024) return;
    this.socket.write(makeFrame(1,JSON.stringify(obj)));
  }
  ping() { if(!this.closed) this.socket.write(makeFrame(9)); }
  close() {if(this.closed)return; this.closed=true; this.socket.destroy();this.onClose();}
  read(chunk) {
    this.buffer=Buffer.concat([this.buffer,chunk]);
    if(this.buffer.length>128*1024){this.close();return;}
    while(this.buffer.length>=2 && !this.closed) {
      const first=this.buffer[0], second=this.buffer[1];
      const fin=!!(first&0x80), opcode=first&15, masked=!!(second&0x80);
      if((first&0x70)!==0 || !masked) {this.close();return;}
      let offset=2, size=second&127;
      if(size===126) {if(this.buffer.length<4)return;size=this.buffer.readUInt16BE(2);offset=4;}
      if(size===127) {if(this.buffer.length<10)return;const n=this.buffer.readBigUInt64BE(2);
        if(n>BigInt(65536)){this.close();return;}size=Number(n);offset=10;}
      if(size>65536) {this.close();return;}
      if(this.buffer.length<offset+4+size)return;
      const mask=this.buffer.subarray(offset,offset+4);
      const data=Buffer.from(this.buffer.subarray(offset+4,offset+4+size));
      this.buffer=this.buffer.subarray(offset+4+size);
      for(let i=0;i<data.length;i++) data[i]^=mask[i%4];
      if(opcode===8){this.close();return;}
      if(opcode===9){this.socket.write(makeFrame(10,data));continue;}
      if(opcode===10){this.lastPong=Date.now();continue;}
      if(opcode===1 || opcode===0) {
        if(opcode===1 && this.parts.length){this.close();return;}
        if(opcode===0 && this.parts.length===0){this.close();return;}
        this.parts.push(data);this.partSize+=data.length;
        if(this.partSize>4096){this.close();return;}
        if(fin) {
          const message=Buffer.concat(this.parts).toString('utf8');
          this.parts=[];this.partSize=0;
          try{this.onMessage(message);}catch(e){/* Ignore malformed input. */}
        }
      } else {this.close();return;}
    }
  }
}
function upgrade(req,socket,head,callback) {
  const key=req.headers['sec-websocket-key'];
  const origin=req.headers.origin;
  const host=req.headers.host;
  if(req.url!=='/ws' || req.headers.upgrade?.toLowerCase()!=='websocket' ||
    req.headers['sec-websocket-version']!=='13' || typeof key!=='string' ||
    !/^[a-zA-Z0-9+/]{22}==$/.test(key) ||
    (origin && (()=>{try{return new URL(origin).host !== host;}catch{return true;}})())) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;
  }
  const accept=createHash('sha1').update(key+MAGIC).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const peer=new Peer(socket);
  callback(peer);
  if(head.length) peer.read(head);
}
module.exports={Peer,upgrade,makeFrame};
