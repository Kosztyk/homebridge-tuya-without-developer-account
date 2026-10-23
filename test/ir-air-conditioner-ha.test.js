"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  POWER_OFF, POWER_ON, AC_MODE, FAN_SPEED, buildKeyRange, buildQRCommands,
  knownStateAfterCommand, statusToState, hubDpsToState,
} = require('../dist/shared/util/IRAirConditionerHA');
const IR = require('../dist/shared/accessories/IRAirConditionerHAAccessory');
const root = path.join(__dirname, '..');
const SCHEMA = [
  { code: 'M', property: { min: 0, max: 4 } },
  { code: 'T', property: { min: 16, max: 30, step: 1 } },
  { code: 'F', property: { min: 0, max: 3 } },
  { code: 'PowerOn', property: 'PowerOn' },
  { code: 'PowerOff', property: 'PowerOff' },
];
const clone = x => JSON.parse(JSON.stringify(x));
function stubInstance(desired, known, send) {
  const obj = Object.create(IR.prototype);
  const device = { id: 'remote1', name: 'IR AC', category: 'infrared_ac', schema: SCHEMA, status: [], online: true };
  const manager = { getDevice: id => id === device.id ? device : undefined, devices: [device], sendCommands: send };
  obj.platform = { deviceManager: manager, api: { hap: { HapStatusError: class HapStatusError extends Error { constructor(code) { super('HAP '+code); this.code = code; } } } }, log: { warn() {}, debug() {}, info() {} }, options: {}, getDeviceConfig: () => ({}) };
  obj.accessory = { context: { deviceID: device.id }, services: [] };
  obj.cachedLog = { warn() {}, debug() {}, info() {} };
  obj.acState = { ...desired };
  obj.known = { ...known };
  obj.sensors = {};
  obj.updateAllValues = async () => {};
  return obj;
}

