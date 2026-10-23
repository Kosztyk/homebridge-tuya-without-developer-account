"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const IRHubLocalConnection = require('../dist/shared/util/IRHubLocalConnection');
const log={warn(){},debug(){},info(){}};
test('stop cancels scheduled hub reconnect',()=>{
  const conn=new IRHubLocalConnection({id:'hub1'},log);
  conn.stopped=false;
  conn.scheduleReconnect();
  assert.ok(conn.reconnectTimer);
  conn.stop();
  assert.equal(conn.stopped,true);
  assert.equal(conn.reconnectTimer,undefined);
});
test('stop never schedules a new retry',()=>{
  const conn=new IRHubLocalConnection({id:'hub1'},log);
  conn.stop();
  conn.scheduleReconnect();
  assert.equal(conn.reconnectTimer,undefined);
});
test('LAN device IP is rediscovered when address changed', async()=>{
  const conn=new IRHubLocalConnection({id:'hub1',ip:'192.168.1.7'},log);
  conn.stopped=false;
  conn.device={device:{ip:'192.168.1.7'},find:async()=>{conn.device.device.ip='192.168.1.8';}};
  await conn.discover();
  assert.equal(conn.device.device.ip,'192.168.1.8');
});
test('LAN discovery retains old IP if lookup fails',async()=>{
  const conn=new IRHubLocalConnection({id:'hub1',ip:'192.168.1.7'},log);
  conn.stopped=false;
  conn.device={device:{ip:'192.168.1.7'},find:async()=>{throw new Error('timeout');}};
  await assert.rejects(conn.discover(),/timeout/);
  assert.equal(conn.device.device.ip,'192.168.1.7');
});
test('LAN connection serialization prevents overlapping connects',async()=>{
  const conn=new IRHubLocalConnection({id:'hub1',ip:'192.168.1.7'},log);
  let count=0;
  conn.stopped=false;
  conn.device={device:{ip:'192.168.1.7'},connect:async()=>{count++;await new Promise(resolve=>setTimeout(resolve,15));},disconnect(){}};
  await Promise.all([conn.connect(),conn.connect(),conn.connect()]);
  assert.equal(count,1);
  conn.stop();
});
test('optional package missing causes clean degradation, not a crash',()=>{
  const conn=new IRHubLocalConnection({id:'hub1'},log);
  // When tuyapi is not installed, createDevice() returns undefined.
  // When installed in Homebridge the same method creates the actual LAN client.
  assert.doesNotThrow(()=>conn.start());
  conn.stop();
});

// Load the real connection implementation with a mocked tuyapi client so event
// forwarding can be verified without network access or optional dependencies.
test('LAN forwards dp-refresh partial updates as dps, without requiring DP 1',()=>{
  const fs=require('node:fs');
  const vm=require('node:vm');
  const {EventEmitter}=require('node:events');
  const source=fs.readFileSync(require.resolve('../dist/shared/util/IRHubLocalConnection'),'utf8');
  let client;
  class FakeTuyAPI extends EventEmitter {
    constructor(){super();this.device={ip:'192.168.1.22'};client=this;}
    disconnect(){}
  }
  const fakeModule={exports:{}};
  vm.runInNewContext(source,{
    module:fakeModule,exports:fakeModule.exports,
    require(name){if(name==='events')return {EventEmitter};if(name==='tuyapi')return FakeTuyAPI;throw new Error('Unexpected dependency '+name);},
    clearTimeout,setTimeout,
  });
  const MockedConnection=fakeModule.exports;
  const conn=new MockedConnection({id:'hub1',key:'fake'},log);
  conn.stopped=false;
  const updates=[];
  conn.on('dps',dps=>updates.push({...dps}));
  conn.createDevice();
  client.emit('data',{dps:{1:true}});
  client.emit('dp-refresh',{dps:{2:254,3:24,4:'cold',5:'middle',12:55}});
  client.emit('dp-refresh',{dps:{12:57}});
  client.emit('dp-refresh',{foo:'no dps'});
  assert.deepEqual(updates,[{1:true},{2:254,3:24,4:'cold',5:'middle',12:55},{12:57}]);
  conn.stop();
  client.emit('data',{dps:{1:false}});
  client.emit('dp-refresh',{dps:{12:60}});
  assert.equal(updates.length,3,'no new updates after stopping the LAN connection');
});
