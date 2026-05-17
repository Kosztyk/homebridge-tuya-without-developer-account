"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable max-len */
const events_1 = __importDefault(require("events"));
const Logger_1 = require("../../shared/util/Logger");
const TuyaDevice_1 = __importStar(require("./TuyaDevice"));
const TuyaHASharingMQ_1 = __importDefault(require("../api/TuyaHASharingMQ"));
var Events;
(function (Events) {
    Events["DEVICE_ADD"] = "DEVICE_ADD";
    Events["DEVICE_INFO_UPDATE"] = "DEVICE_INFO_UPDATE";
    Events["DEVICE_STATUS_UPDATE"] = "DEVICE_STATUS_UPDATE";
    Events["DEVICE_DELETE"] = "DEVICE_DELETE";
})(Events || (Events = {}));
class TuyaHADeviceManager extends events_1.default {
    static { this.Events = Events; }
    constructor(api, debug = false) {
        super();
        this.api = api;
        this.debug = debug;
        this.ownerIDs = [];
        this.devices = [];
        const baseLog = this.api.log.log || this.api.log;
        this.log = new Logger_1.PrefixLogger(baseLog, TuyaHADeviceManager.name, debug);
    }
    createVirtualDevice(baseDevice, uuid) {
        const cloneDevice = new TuyaDevice_1.default(baseDevice);
        const uniqueId = uuid || Date.now().toString(36) + Math.random().toString(36).substring(2);
        cloneDevice.id = `${uniqueId}`;
        cloneDevice.uuid = `${uniqueId}`;
        cloneDevice.name = 'Virtual Device';
        cloneDevice.product_id = `${uniqueId}`;
        cloneDevice.product_name = 'virtual product';
        cloneDevice.sub = true;
        cloneDevice.ip = '';
        cloneDevice.parent_id = baseDevice.id;
        cloneDevice.remote_keys = undefined;
        return cloneDevice;
    }
    getDevice(deviceID) {
        return Array.from(this.devices).find(device => device.id === deviceID);
    }
    async getHomeList() {
        const res = await this.api.get('/v1.0/m/life/users/homes');
        if (res.success && Array.isArray(res.result)) {
            res.result = res.result.map(home => ({
                home_id: home.ownerId || home.home_id || home.id,
                name: home.name,
            }));
        }
        return res;
    }
    async getHomeDeviceList(homeID) {
        return this.api.get('/v1.0/m/life/ha/home/devices', { homeId: homeID });
    }
    async updateDevices(homeIDList) {
        const devices = [];
        for (const homeID of homeIDList) {
            const res = await this.getHomeDeviceList(String(homeID));
            if (!res.success) {
                this.log.warn('Fetching HA QR device list failed for homeId=%s. code=%s, msg=%s', homeID, res.code, res.msg);
                continue;
            }
            const rawDevices = Array.isArray(res.result) ? res.result : [];
            for (const rawDevice of rawDevices) {
                const device = await this.convertHADevice(rawDevice, String(homeID));
                devices.push(device);
            }
        }
        this.devices = devices;
        return devices;
    }
    async updateDevice(deviceID) {
        const devices = await this.queryDevicesByIds([deviceID]);
        const device = devices[0];
        if (!device) {
            return null;
        }
        const oldDevice = this.getDevice(deviceID);
        if (oldDevice) {
            this.devices.splice(this.devices.indexOf(oldDevice), 1);
        }
        this.devices.push(device);
        return device;
    }
    async queryDevicesByIds(ids) {
        const res = await this.api.get('/v1.0/m/life/ha/devices/detail', { devIds: ids.join(',') });
        if (!res.success || !Array.isArray(res.result)) {
            return [];
        }
        return Promise.all(res.result.map(raw => this.convertHADevice(raw, raw.owner_id || raw.ownerId || '')));
    }
    async convertHADevice(rawDevice, homeID) {
        const status = Array.isArray(rawDevice.status)
            ? rawDevice.status.filter(item => item && item.code !== undefined).map(item => ({ code: item.code, value: item.value }))
            : Object.entries(rawDevice.status || {}).map(([code, value]) => ({ code, value }));
        const device = new TuyaDevice_1.default({
            id: rawDevice.id || rawDevice.devId || rawDevice.device_id,
            uuid: rawDevice.uuid || rawDevice.id || rawDevice.devId || rawDevice.device_id,
            name: rawDevice.name || rawDevice.product_name || rawDevice.productName || rawDevice.id,
            online: rawDevice.online !== undefined ? rawDevice.online : true,
            owner_id: String(rawDevice.owner_id || rawDevice.ownerId || homeID),
            product_id: rawDevice.product_id || rawDevice.productId || rawDevice.productKey || '',
            product_name: rawDevice.product_name || rawDevice.productName || rawDevice.name || '',
            model: rawDevice.model,
            icon: rawDevice.icon || '',
            category: rawDevice.category || rawDevice.categoryCode || rawDevice.productCategory || '',
            schema: [],
            status,
            ip: rawDevice.ip || '',
            lat: rawDevice.lat || '',
            lon: rawDevice.lon || '',
            time_zone: rawDevice.time_zone || rawDevice.timeZone || '',
            create_time: rawDevice.create_time || rawDevice.createTime || 0,
            active_time: rawDevice.active_time || rawDevice.activeTime || 0,
            update_time: rawDevice.update_time || rawDevice.updateTime || 0,
            sub: rawDevice.sub || false,
            parent_id: rawDevice.parent_id || rawDevice.parentId,
            remote_keys: rawDevice.remote_keys,
        });
        device.schema = await this.getDeviceSchema(device.id);
        return device;
    }
    async getDeviceSchema(deviceID) {
        const res = await this.api.get(`/v1.1/m/life/${deviceID}/specifications`);
        if (!res.success) {
            this.log.warn('Get HA QR device specification failed. devId = %s, code = %s, msg = %s', deviceID, res.code, res.msg);
            return [];
        }
        const result = res.result || {};
        const status = Array.isArray(result.status) ? result.status : [];
        const functions = Array.isArray(result.functions) ? result.functions : [];
        const schemas = new Map();
        for (const { code, type, values } of [...status, ...functions]) {
            if (!code || schemas.has(code)) {
                continue;
            }
            const read = status.find(schema => schema.code === code) !== undefined;
            const write = functions.find(schema => schema.code === code) !== undefined;
            let mode = TuyaDevice_1.TuyaDeviceSchemaMode.UNKNOWN;
            if (read && write) {
                mode = TuyaDevice_1.TuyaDeviceSchemaMode.READ_WRITE;
            }
            else if (read && !write) {
                mode = TuyaDevice_1.TuyaDeviceSchemaMode.READ_ONLY;
            }
            else if (!read && write) {
                mode = TuyaDevice_1.TuyaDeviceSchemaMode.WRITE_ONLY;
            }
            let property;
            try {
                property = typeof values === 'string' ? JSON.parse(values) : values;
                schemas.set(code, { code, mode, type, property });
            }
            catch {
                // Ignore invalid schema data, matching the original plugin behavior.
            }
        }
        return Array.from(schemas.values()).sort((a, b) => a.code > b.code ? 1 : -1);
    }
    async getDeviceDetails(deviceID) {
        const res = await this.api.get('/v1.0/m/life/ha/devices/detail', { devIds: deviceID });
        if (res.success && Array.isArray(res.result)) {
            res.result = res.result[0];
        }
        return res;
    }
    async getInfraredRemotes(_infraredID) {
        return { success: true, result: [] };
    }
    async getInfraredKeys(_infraredID, _remoteID) {
        return { success: true, result: [] };
    }
    async getInfraredACStatus(_infraredID, _remoteID) {
        return { success: true, result: {} };
    }
    async getInfraredDIYKeys(_infraredID, _remoteID) {
        return { success: true, result: [] };
    }
    async updateInfraredRemotes(_allDevices) {
        return;
    }
    async sendCommands(deviceID, commands) {
        const device = this.getDevice(deviceID);
        const deviceName = device?.name || deviceID;
        const commandStr = commands.map(c => `${c.code}=${c.value}`).join(', ');
        this.log.info(`[${deviceName}] Sending command (Tuya HA QR cloud): ${commandStr}`);
        const res = await this.api.post(`/v1.1/m/thing/${deviceID}/commands`, null, { commands });
        if (!res.success) {
            this.log.warn('Send HA QR command failed. devId=%s, code=%s, msg=%s', deviceID, res.code, res.msg);
            return false;
        }
        const target = this.getDevice(deviceID);
        if (target) {
            for (const command of commands) {
                const current = target.status.find(status => status.code === command.code);
                if (current) {
                    current.value = command.value;
                }
                else {
                    target.status.push({ ...command });
                }
            }
            this.emit(Events.DEVICE_STATUS_UPDATE, target, commands);
        }
        return res.result;
    }
    async getSceneList(homeID) {
        const res = await this.api.get('/v1.0/m/scene/ha/home/scenes', { homeId: homeID });
        if (!res.success) {
            this.log.warn('Get HA QR scene list failed. homeId = %s, code = %s, msg = %s', homeID, res.code, res.msg);
            return [];
        }
        const scenes = [];
        for (const scene of (Array.isArray(res.result) ? res.result : [])) {
            if (scene.enabled === false) {
                continue;
            }
            scenes.push(new TuyaDevice_1.default({
                id: scene.scene_id || scene.sceneId,
                uuid: scene.scene_id || scene.sceneId,
                name: scene.name,
                owner_id: String(homeID),
                product_id: 'scene',
                product_name: 'scene',
                category: 'scene',
                schema: [],
                status: [],
                online: true,
            }));
        }
        return scenes;
    }
    async executeScene(homeID, sceneID) {
        return this.api.post('/v1.0/m/scene/ha/trigger', null, { homeId: homeID, sceneId: sceneID });
    }
    async getCurrentWeather(_lat, _lon) {
        return undefined;
    }
    async startMQ(ownerIDs) {
        this.ownerIDs = ownerIDs.map(String);
        this.mq = new TuyaHASharingMQ_1.default(this.api, this.ownerIDs, this.devices, this.log, this.debug);
        this.mq.addMessageListener(this.onMQTTMessage.bind(this));
        await this.mq.start();
    }
    stopMQ() {
        this.mq?.stop();
    }
    onMQTTMessage(message) {
        try {
            const protocol = message.protocol || 0;
            const data = message.data || {};
            if (protocol === 4) {
                this.onDeviceReport(data.devId, data.status || []);
            }
            else if (protocol === 20 && data.bizData?.devId) {
                this.onDeviceOther(data.bizData.devId, data.bizCode, data);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.warn('Tuya HA MQTT processing error: %s', msg);
        }
    }
    onDeviceReport(deviceID, status) {
        const device = this.getDevice(deviceID);
        if (!device) {
            return;
        }
        const updated = [];
        for (const item of status) {
            if (item.code !== undefined && item.value !== undefined) {
                const current = device.status.find(s => s.code === item.code);
                if (current) {
                    current.value = item.value;
                }
                else {
                    device.status.push({ code: item.code, value: item.value });
                }
                updated.push({ code: item.code, value: item.value });
            }
        }
        if (updated.length > 0) {
            this.emit(Events.DEVICE_STATUS_UPDATE, device, updated);
        }
    }
    async onDeviceOther(deviceID, bizCode, data) {
        let device = this.getDevice(deviceID);
        if (bizCode === 'delete') {
            this.devices = this.devices.filter(item => item.id !== deviceID);
            this.mq?.unSubscribeDevice(deviceID, device?.['support_local'] || false);
            this.emit(Events.DEVICE_DELETE, deviceID);
            return;
        }
        if (bizCode === 'bindUser') {
            const newDevice = await this.updateDevice(deviceID);
            if (newDevice) {
                this.mq?.subscribeDevice(newDevice.id, newDevice['support_local'] || false);
                this.emit(Events.DEVICE_ADD, newDevice);
            }
            return;
        }
        if (!device) {
            return;
        }
        if (bizCode === 'online') {
            device.online = true;
        }
        else if (bizCode === 'offline') {
            device.online = false;
        }
        else if (bizCode === 'nameUpdate') {
            device.name = data.bizData?.name || device.name;
        }
        this.emit(Events.DEVICE_INFO_UPDATE, device, []);
    }
}
exports.default = TuyaHADeviceManager;
//# sourceMappingURL=TuyaHADeviceManager.js.map