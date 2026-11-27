'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const PLATFORM = 'TuyaNoDeveloperAccount';
const OTHER_SECRET = 'fake-other-plugin-password-123';
const BRIDGE_SECRET = 'fake-bridge-pin-123';
const OTHER_ACCESSORY_SECRET = 'fake-accessory-token-123';
const plain = value => JSON.parse(JSON.stringify(value));
const platform = () => ({platform: PLATFORM, name: 'Tuya', options: {enableAdaptiveLighting: false, deviceOverrides: [{id: 'device-a', switchNames: {switch_1:'Old name'}}]}});
const config = () => ({bridge:{pin:BRIDGE_SECRET}, accessories:[{accessory:'Other',token:OTHER_ACCESSORY_SECRET}], platforms:[{platform:'Other',password:OTHER_SECRET}, platform(), {...platform(), name:'Second Tuya'}]});

async function fixture(t, initial = config(), fsMock = fs) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tuya-backup-test-'));
  t.after(() => fs.promises.rm(dir, {recursive:true,force:true}));
  const file = require.resolve('../homebridge-ui/server.js');
  const source = fs.readFileSync(file, 'utf8').replace("await import('@homebridge/plugin-ui-utils')", 'uiMock');
  const serverRequire = createRequire(file);
  let server;
  const uiMock = {HomebridgePluginUiServer: class {onRequest(){} ready(){server=this;}}, RequestError:class extends Error {}};
  await vm.runInNewContext(source, {uiMock, require(name) {
    if (name === 'fs') return fsMock;
    if (name === 'qrcode') return {};
    if (name === '../dist/cloud/device/TuyaHADeviceManager') return {default:class {}};
    return serverRequire(name);
  }});
  server.homebridgeStoragePath = dir;
  const active = path.join(dir, 'config.json');
  const backup = path.join(dir, 'tuya-settings-backup.json');
  await fs.promises.writeFile(active, JSON.stringify(initial), {mode:0o600});
  const read = async file => JSON.parse(await fs.promises.readFile(file, 'utf8'));
  const verify = async expected => {
    const raw = await fs.promises.readFile(backup, 'utf8');
    for (const secret of [OTHER_SECRET, BRIDGE_SECRET, OTHER_ACCESSORY_SECRET, 'Second Tuya']) assert.ok(!raw.includes(secret));
    const snapshot = JSON.parse(raw);
    assert.equal(snapshot.version,1);
    assert.ok(Number.isFinite(Date.parse(snapshot.savedAt)));
    assert.deepEqual(snapshot.platformConfig, expected);
    assert.deepEqual(Object.keys(snapshot).sort(), ['adaptiveLightingState','platformConfig','savedAt','version']);
    if (process.platform !== 'win32') assert.equal((await fs.promises.stat(backup)).mode & 0o777, 0o600);
    const backups = (await fs.promises.readdir(dir)).filter(name => name.startsWith('tuya-settings-backup.json') || name.startsWith('config.json.bak-'));
    assert.deepEqual(backups, ['tuya-settings-backup.json']);
    const current = await read(active);
    assert.deepEqual(current.bridge, initial.bridge);
    assert.deepEqual(current.accessories, initial.accessories);
    assert.deepEqual(current.platforms.filter(p=>p.platform !== PLATFORM), initial.platforms.filter(p=>p.platform !== PLATFORM));
    if (initial.platforms.length === 3) assert.deepEqual(current.platforms[2],initial.platforms[2]);
    return snapshot;
  };
  return {dir, server, active, backup, read, verify};
}

