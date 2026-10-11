"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Avoid loading Tuya/MQTT dependencies just to test the event handlers.
const moduleUnderTest = { exports: {} };
const platformCode = readFileSync(require.resolve('../dist/platform.js'), 'utf8');
const mockImports = {
  path,
  fs: require('node:fs'),
  './cloud/api/TuyaHACloudAPI': { default: class {} },
  './cloud/device/TuyaHADeviceManager': { default: class {} },
  './shared/accessories/AccessoryFactory': { default: class {} },
  './shared/util/util': { sanitizeName: value => value },
  './shared/util/ConfigHash': { ConfigHash: class {} },
  './settings': { PLUGIN_NAME: 'test-plugin', PLATFORM_NAME: 'TestPlatform' },
};
vm.runInNewContext(platformCode, {
  exports: moduleUnderTest.exports,
  require(name) {
    assert.ok(Object.prototype.hasOwnProperty.call(mockImports, name), `unexpected import: ${name}`);
    return mockImports[name];
  },
});
const { TuyaPlatform } = moduleUnderTest.exports;

function platformFixture() {
  const logs = { error: [], debug: [] };
  const platform = Object.create(TuyaPlatform.prototype);
  platform.log = {
    error: (...args) => logs.error.push(args.map(String).join(' ')),
    debug: (...args) => logs.debug.push(args.map(String).join(' ')),
  };
  platform.getAccessoryHandler = () => undefined;
  return { platform, logs };
}

function launchFixture(initDevices) {
  const callbacks = new Map();
  const { platform, logs } = platformFixture();
  // The actual constructor registers didFinishLaunching only after validate().
  // Bypass config validation to isolate the asynchronous listener behavior.
  const originalValidate = TuyaPlatform.prototype.validate;
  TuyaPlatform.prototype.validate = function () { return true; };
  let instance;
  try {
    instance = new TuyaPlatform(platform.log, { options: {} }, {
      hap: { Service: {}, Characteristic: {} },
      on: (event, callback) => callbacks.set(event, callback),
    });
  } finally {
    TuyaPlatform.prototype.validate = originalValidate;
  }
  instance.initDevices = initDevices;
  return { callbacks, logs, instance };
}

test('startup rejection is caught and logged with diagnostic stack', async () => {
  const err = new Error('test initialization rejection');
  const { callbacks, logs } = launchFixture(async () => { throw err; });
  await assert.doesNotReject(callbacks.get('didFinishLaunching')());
  assert.equal(logs.error.length, 2);
  assert.match(logs.error[0], /Device initialization failed/);
  assert.match(logs.error[0], /test initialization rejection/);
  assert.match(logs.error[1], /Initialization did not complete/);
});

test('synchronous initialization exceptions are also caught', async () => {
  const { callbacks, logs } = launchFixture(() => { throw new Error('sync startup failure'); });
  await assert.doesNotReject(callbacks.get('didFinishLaunching')());
  assert.match(logs.error[0], /sync startup failure/);
});

test('healthy initialization completes without errors', async () => {
  let called = 0;
  const { callbacks, logs } = launchFixture(async () => { called++; });
  await callbacks.get('didFinishLaunching')();
  assert.equal(called, 1);
  assert.equal(logs.error.length, 0);
});

for (const [method, action, label] of [
  ['updateAccessoryInfo', 'onDeviceInfoUpdate', 'Device info update failed'],
  ['updateAccessoryStatus', 'onDeviceStatusUpdate', 'Device status update failed'],
]) {
  test(`${method}: asynchronous handler rejection is caught and identifies device`, async () => {
    const { platform, logs } = platformFixture();
    platform.getAccessoryHandler = id => {
      assert.equal(id, 'test123');
      return { [action]: async () => { throw new Error('simulated async failure'); } };
    };
    await assert.doesNotReject(platform[method]({ id: 'test123', name: 'Test device' }, [{ code: 'dummy' }]));
    assert.equal(logs.error.length, 1);
    assert.match(logs.error[0], new RegExp(label));
    assert.match(logs.error[0], /Test device/);
    assert.match(logs.error[0], /simulated async failure/);
  });

  test(`${method}: synchronous exception is caught`, async () => {
    const { platform, logs } = platformFixture();
    platform.getAccessoryHandler = () => ({ [action]: () => { throw new Error('simulated sync failure'); } });
    await assert.doesNotReject(platform[method]({ id: 'xyz' }, {}));
    assert.match(logs.error[0], /simulated sync failure/);
  });

  test(`${method}: missing handlers and valid updates do not log errors`, async () => {
    const { platform, logs } = platformFixture();
    await platform[method]({ id: 'none' }, {});
    let called = 0;
    platform.getAccessoryHandler = () => ({ [action]: async () => { called++; } });
    await platform[method]({ id: 'ok' }, {});
    assert.equal(called, 1);
    assert.equal(logs.error.length, 0);
  });

  test(`${method}: lookup failures and missing device objects are caught`, async () => {
    const { platform, logs } = platformFixture();
    platform.getAccessoryHandler = () => { throw new Error('lookup failed'); };
    await assert.doesNotReject(platform[method](null, {}));
    assert.match(logs.error[0], /lookup failed/);
    assert.match(logs.error[0], /unknown device/);
  });
}
