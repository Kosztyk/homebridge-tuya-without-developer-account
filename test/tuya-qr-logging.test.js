'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { format } = require('node:util');
const Api = require('../dist/cloud/api/TuyaHACloudAPI').default;
const util = require('../dist/shared/util/util');

// The same marker identifies values in paths, response fields, and error messages.
const marker = 'SYNTHETIC_CREDENTIAL_20_';
const userCode = marker + 'user';
const qr = marker + 'qr/?';
const tokens = { access_token: marker + 'access', refresh_token: marker + 'refresh' };
const captureLogs = t => {
  const logs = [];
  for (const level of ['log', 'debug', 'info', 'warn', 'error']) {
    t.mock.method(console, level, (...args) => logs.push(format(...args)));
  }
  return logs;
};

function mockHttps(t, replies) {
  t.mock.method(https, 'request', (_options, onResponse) => {
    const request = new EventEmitter();
    request.write = () => true;
    request.end = () => {
      assert.ok(replies.length, 'Unexpected HTTPS request');
      const reply = replies.shift();
      if (reply instanceof Error) return request.emit('error', reply);
      onResponse(Readable.from([typeof reply === 'string' ? reply : JSON.stringify(reply)]));
    };
    return request;
  });
}

for (const [mode, pluginDebug, bridgeFlag] of [
  ['debug off', false], ['plugin debug', true], ['Homebridge -D', false, '-D'],
  ['Homebridge --debug', false, '--debug'],
]) {
  test(`QR creation and sign-in keep credentials out of logs with ${mode}`, async t => {
    const logs = captureLogs(t);
    if (bridgeFlag) {
      const index = process.argv.push(bridgeFlag) - 1;
      t.after(() => process.argv.splice(index, 1));
    }
    mockHttps(t, [{ success: true, result: { qrcode: qr } }, { success: true, result: tokens }]);
    const api = new Api(userCode, '', 'https://example.invalid', undefined, console, pluginDebug);
    assert.equal((await api.getQRCodeToken()).result.qrcode, qr);
    assert.deepEqual((await api.getQRCodeLoginResult(qr)).result, tokens);
    assert.ok(!logs.join('\n').includes(marker), 'A synthetic credential reached the log');
    if (pluginDebug || bridgeFlag) {
      assert.match(logs.join('\n'), /QR sign-in response \(success=true/);
    } else {
      assert.equal(logs.length, 0);
    }
  });
}

test('refresh, persistence failures, and broker configuration expose only safe diagnostics', async t => {
  const logs = captureLogs(t);
  const rotated = { accessToken: marker + 'new-access', refreshToken: marker + 'new-refresh' };
  const broker = { username: marker + 'mqtt-user', password: marker + 'mqtt-password' };
  mockHttps(t, [
    { success: true, result: 'fake-encrypted-envelope' },
    { success: true, result: broker },
    { success: false, code: 1109, msg: marker + 'error-echo', result: tokens },
  ]);
  let saved;
  const api = new Api(userCode, marker + 'terminal', 'https://example.invalid', tokens, console, true, value => {
    saved = value;
    throw new Error(marker + 'storage-path');
  });
  t.mock.method(api, 'aesGcmDecrypt', () => JSON.stringify(rotated));
  assert.equal(await api.refreshAccessTokenIfNeed(true), true);
  assert.equal(saved.refresh_token, rotated.refreshToken);
  assert.equal(api.exportTokenInfo().access_token, rotated.accessToken);
  assert.deepEqual((await api.post('/v1.0/m/life/ha/access/config', { linkId: marker + 'link' })).result, broker);
  assert.equal(await api.refreshAccessTokenIfNeed(true), false);
  assert.ok(!logs.join('\n').includes(marker), 'A synthetic credential reached the log');
  assert.doesNotMatch(logs.join('\n'), /encdata|\/v1\.0\//);
  assert.match(logs.join('\n'), /Could not save the refreshed Tuya token/);
  assert.match(logs.join('\n'), /code=1109/);
});

test('malformed replies and transport errors cannot echo authentication data to calling loggers', async t => {
  const logs = captureLogs(t);
  t.mock.method(util, 'retry', send => send());
  mockHttps(t, [marker + 'invalid-json', Object.assign(new Error(marker + 'transport'), { code: 'ECONNRESET' })]);
  const api = new Api(userCode, '', 'https://example.invalid', undefined, console, true);
  await assert.rejects(api.getQRCodeLoginResult(qr), { message: 'Tuya QR sign-in returned invalid JSON.' });
  await assert.rejects(api.getQRCodeToken(), { message: 'Tuya QR code creation request failed (ECONNRESET).' });
  assert.ok(!logs.join('\n').includes(marker), 'A synthetic credential reached the log');
});

test('cloud error responses keep vendor text out of device and MQTT warnings', async t => {
  const DeviceManager = require('../dist/cloud/device/TuyaHADeviceManager').default;
  const SharingMQ = require('../dist/cloud/api/TuyaHASharingMQ').default;
  const logs = captureLogs(t);
  const api = new Api(userCode, '', 'https://example.invalid', tokens, console, true);
  const failure = { success: false, code: '1106', msg: marker + 'vendor-echo', result: tokens };
  mockHttps(t, Array(5).fill(failure));
  const manager = new DeviceManager(api, true);
  await manager.updateDevices(['fixture']);
  await manager.getDeviceSchema('fixture');
  await manager.sendCommands('fixture', [{ code: 'switch', value: true }]);
  await manager.getSceneList('fixture');
  await new SharingMQ(api, [], [], console, true).connect();
  assert.match(logs.join('\n'), /device specification.*code=1106/);
  assert.match(logs.join('\n'), /MQTT config failed \(code=1106\)/);
  assert.ok(!logs.join('\n').includes(marker), 'A synthetic credential reached a cloud error log');
});

test('the settings UI returns safe errors and saves credentials only on complete sign-in', async t => {
  const { HomebridgePluginUiServer } = await import('@homebridge/plugin-ui-utils');
  const logs = captureLogs(t);
  // The UI normally runs as an IPC child. Capture the real handlers in this test process.
  if (!process.send) {
    process.send = () => {};
    t.after(() => { delete process.send; });
  }
  for (const event of ['message', 'disconnect']) {
    const original = new Set(process.listeners(event));
    t.after(() => {
      for (const listener of process.listeners(event)) {
        if (!original.has(listener)) process.off(event, listener);
      }
    });
  }
  const ready = new Promise(resolve => {
    t.mock.method(HomebridgePluginUiServer.prototype, 'ready', function () { resolve(this); });
  });
  require('../homebridge-ui/server');
  const ui = await ready;
  t.mock.method(ui, 'readAuthFile', async () => null);
  let saved;
  t.mock.method(ui, 'writeAuthFile', async (_code, data) => { saved = data; return 'fixture.json'; });
  t.mock.method(ui, 'sendResponse', (_request, data, success = true) => ({ data, success }));
  const request = path => ui.processRequest({ path, body: { userCode } });
  mockHttps(t, [
    { success: false, code: '1109', msg: marker + 'echo', result: tokens },
    { success: true, result: tokens },
    { success: true, result: { qrcode: qr } },
    { success: false, code: marker + 'invalid-code', msg: marker + 'pending' },
    { success: true, result: { access_token: tokens.access_token } },
    { success: true, result: { ...tokens, endpoint: 'https://example.invalid', terminal_id: 'fixture' } },
  ]);
  for (let i = 0; i < 2; i++) {
    const reply = await request('/qr/start');
    assert.equal(reply.success, false);
    assert.deepEqual(reply.data.error, { status: 502 });
    assert.ok(!JSON.stringify(reply.data).includes(marker));
  }
  assert.equal((await request('/qr/start')).data.token, qr);
  const pending = (await request('/qr/status')).data;
  assert.equal(pending.pending, true);
  assert.equal(pending.code, null);
  assert.ok(!JSON.stringify(pending).includes(marker));
  const incomplete = await request('/qr/status');
  assert.equal(incomplete.success, false);
  assert.deepEqual(incomplete.data.error, { status: 502 });
  assert.ok(!JSON.stringify(incomplete.data).includes(marker));
  assert.equal(saved, undefined);
  const complete = (await request('/qr/status')).data;
  assert.equal(complete.authenticated, true);
  assert.ok(!JSON.stringify(complete).includes(marker));
  assert.equal(saved.tokenInfo.refresh_token, tokens.refresh_token);
  assert.ok(!logs.join('\n').includes(marker), 'A synthetic credential reached the UI log');
});

test('MQTT connection and payload errors never expose broker credentials', async t => {
  const { readFileSync } = require('node:fs');
  const { createRequire } = require('node:module');
  const vm = require('node:vm');
  const filename = require.resolve('../dist/cloud/api/TuyaHASharingMQ');
  const realRequire = createRequire(filename);
  const mqtt = { connect() {} };
  const exports = {};
  vm.runInNewContext(readFileSync(filename, 'utf8'), { exports, require: name => name === 'mqtt' ? mqtt : realRequire(name), console, setTimeout, clearTimeout });
  const SharingMQ = exports.default;
  const logs = captureLogs(t);
  const config = { url: 'ssl://example.invalid:8883', clientId: marker + 'client', username: marker + 'broker-user', password: marker + 'broker-pass' };
  const api = { post: async () => ({ success: true, result: config }) };
  const sharing = new SharingMQ(api, [], [], console, true);
  const client = new EventEmitter();
  client.end = () => {};
  t.after(() => sharing.stop());
  const mock = t.mock.method(mqtt, 'connect', (_url, options) => {
    assert.equal(options.password, config.password);
    return client;
  });
  await sharing.connect();
  client.emit('error', new Error(marker + 'broker-error'));
  let delivered;
  sharing.addMessageListener(message => { delivered = message; });
  const message = { data: { secret: marker + 'payload' } };
  client.emit('message', 'fixture', Buffer.from(JSON.stringify(message)));
  assert.equal(JSON.stringify(delivered), JSON.stringify(message));
  client.emit('message', 'fixture', Buffer.from(marker + 'malformed'));
  sharing.stop();
  mock.mock.mockImplementation(() => { throw new Error(marker + 'connect-error'); });
  await assert.rejects(sharing.connect(), { message: 'Could not initialize the Tuya HA MQTT connection.' });
  sharing.config = null;
  assert.ok(!logs.join('\n').includes(marker));
  assert.match(logs.join('\n'), /MQTT connection error/);
  assert.match(logs.join('\n'), /Could not process Tuya HA MQTT message/);
});
