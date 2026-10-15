import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import pg from 'pg';
import {pool,withHeavySlot} from '../packages/adapters/db.ts';
after(async()=>{await pool.end();});
test('a delayed successful PostgreSQL handshake acquires the real heavy lock, preserves fail-fast exclusion and releases it',{timeout:30000},async()=>{
 const original=process.env.DATABASE_URL!;const upstream=new URL(original);assert.ok(upstream.pathname.startsWith('/tmw_test_'));
 const peers=new Set<net.Socket>();let forwarded=false;
 const proxy=net.createServer(client=>{peers.add(client);client.on('error',()=>{});client.on('close',()=>peers.delete(client));const timer=setTimeout(()=>{if(client.destroyed)return;forwarded=true;const server=net.connect({host:upstream.hostname,port:Number(upstream.port||5432)});peers.add(server);server.on('error',()=>client.destroy());server.on('close',()=>{peers.delete(server);client.destroy();});client.on('close',()=>server.destroy());client.pipe(server);server.pipe(client);},3000);client.on('close',()=>clearTimeout(timer));});
 await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));const address=proxy.address();assert.ok(address&&typeof address!=='string');const delayed=new URL(original);delayed.hostname='127.0.0.1';delayed.port=String(address.port);
 const observer=new pg.Client({connectionString:original});await observer.connect();const began=Date.now();let called=false;
 try{
  process.env.DATABASE_URL=delayed.href;
  const result=await withHeavySlot(async signal=>{called=true;assert.equal(signal.aborted,false);assert.equal((await observer.query('SELECT pg_try_advisory_lock(7843,2) AS owned')).rows[0].owned,false);await assert.rejects(withHeavySlot(async()=>false),/PROCESSING_BUSY/);return 'actual-lock-owned';});
  assert.equal(result,'actual-lock-owned');assert.equal(called,true);assert.equal(forwarded,true);assert.ok(Date.now()-began>=2800);
  assert.equal((await observer.query('SELECT pg_try_advisory_lock(7843,2) AS owned')).rows[0].owned,true);await observer.query('SELECT pg_advisory_unlock(7843,2)');
 }finally{process.env.DATABASE_URL=original;for(const socket of peers)socket.destroy();await new Promise<void>(resolve=>proxy.close(()=>resolve()));await observer.end();}
});
