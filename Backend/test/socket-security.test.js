import RevokedSession from '../src/models/RevokedSession.js';
﻿import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {io as connect} from 'socket.io-client';
import User from '../src/models/User.js';import Message from '../src/models/ChatMessage.js';import {generateToken} from '../src/utils/authSession.js';import {initializeSockets} from '../src/socket.js';
const alice='aaaaaaaaaaaaaaaaaaaaaaaa',bob='bbbbbbbbbbbbbbbbbbbbbbbb',admin='cccccccccccccccccccccccc';
function config(t){t.mock.method(RevokedSession,'exists',async()=>null);const old=process.env.JWT_SECRET;process.env.JWT_SECRET='local-socket-security-test-secret-only';t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});}
async function open(server,token,extraHeaders){const client=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],auth:{token},extraHeaders,reconnection:false,timeout:2000});try{await new Promise((resolve,reject)=>{client.once('connect',resolve);client.once('connect_error',reject);});return client;}catch(error){client.disconnect();throw error;}}
async function setup(){const server=createServer();const io=initializeSockets(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));return{server,close:async()=>{await new Promise(r=>io.close(r));}};}

test('real chat transport enforces ownership, sender role and per-event revocation without leaking model fields',async t=>{
 config(t);const accounts=new Map([alice,bob,admin].map(id=>[id,{_id:id,id,role:id===admin?'admin':'user',sessionVersion:0,isBlocked:false}]));t.mock.method(User,'findById',id=>({select:async()=>accounts.get(String(id))}));let filter,created;
 t.mock.method(Message,'find',query=>{filter=query;return{sort:()=>({limit:()=>({lean:async()=>[{_id:alice,customer:query.customer,sender:'user',text:'Fixture',createdAt:new Date(),readAt:null,__v:99,secret:'private'}]})})};});
 t.mock.method(Message,'create',async input=>{created=input;return{_id:alice,...input,createdAt:new Date(),readAt:null,__v:99};});
 const fixture=await setup();let client;try{client=await open(fixture.server,generateToken(alice));let reply=await client.timeout(2000).emitWithAck('chat:history',{customerId:bob});assert.equal(reply.ok,true);assert.equal(filter.customer,alice);assert.equal(reply.messages[0].secret,undefined);assert.equal(reply.messages[0].__v,undefined);
 reply=await client.timeout(2000).emitWithAck('chat:list',{});assert.equal(reply.ok,false);assert.match(reply.error,/Admin/);
 reply=await client.timeout(2000).emitWithAck('chat:send',{customerId:bob,sender:'admin',text:'Fixture test message'});assert.equal(reply.ok,true);assert.equal(created.customer,alice);assert.equal(created.sender,'user');assert.equal(reply.message.__v,undefined);
 accounts.get(alice).sessionVersion=1;reply=await client.timeout(2000).emitWithAck('chat:history',{});assert.equal(reply.ok,false);assert.match(reply.error,/revoked/);
 }finally{client?.disconnect();await fixture.close();}
});

test('socket handshake rejects arbitrary browser origins and invalid tokens',async t=>{config(t);const fixture=await setup();try{await assert.rejects(open(fixture.server,'invalid-token'));await assert.rejects(open(fixture.server,generateToken(alice),{Origin:'https://untrusted.example.test'}));}finally{await fixture.close();}});