test('QR key range exposes only documented M modes and T temperatures', () => {
  const keys = buildKeyRange(SCHEMA);
  assert.deepEqual(keys.map(x => x.mode), [0,1,2,3,4]);
  assert.equal(keys[0].temp_list[0].temp, 16);
  assert.equal(keys[0].temp_list.at(-1).temp, 30);
});
test('QR key range clamps user limits to actual hardware range', () => {
  const keys = buildKeyRange(SCHEMA, {minTemperature: 18, maxTemperature: 28});
  assert.equal(keys[1].temp_list[0].temp, 18);
  assert.equal(keys[1].temp_list.at(-1).temp, 28);
  assert.equal(buildKeyRange(SCHEMA, {minTemperature: 12, maxTemperature: 35})[0].temp_list[0].temp, 16);
  assert.deepEqual(buildKeyRange(SCHEMA, {minTemperature: 40, maxTemperature: 50}), []);
});
test('dry/fan mode suppression keeps only 0..2', () => assert.deepEqual(buildKeyRange(SCHEMA, {}, AC_MODE.AUTO).map(x=>x.mode),[0,1,2]));
test('fallback handles missing QR specification', () => { const r=buildKeyRange();assert.equal(r.length,5);assert.equal(r[0].temp_list.length,15); });
test('power-on same mode makes exactly one request', () => {
  const old = {power:POWER_OFF,mode:0,temp:22,wind:0};
  assert.deepEqual(buildQRCommands({...old,power:POWER_ON},old), [{code:'PowerOn',value:'PowerOn'}]);
});
test('turning off sends only PowerOff',()=>{
  assert.deepEqual(buildQRCommands({power:POWER_OFF,mode:1,temp:26,wind:3},{power:POWER_ON,mode:0,temp:21,wind:1}),[{code:'PowerOff',value:'PowerOff'}]);
  assert.deepEqual(buildQRCommands({power:POWER_OFF},{power:POWER_OFF}),[]);
});
test('only changed M/T/F functions are emitted',()=>{
  const known={power:POWER_ON,mode:0,temp:22,wind:1};
  assert.deepEqual(buildQRCommands({...known,temp:23},known),[{code:'T',value:23}]);
  assert.deepEqual(buildQRCommands({...known,mode:1,wind:3},known),[{code:'M',value:1},{code:'F',value:3}]);
});
test('unknown start sends power and all requested settings',()=>{
  assert.deepEqual(buildQRCommands({power:POWER_ON,mode:0,temp:24,wind:0},{}),[
    {code:'PowerOn',value:'PowerOn'},{code:'M',value:0},{code:'T',value:24},{code:'F',value:0},
  ]);
});
test('status mapper handles Tuya booleans and numeric strings',()=>{
  assert.deepEqual(statusToState([{code:'power',value:true},{code:'mode',value:'1'},{code:'temp',value:23},{code:'wind',value:3}]),{power:1,mode:1,temp:23,wind:3});
  assert.deepEqual(statusToState([{code:'power',value:false},{code:'temp',value:null},{code:'irrelevant',value:9}]),{power:0});
});
test('known state updates are per-command',()=>{
  assert.deepEqual(knownStateAfterCommand({code:'M',value:2}),{power:1,mode:2});
  assert.deepEqual(knownStateAfterCommand({code:'PowerOff',value:'PowerOff'}),{power:0});
  assert.deepEqual(knownStateAfterCommand({code:'unknown',value:4}),{});
});
test('hub DPS conversion includes sensor values and physical-remote modes',()=>{
  assert.deepEqual(hubDpsToState({1:true,2:254,3:23,4:'cold',5:'low',12:64}),{power:1,mode:0,temp:23,wind:1,currentTemperature:25.4,humidity:64});
  for(const [label,mode] of Object.entries({cold:0,warm:1,auto:2,air:3,dehumidify:4})) assert.equal(hubDpsToState({4:label}).mode,mode);
  for(const [label,wind] of Object.entries({auto:0,low:1,middle:2,high:3})) assert.equal(hubDpsToState({5:label}).wind,wind);
});
test('hub DPS custom mapping and divisor',()=>{
  assert.deepEqual(hubDpsToState({101:false,102:21,103:'warm'},{power:'101',currentTemperature:'102',mode:'103'},1),{power:0,mode:1,currentTemperature:21});
});
test('unknown or incomplete hub values cannot overwrite state',()=>{
  assert.deepEqual(hubDpsToState({4:'turbo',5:null,3:null}),{});
  assert.deepEqual(hubDpsToState({1:true}),{power:1});
});
test('IR cloud sends each changed function in an independent request', async()=>{
  const writes=[];
  const before={power:POWER_OFF,mode:0,temp:22,wind:0};
  const obj=stubInstance({...before,power:POWER_ON,mode:1,temp:25},before,async(_id,commands)=>{writes.push(clone(commands));return true;});
  await obj.sendACCommands();
  assert.deepEqual(writes,[[{code:'PowerOn',value:'PowerOn'}],[{code:'M',value:1}],[{code:'T',value:25}]]);
  assert.deepEqual(obj.known,{...before,power:POWER_ON,mode:1,temp:25});
});
test('cloud command refusal rejects HomeKit write and rolls back desired state',async()=>{
  const known={power:POWER_ON,mode:0,temp:22,wind:1};
  const obj=stubInstance({...known,temp:25},known,async()=>false);
  await assert.rejects(obj.sendACCommands(),err=>err.code===-70402);
  assert.deepEqual(obj.acState,known);
});
test('partial success keeps last accepted state if next command fails',async()=>{
  const known={power:POWER_OFF,mode:0,temp:22,wind:1};
  let n=0;
  const obj=stubInstance({...known,power:POWER_ON,mode:1},known,async()=>++n===1);
  await assert.rejects(obj.sendACCommands(),err=>err.code===-70402);
  assert.equal(obj.acState.power,POWER_ON);
  assert.equal(obj.acState.mode,0);
});
test('no IR commands emitted when desired state equals known state',async()=>{
  let writes=0;const obj=stubInstance({power:POWER_OFF},{power:POWER_OFF},async()=>{writes++;return true;});
  await obj.sendACCommands();assert.equal(writes,0);
});
test('only infrared_ac routes to the new handler; other infrared types retain original handler',()=>{
  const factory=fs.readFileSync(path.join(root,'dist/shared/accessories/AccessoryFactory.js'),'utf8');
  assert.match(factory,/case 'infrared_ac':\s*return new IRAirConditionerHAAccessory/);
  assert.match(factory,/case 'infrared_tv':/);
  assert.match(factory,/case 'infrared_fan':/);
  assert.match(factory,/case 'hwktwkq':/);
});
test('HomeKit name sync avoids updating unregistered UUIDs',()=>{
  const factory=fs.readFileSync(path.join(root,'dist/shared/accessories/AccessoryFactory.js'),'utf8');
  assert.match(factory,/if \(changed && accessory\._associatedPlugin\)/);
});
test('IR AC override is strictly device scoped',()=>{
  const platform=fs.readFileSync(path.join(root,'dist/platform.js'),'utf8');
  assert.match(platform,/delete scoped\.irAirConditioner/);
  assert.match(platform,/scoped\.irAirConditioner && String\(device\?\.category/);
  assert.match(platform,/irAirConditioner: deviceConfig\?\.irAirConditioner/);
});
test('custom settings UI stages IR overrides and preserves existing options',()=>{
  const ui=fs.readFileSync(path.join(root,'homebridge-ui/public/index.html'),'utf8');
  const schema=JSON.parse(fs.readFileSync(path.join(root,'config.schema.json'),'utf8'));
  assert.match(ui,/ensureDeviceOverride\(id\)\.irAirConditioner = opts/);
  assert.match(ui,/renderIrAcOverrides\(\)/);
  assert.ok(schema.schema.properties.options.properties.deviceOverrides.items.properties.irAirConditioner.properties.hubId);
});
test('optional LAN dependency does not change normal QR mode',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.optionalDependencies.tuyapi,'^7.7.1');
  assert.equal(pkg.homebridge.platform,'TuyaNoDeveloperAccount');
});
