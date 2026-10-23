"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// Run the real AccessoryFactory's static name-sync method with all unrelated device
// handlers stubbed. This is the same code path used by every existing accessory.
const src=fs.readFileSync(path.join(__dirname,'../dist/shared/accessories/AccessoryFactory.js'),'utf8');
const moduleUnderTest={exports:{}};
const sandbox={module:moduleUnderTest,exports:moduleUnderTest.exports,require(name){
  if(name==='../util/util')return {sanitizeName:s=>typeof s==='string'?s:undefined};
  class Stub {};
  return Stub;
}};
vm.runInNewContext(src,sandbox);
const AccessoryFactory=moduleUnderTest.exports.default;
function fixture(registered){
  const Name={UUID:'NAME'},ConfiguredName={UUID:'CONFIG'};
  const cache={NAME:'Old',CONFIG:'Old'};
  const service={UUID:'FAN',displayName:'Livingroom Fan',subtype:'fan-1',
    testCharacteristic(c){return Object.hasOwn(cache,c.UUID);},
    addOptionalCharacteristic(c){cache[c.UUID]=undefined;},
    getCharacteristic(c){return {value:cache[c.UUID]};},
    updateCharacteristic(c,value){cache[c.UUID]=value;}};
  const accessory={displayName:'Test fan',context:{},services:[service],_associatedPlugin:registered?'homebridge-tuya-without-developer-account':undefined};
  let updates=0;
  const platform={options:{syncHomebridgeNamesToHomeKit:true},Characteristic:{Name,ConfiguredName},Service:{AccessoryInformation:{UUID:'INFO'},Battery:{UUID:'BATT'}},log:{info(){},debug(){}},api:{updatePlatformAccessories(){updates++;}}};
  return {accessory,platform,service,cache,updates:()=>updates};
}
test('new accessory names sync in memory without touching unregistered Homebridge cache',()=>{
  const f=fixture(false);
  AccessoryFactory.syncHomebridgeNamesToHomeKit(f.platform,f.accessory);
  assert.equal(f.cache.NAME,'Livingroom Fan');
  assert.equal(f.cache.CONFIG,'Livingroom Fan');
  assert.equal(f.updates(),0);
});
test('registered accessory names still persist through updatePlatformAccessories',()=>{
  const f=fixture(true);
  AccessoryFactory.syncHomebridgeNamesToHomeKit(f.platform,f.accessory);
  assert.equal(f.cache.NAME,'Livingroom Fan');
  assert.equal(f.updates(),1);
});
test('name sync disabled keeps existing cached names untouched',()=>{
  const f=fixture(true);
  f.platform.options.syncHomebridgeNamesToHomeKit=false;
  AccessoryFactory.syncHomebridgeNamesToHomeKit(f.platform,f.accessory);
  assert.equal(f.cache.NAME,'Old');
  assert.equal(f.updates(),0);
});
