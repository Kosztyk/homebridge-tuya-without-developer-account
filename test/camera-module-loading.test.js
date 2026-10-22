"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { TuyaStreamingDelegate } = require('../dist/shared/util/TuyaStreamDelegate');

function fixture() {
    const errors = [];
    class CameraController {
        static generateSynchronisationSource() { return 42; }
    }
    const camera = {
        platform: { api: { hap: { CameraController } } },
        log: { debug() {}, info() {}, warn() {}, error: message => errors.push(message) },
        device: { online: true, id: 'test-camera' },
        deviceManager: { api: { post: async () => { throw new Error('Camera allocation failed'); } } },
    };
    return { delegate: new TuyaStreamingDelegate(camera), errors };
}

function prepareRequest() {
    return {
        sessionID: 'test-session', targetAddress: '127.0.0.1', addressVersion: 'ipv4',
        video: { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) },
        audio: { port: 5002, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) },
    };
}

function startRequest() {
    return { type: 'start', sessionID: 'test-session', video: { width: 640, height: 360, fps: 15, max_bit_rate: 256 } };
}

function runWithTsx(source) {
    return spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, '-e', source], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000,
    });
}

test('the published initializer loads under the tsx runner used by Homebridge verification', () => {
    const entry = require.resolve('../dist/index.js');
    const source = `const init = require(${JSON.stringify(entry)}); let registered; init({registerPlatform: (...args) => { registered = args; }}); if (typeof init !== 'function' || registered[0] !== 'TuyaNoDeveloperAccount') process.exit(1);`;
    const result = runWithTsx(source);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('camera utilities also work when a stream is prepared under tsx', () => {
    const entry = require.resolve('../dist/shared/util/TuyaStreamDelegate');
    const source = `
        const { TuyaStreamingDelegate } = require(${JSON.stringify(entry)});
        const delegate = Object.create(TuyaStreamingDelegate.prototype);
        delegate.camera = { log: { error() {} } };
        delegate.hap = { CameraController: { generateSynchronisationSource: () => 42 } };
        delegate.pendingSessions = {};
        const media = { port: 5000, srtpCryptoSuite: 0, srtp_key: Buffer.alloc(16), srtp_salt: Buffer.alloc(14) };
        const request = { sessionID: 'tsx-test', targetAddress: '127.0.0.1', addressVersion: 'ipv4', audio: media, video: media };
        delegate.prepareStream(request, (error, response) => {
            if (error || !response?.video?.port || !response?.audio?.port) {
                console.error(error || 'Missing stream ports'); process.exitCode = 1;
            }
        }).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const result = runWithTsx(source);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('camera preparation loads the ESM utilities and returns usable audio/video ports', async () => {
    const { delegate } = fixture();
    const request = prepareRequest();
    const calls = [];
    await delegate.prepareStream(request, (...args) => calls.push(args));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], undefined);
    const response = calls[0][1];
    for (const media of ['audio', 'video']) {
        assert.ok(Number.isInteger(response[media].port) && response[media].port > 0);
        assert.deepEqual(response[media].srtp_key, request[media].srtp_key);
    }
    assert.equal(delegate.pendingSessions[request.sessionID].videoIncomingPort, response.video.port);
});

test('an asynchronous preparation failure reaches the callback without rejecting', async () => {
    const { delegate, errors } = fixture();
    delegate.hap.CameraController.generateSynchronisationSource = () => { throw new Error('SSRC preparation failed'); };
    const calls = [];
    await assert.doesNotReject(delegate.prepareStream(prepareRequest(), (...args) => calls.push(args)));
    assert.equal(calls.length, 1);
    assert.match(calls[0][0].message, /SSRC preparation failed/);
    assert.equal(Object.keys(delegate.pendingSessions).length, 0);
    assert.match(errors[0], /Failed to prepare camera stream/);
});

test('an asynchronous stream start failure reaches the callback once', async () => {
    const { delegate, errors } = fixture();
    delegate.startStream = async () => { throw new Error('Camera allocation failed'); };
    const calls = [];
    await assert.doesNotReject(delegate.handleStreamRequest(startRequest(), (...args) => calls.push(args)));
    assert.equal(calls.length, 1);
    assert.match(calls[0][0].message, /Camera allocation failed/);
    assert.match(errors[0], /Failed to start camera stream/);
});

test('a missing prepared session returns one error and stops stream startup', async () => {
    const { delegate } = fixture();
    const calls = [];
    await assert.doesNotReject(delegate.handleStreamRequest(startRequest(), (...args) => calls.push(args)));
    assert.equal(calls.length, 1);
    assert.match(calls[0][0].message, /Error finding session information/);
    assert.equal(Object.keys(delegate.ongoingSessions).length, 0);
});

test('snapshot allocation errors after ESM loading reach the snapshot callback', async () => {
    const { delegate } = fixture();
    const calls = [];
    await assert.doesNotReject(delegate.handleSnapshotRequest({ width: 640, height: 360 }, (...args) => calls.push(args)));
    assert.equal(calls.length, 1);
    assert.match(calls[0][0].message, /Camera allocation failed/);
});
