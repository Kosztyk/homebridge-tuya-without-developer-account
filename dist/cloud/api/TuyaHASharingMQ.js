"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable max-len */
const mqtt_1 = __importDefault(require("mqtt"));
const url_1 = require("url");
const util_1 = require("../../shared/util/util");
const Logger_1 = require("../../shared/util/Logger");
class TuyaHASharingMQ {
    constructor(api, ownerIds, devices, log = console, debug = false) {
        this.api = api;
        this.ownerIds = ownerIds;
        this.devices = devices;
        this.log = log;
        this.debug = debug;
        this.messageListeners = new Set();
        this.log = new Logger_1.PrefixLogger(log, TuyaHASharingMQ.name, debug);
    }
    async start() {
        await this.connect();
    }
    stop() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.client) {
            this.client.removeAllListeners();
            this.client.end(true);
            this.client = undefined;
        }
    }
    addMessageListener(listener) {
        this.messageListeners.add(listener);
    }
    removeMessageListener(listener) {
        this.messageListeners.delete(listener);
    }
    subscribeDevice(deviceId, supportLocal = false) {
        if (!this.client || !this.config) {
            return;
        }
        this.client.subscribe(this.subscribeTopic(deviceId, supportLocal));
    }
    unSubscribeDevice(deviceId, supportLocal = false) {
        if (!this.client || !this.config) {
            return;
        }
        this.client.unsubscribe(this.subscribeTopic(deviceId, supportLocal));
    }
    async connect() {
        this.stop();
        const res = await this.api.post('/v1.0/m/life/ha/access/config', null, { linkId: `homebridge-tuya-ha.${(0, util_1.generateUUID)()}` });
        if (!res || !res.success) {
            this.log.warn('Get Tuya HA MQTT config failed. code = %s, msg = %s', res?.code, res?.msg);
            return;
        }
        this.config = res.result;
        const url = new url_1.URL(this.config.url);
        const protocol = url.protocol === 'ssl:' ? 'mqtts' : url.protocol.replace(':', '') || 'mqtt';
        const connectUrl = `${protocol}://${url.hostname}:${url.port}`;
        this.log.debug('Connecting to Tuya HA MQTT: %s', connectUrl);
        const client = mqtt_1.default.connect(connectUrl, {
            clientId: this.config.clientId,
            username: this.config.username,
            password: this.config.password,
        });
        client.on('connect', this.onConnect.bind(this));
        client.on('error', error => this.log.error('Tuya HA MQTT error: %s', error.message));
        client.on('end', () => this.log.debug('Tuya HA MQTT end'));
        client.on('message', this.onMessage.bind(this));
        this.client = client;
        const timeout = Math.max(60, (this.config.expireTime || 7200) - 60);
        this.reconnectTimer = setTimeout(() => this.connect().catch(error => this.log.error('Tuya HA MQTT reconnect failed: %s', error.message)), timeout * 1000);
    }
    onConnect() {
        this.log.debug('Tuya HA MQTT connected');
        if (!this.client || !this.config) {
            return;
        }
        for (const ownerId of this.ownerIds) {
            this.client.subscribe(this.config.topic.ownerId.sub.replace('{ownerId}', ownerId));
        }
        const topics = this.devices.map(device => this.subscribeTopic(device.id, device.support_local || device.supportLocal || false));
        if (topics.length > 0) {
            this.client.subscribe(topics);
        }
    }
    subscribeTopic(deviceId, supportLocal = false) {
        if (!this.config) {
            return '';
        }
        let topic = this.config.topic.devId.sub.replace('{devId}', deviceId);
        topic += supportLocal ? '/pen' : '/sta';
        return topic;
    }
    onMessage(_topic, payload) {
        try {
            const message = JSON.parse(payload.toString('utf8'));
            this.log.debug('Tuya HA MQTT message: %s', JSON.stringify(message));
            for (const listener of this.messageListeners) {
                listener(message);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.warn('Could not parse Tuya HA MQTT message: %s', msg);
        }
    }
}
exports.default = TuyaHASharingMQ;
//# sourceMappingURL=TuyaHASharingMQ.js.map