test('platform settings save snapshots only the previous Tuya block, not unrelated credentials', async t => {
  const f = await fixture(t);
  const result = await f.server.savePlatformConfigToDisk({platformConfig:{...platform(),name:'New name'}});
  assert.equal(result.backup,f.backup);
  assert.equal((await f.verify(platform())).adaptiveLightingState,null);
  assert.equal((await f.read(f.active)).platforms[1].name,'New name');
});
test('adaptive lighting save snapshots old platform and old guard state', async t => {
  const f = await fixture(t);
  const previous = plain(await f.server.writeAdaptiveLightingState(false));
  const result = await f.server.saveAdaptiveLightingToDisk({enabled:true});
  assert.equal(result.backup,f.backup);
  const snapshot = await f.verify(platform());
  assert.deepEqual(snapshot.adaptiveLightingState,{enabled:false,updatedAt:previous.updatedAt});
  assert.equal((await f.read(f.active)).platforms[1].options.enableAdaptiveLighting,true);
  assert.equal((await f.server.readAdaptiveLightingState()).enabled,true);
});
test('adaptive lighting repair snapshots old unnormalised platform and retains authoritative guard', async t => {
  const initial = config(); delete initial.platforms[1].options.deviceOverrides;
  const f = await fixture(t,initial);
  await f.server.writeAdaptiveLightingState(true);
  const result = await f.server.getPlatformConfigFromDisk();
  assert.equal(result.repaired,true); assert.equal(result.backup,f.backup);
  assert.equal((await f.verify(initial.platforms[1])).adaptiveLightingState.enabled,true);
  assert.equal((await f.read(f.active)).platforms[1].options.enableAdaptiveLighting,true);
});
test('HomeKit channel name save and removal share the rolling snapshot', async t => {
  const f = await fixture(t);
  const result = await f.server.saveSwitchNamesToDisk({id:'device-a',switchNames:{switch_1:'New name'}});
  assert.equal(result.backup,f.backup); await f.verify(platform());
  const previous = (await f.read(f.active)).platforms[1];
  const removed = await f.server.removeSwitchNamesFromDisk({id:'device-a'});
  assert.equal(removed.backup,f.backup); assert.equal(removed.removed,true);
  await f.verify(previous);
  assert.ok(!(await f.read(f.active)).platforms[1].options.deviceOverrides.some(x=>x.switchNames));
});
test('first installation records null instead of backing up other plugins', async t => {
  const initial = config(); initial.platforms = [initial.platforms[0]];
  const f = await fixture(t,initial);
  await f.server.savePlatformConfigToDisk({platformConfig:platform()});
  await f.verify(null);
});
test('ordinary settings read creates no backup', async t => {
  const f = await fixture(t);
  const result = await f.server.getPlatformConfigFromDisk();
  assert.equal(result.repaired,false);
  await assert.rejects(fs.promises.stat(f.backup),{code:'ENOENT'});
});
test('repeated and concurrent backup calls leave just one valid owner-only snapshot', async t => {
  const f = await fixture(t);
  for (let i=0;i<10;i++) await f.server.backupTuyaPlatformConfig(config());
  await Promise.all(Array.from({length:12},()=>f.server.backupTuyaPlatformConfig(config())));
  await f.verify(platform());
});
test('existing backup symlink is replaced, not followed', {skip:process.platform==='win32'}, async t => {
  const f = await fixture(t);
  const target = path.join(f.dir,'unrelated.json');
  await fs.promises.writeFile(target,'DO NOT TOUCH');
  await fs.promises.symlink(target,f.backup);
  await f.server.backupTuyaPlatformConfig(config());
  assert.equal(await fs.promises.readFile(target,'utf8'),'DO NOT TOUCH');
  assert.equal((await fs.promises.lstat(f.backup)).isFile(),true);
  await f.verify(platform());
});
test('failed snapshot rename preserves previous backup and active config, cleans temp file', async t => {
  let fail = false;
  const fsMock = {...fs, promises:{...fs.promises, rename:async (...args)=>{
    if (fail) throw Object.assign(new Error('synthetic rename failure'),{code:'EIO'});
    return fs.promises.rename(...args);
  }}};
  const f = await fixture(t,config(),fsMock);
  await f.server.backupTuyaPlatformConfig(config());
  const previous = await fs.promises.readFile(f.backup,'utf8');
  const active = await fs.promises.readFile(f.active,'utf8');
  fail = true;
  await assert.rejects(f.server.savePlatformConfigToDisk({platformConfig:{...platform(),name:'Not saved'}}),/synthetic rename failure/);
  assert.equal(await fs.promises.readFile(f.backup,'utf8'),previous);
  assert.equal(await fs.promises.readFile(f.active,'utf8'),active);
  await f.verify(platform());
});
test('legacy full-config backups are not silently deleted or rewritten', async t => {
  const f = await fixture(t);
  const legacy = `${f.active}.bak-tuya-ui-1234567890`;
  const unrelated = `${f.active}.backup`;
  for (const file of [legacy,unrelated]) await fs.promises.writeFile(file,'old backup');
  await f.server.backupTuyaPlatformConfig(config());
  for (const file of [legacy,unrelated]) assert.equal(await fs.promises.readFile(file,'utf8'),'old backup');
  assert.deepEqual((await fs.promises.readdir(f.dir)).sort(),['config.json','config.json.bak-tuya-ui-1234567890','config.json.backup','tuya-settings-backup.json'].sort());
});
