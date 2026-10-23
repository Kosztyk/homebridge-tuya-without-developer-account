"use strict";
const { EventEmitter } = require('events');
const RECONNECT_MIN_MS = 5000, RECONNECT_MAX_MS = 300000;
// This connection is read-only. All IR commands still use Tuya QR cloud.
class IRHubLocalConnection extends EventEmitter {
  constructor(options, log) {
    super();
    this.options = options; this.log = log;
    this.device = undefined; this.stopped = true; this.connected = false;
    this.reconnectTimer = undefined; this.reconnectDelay = RECONNECT_MIN_MS;
    this.failedAttempts = 0; this.connecting = false; this.missingWarned = false;
  }
  start() { if (!this.stopped) return; this.stopped = false; void this.connect(); }
  stop() {
    this.stopped = true; this.connected = false;
    clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined;
    if (this.device) { try { this.device.disconnect(); } catch { /* no-op */ } }
  }
  createDevice() {
    let TuyAPI;
    try { TuyAPI = require('tuyapi'); }
    catch {
      if (!this.missingWarned) this.log.warn('[IR hub] Local status unavailable: optional dependency tuyapi not installed.');
      this.missingWarned = true;
      return undefined;
    }
    const { id, key, ip, version } = this.options;
    const device = new TuyAPI({ id, key, ip, version: String(version || '3.3'), issueGetOnConnect: true });
    device.on('connected', () => { if (this.stopped) return; this.connected = true; this.failedAttempts = 0; this.reconnectDelay = RECONNECT_MIN_MS; this.log.info('[IR hub] Connected on LAN for AC state.'); });
    device.on('disconnected', () => { this.connected = false; this.scheduleReconnect(); });
    device.on('error', e => { if (!this.stopped) this.log.debug(`[IR hub] Connection error: ${e?.message || e}`); });
    device.on('data', data => { if (!this.stopped && data?.dps && typeof data.dps === 'object') this.emit('dps', data.dps); });
    // tuyapi emits partial hub STATUS reports without DP 1 as `dp-refresh`,
    // not `data`. Both event types contain useful AC and sensor state updates.
    device.on('dp-refresh', data => { if (!this.stopped && data?.dps && typeof data.dps === 'object') this.emit('dps', data.dps); });
    return device;
  }
  async discover() {
    const previous = this.device.device.ip;
    this.device.device.ip = undefined; // tuyapi find() skips discovery when an IP is already set
    try { await this.device.find({ timeout: 15 }); }
    finally { this.device.device.ip = this.device.device.ip || previous; }
    if (previous && previous !== this.device.device.ip) this.log.info('[IR hub] Rediscovered LAN address after network change.');
  }
  async connect() {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    try {
      if (!this.device) this.device = this.createDevice();
      if (!this.device || this.stopped) return;
      if (!this.device.device.ip || this.failedAttempts > 0) await this.discover();
      if (this.stopped) return;
      await this.device.connect();
      this.failedAttempts = 0;
    } catch (error) {
      this.failedAttempts++;
      this.log.debug(`[IR hub] Local status retry: ${error?.message || error}`);
      this.scheduleReconnect();
    } finally { this.connecting = false; }
  }
  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(RECONNECT_MAX_MS, delay * 2);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; void this.connect(); }, delay);
    this.reconnectTimer.unref?.();
  }
}
module.exports = IRHubLocalConnection;
