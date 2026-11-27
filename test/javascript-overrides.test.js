'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Base = require('../dist/shared/accessories/BaseAccessory').default;
const key = 'allowUnsafeJavaScriptOverrides';
const plain = value => JSON.parse(JSON.stringify(value));
class HapStatusError extends Error {
  constructor(status) { super('HAP communication failure'); this.hapStatus = status; }
}
// Real runtime platform methods; only unrelated cloud/accessory imports are mocked.
const filename = require.resolve('../dist/platform');
const realRequire = createRequire(filename);
const exportsObj = {};
vm.runInNewContext(readFileSync(filename, 'utf8'), {
  exports: exportsObj,
  require(name) {
    if (['./cloud/api/TuyaHACloudAPI','./cloud/device/TuyaHADeviceManager','./shared/accessories/AccessoryFactory'].includes(name)) return { default: class {} };
    return realRequire(name);
  },
});
const { TuyaPlatform } = exportsObj;
function fixture(options = {}, id = 'device-a', overrides = {}) {
  const writes = [], warnings = [];
  const device = { id: 'device-a', uuid: 'uuid-a', product_id: 'product-a', name: 'Fixture', category: 'kg', online: true,
    schema: [{ code: 'raw', mode: 'rw', type: 'Integer', property: {} }, { code: 'switch_1', mode: 'rw', type: 'Boolean' }],
    status: [{ code: 'raw', value: 20 }, { code: 'switch_1', value: false }] };
  const scripted = { code: 'raw', newCode: 'mapped', onGet: 'this.readCount++; value + (device.id === "device-a" ? 1 : 0)', onSet: 'this.writeCount++; value - 1', ...overrides };
  const platform = Object.create(TuyaPlatform.prototype);
  platform.options = options;
  options.deviceOverrides = [{ id, schema: [scripted] }];
  platform.deviceManager = { getDevice: () => device, sendCommands: async (id, commands) => writes.push({ id, commands: plain(commands) }) };
  platform.api = { hap: { HapStatusError, Service: { AccessoryInformation: 'info' }, Characteristic: {} }, user: { storagePath: () => '/nonexistent-test-fixture' } };
  platform.log = { debug() {}, warn(...args) { warnings.push(args.join(' ')); }, info() {}, error() {} };
  const service = { testCharacteristic: () => false, setCharacteristic() { return this; } };
  const accessory = new Base(platform, { context: { deviceID: device.id }, getService: () => service, addService: () => service });
  accessory.readCount = 0; accessory.writeCount = 0;
  return { accessory, platform, device, writes, warnings, scripted };
}
for (const [label, options] of [ ['missing', {}], ['false', {[key]:false}], ['string true', {[key]:'true'}], ['numeric one', {[key]:1}], ['null', {[key]:null}], ['inherited true', Object.create({[key]:true})] ]) {
  test(`scripts cannot execute with ${label} opt-in`, async () => {
    const f = fixture(options);
    assert.deepEqual(f.accessory.getStatus('mapped'), {code:'mapped',value:20});
    const batch = [{code:'switch_1',value:true},{code:'mapped',value:42}];
    await assert.rejects(f.accessory.sendCommands(batch), {hapStatus:-70402});
    assert.equal(f.accessory.readCount, 0);
    assert.equal(f.accessory.writeCount, 0);
    assert.equal(f.writes.length, 0);
    assert.equal(f.device.status[1].value, false);
    assert.equal(batch[1].code, 'mapped');
    assert.throws(() => f.accessory.eval('this.readCount++', f.device, 0), {hapStatus:-70402});
    assert.equal(f.accessory.readCount, 0);
  });
}
for (const id of ['device-a', 'uuid-a', 'product-a', 'global']) {
  test(`explicit true preserves legacy read/write context for ${id} overrides`, async () => {
    const f = fixture({[key]:true}, id);
    assert.deepEqual(f.accessory.getStatus('mapped'), {code:'mapped',value:21});
    await f.accessory.sendCommands([{code:'mapped',value:42}]);
    assert.deepEqual(f.writes, [{id:'device-a',commands:[{code:'raw',value:41}]}]);
    assert.equal(f.accessory.readCount, 1);
    assert.equal(f.accessory.writeCount, 1);
    f.platform.options[key] = false;
    assert.equal(f.accessory.getStatus('mapped').value, 41);
    await assert.rejects(f.accessory.sendCommands([{code:'mapped',value:44}]), {hapStatus:-70402});
    assert.equal(f.writes.length, 1);
  });
}
test('non-script schema mappings and ordinary writes still work with default settings', async () => {
  const f = fixture({}, 'device-a', {onGet:undefined,onSet:undefined});
  assert.equal(f.accessory.getSchema('mapped').code, 'mapped');
  assert.equal(f.accessory.getStatus('mapped').value,20);
  await f.accessory.sendCommands([{code:'mapped',value:30},{code:'switch_1',value:true}]);
  assert.deepEqual(f.writes[0].commands,[{code:'raw',value:30},{code:'switch_1',value:true}]);
});
test('disabled scripted debounced writes never touch the send queue', async () => {
  const f = fixture();
  await assert.rejects(f.accessory.sendCommands([{code:'mapped',value:40}], true), {hapStatus:-70402});
  assert.equal(f.accessory.sendQueue.size, 0);
  assert.equal(f.writes.length,0);
});
test('enabled expression errors are reported without logging the expression or exception', async () => {
  const f = fixture({[key]:true}, 'device-a', {onGet:'throw new Error("PRIVATE_MARKER")', onSet:'throw new Error("PRIVATE_MARKER")'});
  assert.throws(() => f.accessory.getStatus('mapped'), {hapStatus:-70402});
  await assert.rejects(f.accessory.sendCommands([{code:'mapped',value:40}]), {hapStatus:-70402});
  assert.equal(f.writes.length, 0);
  assert.ok(f.warnings.some(x => x.includes('JavaScript device override failed')));
  assert.ok(!f.warnings.join('\n').includes('PRIVATE_MARKER'));
});
test('runtime validation normalizes flags strictly, retains scripts, warns without dumping them', () => {
  for (const flag of [undefined, false, 'true', 1, true]) {
    const f = fixture({[key]:flag,userCode:'fixture'});
    f.platform.config = {options:f.platform.options};
    assert.equal(f.platform.validate(),true);
    assert.equal(f.platform.options[key],flag === true);
    assert.equal(f.platform.options.deviceOverrides[0].schema[0].onGet,f.scripted.onGet);
    assert.ok(f.warnings.some(x => x.includes(flag === true ? 'Unsafe JavaScript device overrides are enabled' : 'JavaScript device overrides are disabled')));
    assert.ok(!f.warnings.join('\n').includes('this.readCount'));
  }
});
test('duplicate override merge cannot turn on the platform flag through a prototype key', () => {
  const f = fixture();
  f.platform.options.deviceOverrides.push(JSON.parse('{"id":"device-a","__proto__":{"allowUnsafeJavaScriptOverrides":true}}'));
  assert.equal(f.platform.validateDeviceOverrides(),true);
  assert.equal(f.accessory.canRunJavaScriptOverrides(),false);
  assert.equal(Object.prototype[key],undefined);
});
test('settings schema defaults off; custom UI loads and stages explicit enable/disable without deleting scripts', () => {
  const schema = require('../config.schema.json');
  const props = schema.schema.properties.options.properties;
  assert.equal(props[key].type,'boolean'); assert.equal(props[key].default,false);
  assert.ok(schema.layout.some(x => x.items?.includes(`options.${key}`)));
  const ui = readFileSync(require.resolve('../homebridge-ui/public/index.html'),'utf8');
  const script = ui.split('<script>')[1].split('</script>')[0].replace("  window.homebridge.addEventListener('ready', init);", '  window.testUi = { applyPlatformConfigFromServer, normaliseConfig, ensureConfig };');
  const controls = new Map();
  const document = {getElementById(id) {if (!controls.has(id)) controls.set(id,{value:'',checked:false}); return controls.get(id);}};
  const context = {window:{}, document, console};
  vm.runInNewContext(script,context);
  const api = context.window.testUi;
  const original = {options:{[key]:true,deviceOverrides:[{id:'global',schema:[{code:'x',onGet:'value+1'}]}]}};
  api.applyPlatformConfigFromServer(original);
  const checkbox = document.getElementById('tuyaNodevAllowUnsafeJavaScriptOverrides');
  assert.equal(checkbox.checked,true);
  assert.equal(api.ensureConfig().options[key],true);
  checkbox.checked=false;
  assert.equal(api.ensureConfig().options[key],false);
  assert.deepEqual(plain(api.ensureConfig().options.deviceOverrides),original.options.deviceOverrides);
  api.applyPlatformConfigFromServer({options:{[key]:'true'}});
  assert.equal(checkbox.checked,false);
  assert.equal(api.ensureConfig().options[key],false);
});
test('a per-device opt-in cannot enable platform-wide execution', async () => {
  const f = fixture();
  f.platform.options.deviceOverrides[0][key] = true;
  assert.equal(f.accessory.getStatus('mapped').value,20);
  await assert.rejects(f.accessory.sendCommands([{code:'mapped',value:42}]),{hapStatus:-70402});
  assert.equal(f.accessory.readCount + f.accessory.writeCount,0);
});
test('legacy oldCode aliases respect the same write gate and work after explicit opt-in', async () => {
  const f = fixture({}, 'device-a', {code:'mapped',oldCode:'raw',newCode:undefined});
  assert.equal(f.accessory.getStatus('mapped').value,20);
  await assert.rejects(f.accessory.sendCommands([{code:'mapped',value:42}]),{hapStatus:-70402});
  f.platform.options[key]=true;
  assert.equal(f.accessory.getStatus('mapped').value,21);
  await f.accessory.sendCommands([{code:'mapped',value:42}]);
  assert.deepEqual(f.writes[0].commands,[{code:'raw',value:41}]);
});
test('settings backend normalises only explicit Boolean true and preserves scripts on disk', async () => {
  const file = require.resolve('../homebridge-ui/server.js');
  const source = readFileSync(file,'utf8').replace("await import('@homebridge/plugin-ui-utils')",'uiMock');
  const serverRequire = createRequire(file);
  let server;
  const uiMock = {HomebridgePluginUiServer:class {onRequest(){} ready(){server=this;}},RequestError:class extends Error {}};
  await vm.runInNewContext(source,{uiMock,require(name){
    if (name==='qrcode') return {};
    if (name==='../dist/cloud/device/TuyaHADeviceManager') return {default:class {}};
    return serverRequire(name);
  }});
  assert.ok(server);
  let disk = {platforms:[]};
  server.readHomebridgeConfigFile=async()=>plain(disk);
  server.writeHomebridgeConfigFile=async value=>{disk=plain(value);};
  server.readAdaptiveLightingState=async()=>null;
  server.backupTuyaPlatformConfig=async()=> 'fixture-backup';
  const overrides=[{id:'global',schema:[{code:'x',onGet:'value+1',onSet:'value-1'}]}];
  for (const value of [undefined,'true',1,true,false]) {
    const saved=await server.savePlatformConfigToDisk({platformConfig:{options:{[key]:value,deviceOverrides:overrides}}});
    assert.equal(saved.platformConfig.options[key],value===true);
    assert.equal(disk.platforms[0].options[key],value===true);
    assert.deepEqual(plain(saved.platformConfig.options.deviceOverrides),overrides);
  }
});
