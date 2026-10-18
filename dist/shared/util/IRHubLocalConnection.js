"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const RECONNECT_MIN_MS = 5 * 1000;
const RECONNECT_MAX_MS = 5 * 60 * 1000;
/**
 * Read-only LAN connection to a Tuya IR hub (e.g. category `hwktwkq` "Smart AC Controller").
 *
 * The Tuya QR cloud exposes IR remotes with write-only functions and no state, but IR hubs
 * with a built-in thermostat keep the AC state (including changes made with the physical
 * remote), room temperature and humidity in local data points. This keeps a persistent
 * connection to the hub and emits every data-point report as a `dps` event.
 *
 * Uses the optional `tuyapi` package; when it is missing the connection logs once and stays idle.
 */
class IRHubLocalConnection extends events_1.default {
    constructor(options, log) {
        super();
        this.options = options;
        this.log = log;
        this.device = undefined;
        this.stopped = false;
        this.connected = false;
        this.reconnectTimer = undefined;
        this.reconnectDelay = RECONNECT_MIN_MS;
    }
    start() {
        this.stopped = false;
        this.connect();
    }
    stop() {
        this.stopped = true;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        if (this.device) {
            try {
                this.device.disconnect();
            }
            catch {
                // ignore
            }
        }
    }
    createDevice() {
        let TuyAPI;
        try {
            TuyAPI = require('tuyapi');
        }
        catch {
            this.log.warn('[IR hub] Local state disabled: the optional "tuyapi" package is not installed.');
            return undefined;
        }
        const { id, key, ip, version } = this.options;
        const device = new TuyAPI({ id, key, ip, version: String(version || '3.3'), issueGetOnConnect: true });
        device.on('connected', () => {
            this.connected = true;
            this.reconnectDelay = RECONNECT_MIN_MS;
            this.log.info(`[IR hub] Connected to ${device.device.ip} for local state.`);
        });
        device.on('disconnected', () => {
            const wasConnected = this.connected;
            this.connected = false;
            if (wasConnected) {
                this.log.info('[IR hub] Local connection closed.');
            }
            this.scheduleReconnect();
        });
        device.on('error', (error) => {
            this.log.debug(`[IR hub] Local connection error: ${error?.message || error}`);
        });
        device.on('data', (data) => {
            if (data && data.dps && typeof data.dps === 'object') {
                this.emit('dps', data.dps);
            }
        });
        return device;
    }
    async connect() {
        if (this.stopped) {
            return;
        }
        if (!this.device) {
            this.device = this.createDevice();
            if (!this.device) {
                return;
            }
        }
        try {
            if (!this.device.device.ip) {
                await this.device.find({ timeout: 15 });
            }
            await this.device.connect();
        }
        catch (error) {
            this.log.debug(`[IR hub] Local connect failed: ${error?.message || error}`);
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) {
            return;
        }
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, delay);
    }
}
exports.default = IRHubLocalConnection;
