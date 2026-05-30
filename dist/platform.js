"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TuyaPlatform = void 0;

const path = require("path");
const fs = require("fs");
const TuyaHACloudAPI = require("./cloud/api/TuyaHACloudAPI").default;
const TuyaHADeviceManager = require("./cloud/device/TuyaHADeviceManager").default;
const AccessoryFactory = require("./shared/accessories/AccessoryFactory").default;
const { sanitizeName } = require("./shared/util/util");
const { ConfigHash } = require("./shared/util/ConfigHash");
const { PLUGIN_NAME, PLATFORM_NAME } = require("./settings");

function safeUserCode(userCode) {
  return String(userCode || "").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

class TuyaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.options = this.config.options || {};
    this.cachedAccessories = [];
    this.accessoryHandlers = [];

    if (!this.validate()) {
      return;
    }

    this.log.debug("Finished initializing Tuya QR-only platform");
    this.api.on("didFinishLaunching", async () => {
      this.log.debug("Executed didFinishLaunching callback");
      await this.initDevices();
    });
  }

  validate() {
    if (!this.config.options || typeof this.config.options !== "object") {
      this.config.options = {};
      this.options = this.config.options;
    }

    // This fork intentionally supports only Home Assistant-style Tuya QR Cloud Authentication.
    // Old Tuya IoT OpenAPI credentials, local LAN mode, username/password login, and hybrid mode are not accepted.
    this.config.mode = "cloud";
    this.options.projectType = "3";

    if (!this.options.userCode || String(this.options.userCode).trim().length === 0) {
      this.log.error("[Tuya QR] Missing Tuya User Code. Open Homebridge UI → Plugins → Tuya without developer account for Homebridge → Settings, generate/scan the QR code, then save.");
      return false;
    }

    if (this.config.local || this.options.accessId || this.options.accessKey || this.options.username || this.options.password || this.options.countryCode || this.options.endpoint) {
      this.log.warn("[Tuya QR] Ignoring legacy Tuya IoT / local configuration. This plugin only uses QR Cloud Authentication.");
    }

    if (!this.validateDeviceOverrides() || !this.validateSchema()) {
      return false;
    }

    return true;
  }

  validateDeviceOverrides() {
    if (!this.options.deviceOverrides) {
      return true;
    }
    if (!Array.isArray(this.options.deviceOverrides)) {
      this.log.warn('[Tuya QR] Ignoring invalid deviceOverrides value because it is not an array.');
      this.options.deviceOverrides = [];
      return true;
    }

    const validOverrides = [];
    const seenIds = new Set();
    let skippedMissingId = 0;
    let skippedDuplicateId = 0;

    for (const item of this.options.deviceOverrides) {
      if (!item || typeof item !== 'object') {
        skippedMissingId++;
        continue;
      }
      const id = String(item.id || '').trim();
      if (!id) {
        skippedMissingId++;
        continue;
      }
      if (seenIds.has(id)) {
        skippedDuplicateId++;
        this.log.warn('[Tuya QR] Ignoring duplicate device override for id "%s". Keeping the first one.', id);
        continue;
      }
      item.id = id;
      if (item.airConditioner && typeof item.airConditioner === 'object') {
        const normalizedAirConditioner = {};
        const minTemperature = Number(item.airConditioner.minTemperature);
        const maxTemperature = Number(item.airConditioner.maxTemperature);
        const temperatureStep = Number(item.airConditioner.temperatureStep);
        if (Number.isFinite(minTemperature)) {
          normalizedAirConditioner.minTemperature = minTemperature;
        }
        if (Number.isFinite(maxTemperature)) {
          normalizedAirConditioner.maxTemperature = maxTemperature;
        }
        if (Number.isFinite(temperatureStep) && temperatureStep > 0) {
          normalizedAirConditioner.temperatureStep = temperatureStep;
        }
        if (Number.isFinite(normalizedAirConditioner.minTemperature) && Number.isFinite(normalizedAirConditioner.maxTemperature) && normalizedAirConditioner.minTemperature > normalizedAirConditioner.maxTemperature) {
          this.log.warn('[Tuya QR] Air conditioner override for id "%s" has minTemperature greater than maxTemperature. Swapping values.', id);
          const oldMin = normalizedAirConditioner.minTemperature;
          normalizedAirConditioner.minTemperature = normalizedAirConditioner.maxTemperature;
          normalizedAirConditioner.maxTemperature = oldMin;
        }
        if (Object.keys(normalizedAirConditioner).length > 0) {
          item.airConditioner = normalizedAirConditioner;
        } else {
          this.log.warn('[Tuya QR] Ignoring invalid airConditioner override for id "%s" because no numeric temperature values were provided.', id);
          delete item.airConditioner;
        }
      }
      if (item.petFeeder && typeof item.petFeeder === 'object') {
        const normalizedPetFeeder = {};
        const manualFeedAmount = Number(item.petFeeder.manualFeedAmount);
        if (Number.isFinite(manualFeedAmount)) {
          normalizedPetFeeder.manualFeedAmount = Math.max(1, Math.min(12, Math.round(manualFeedAmount)));
        }
        if (typeof item.petFeeder.exposeSlowFeed === 'boolean') {
          normalizedPetFeeder.exposeSlowFeed = item.petFeeder.exposeSlowFeed;
        }
        if (Object.keys(normalizedPetFeeder).length > 0) {
          item.petFeeder = normalizedPetFeeder;
        } else {
          delete item.petFeeder;
        }
      }
      if (item.alarm && typeof item.alarm === 'object') {
        const normalizedAlarm = {};
        for (const key of ['exposeAlarmSoundSwitch', 'exposeMufflingSwitch', 'exposeNotificationSwitches']) {
          if (typeof item.alarm[key] === 'boolean') {
            normalizedAlarm[key] = item.alarm[key];
          }
        }
        if (Object.keys(normalizedAlarm).length > 0) {
          item.alarm = normalizedAlarm;
        } else {
          delete item.alarm;
        }
      }
      seenIds.add(id);
      validOverrides.push(item);
    }

    if (skippedMissingId > 0) {
      this.log.warn('[Tuya QR] Ignored %d invalid device override(s) without an "id". QR cloud startup will continue.', skippedMissingId);
    }
    if (skippedDuplicateId > 0) {
      this.log.warn('[Tuya QR] Ignored %d duplicate device override(s). QR cloud startup will continue.', skippedDuplicateId);
    }

    this.options.deviceOverrides = validOverrides;
    return true;
  }

  validateSchema() {
    if (!this.options.deviceOverrides) {
      return true;
    }
    for (const deviceOverride of this.options.deviceOverrides) {
      if (!deviceOverride.schema) {
        continue;
      }
      if (!Array.isArray(deviceOverride.schema)) {
        this.log.warn('[Tuya QR] Ignoring invalid schema override for device id "%s" because schema is not an array.', deviceOverride.id);
        deviceOverride.schema = undefined;
        continue;
      }
      const validSchema = [];
      const seenCodes = new Set();
      let skippedMissingCode = 0;
      let skippedDuplicateCode = 0;

      for (const item of deviceOverride.schema) {
        if (!item || typeof item !== 'object') {
          skippedMissingCode++;
          continue;
        }
        const code = String(item.code || '').trim();
        if (!code) {
          skippedMissingCode++;
          continue;
        }
        if (seenCodes.has(code)) {
          skippedDuplicateCode++;
          this.log.warn('[Tuya QR] Ignoring duplicate schema override code "%s" for device id "%s". Keeping the first one.', code, deviceOverride.id);
          continue;
        }
        item.code = code;
        seenCodes.add(code);
        validSchema.push(item);
      }

      if (skippedMissingCode > 0) {
        this.log.warn('[Tuya QR] Ignored %d invalid schema override(s) without a "code" for device id "%s".', skippedMissingCode, deviceOverride.id);
      }
      if (skippedDuplicateCode > 0) {
        this.log.warn('[Tuya QR] Ignored %d duplicate schema override(s) for device id "%s".', skippedDuplicateCode, deviceOverride.id);
      }
      deviceOverride.schema = validSchema;
    }
    return true;
  }

  configureAccessory(accessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);
    AccessoryFactory.configAccessory(this, accessory);
    this.cachedAccessories.push(accessory);
  }

  getAuthFile(userCode) {
    return path.join(this.api.user.storagePath(), `tuya-ha-qr-auth.${safeUserCode(userCode)}.json`);
  }

  async readAuthData(userCode) {
    const file = this.getAuthFile(userCode);
    try {
      const raw = await fs.promises.readFile(file, "utf8");
      const data = JSON.parse(raw);
      const tokenInfo = data.tokenInfo || {};
      if (!data.userCode || !data.endpoint || !data.terminalId || !(tokenInfo.access_token || tokenInfo.accessToken) || !(tokenInfo.refresh_token || tokenInfo.refreshToken)) {
        this.log.warn("[Tuya QR] Existing auth file is incomplete. Clear authentication in the plugin settings and scan again.");
        return undefined;
      }
      data.tokenInfo = {
        ...tokenInfo,
        access_token: tokenInfo.access_token || tokenInfo.accessToken,
        refresh_token: tokenInfo.refresh_token || tokenInfo.refreshToken,
        expire_time: tokenInfo.expire_time || tokenInfo.expireTime || tokenInfo.expire || 7200,
      };
      return data;
    } catch {
      return undefined;
    }
  }

  async writeAuthData(userCode, data) {
    const file = this.getAuthFile(userCode);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
    this.log.info("[Tuya QR] Auth token saved at %s", file);
  }

  async initDevices() {
    const devices = await this.initQrCloudProject();
    if (!devices || !this.deviceManager) {
      return;
    }

    this.configHash = new ConfigHash(this.api.user.storagePath(), "tuya-cloud-configs");

    for (const device of devices) {
      const deviceConfig = this.getDeviceConfig(device);
      if (deviceConfig?.category) {
        this.log.warn("Override %o category from %o to %o", device.name, device.category, deviceConfig.category);
        device.category = deviceConfig.category;
      }
      if (deviceConfig?.unbridged) {
        this.log.warn("Unbridge %o category %o", device.name, device.category);
        device.unbridged = deviceConfig.unbridged;
      }
      const configToHash = {
        deviceId: device.id,
        customCategory: deviceConfig?.category,
        unbridged: deviceConfig?.unbridged ?? false,
        schemaOverrides: deviceConfig?.schema ? JSON.stringify(deviceConfig.schema) : undefined,
        airConditioner: deviceConfig?.airConditioner ? JSON.stringify(deviceConfig.airConditioner) : undefined,
        petFeeder: deviceConfig?.petFeeder ? JSON.stringify(deviceConfig.petFeeder) : undefined,
        alarm: deviceConfig?.alarm ? JSON.stringify(deviceConfig.alarm) : undefined,
        adaptiveLighting: deviceConfig?.adaptiveLighting ?? false,
      };
      const { changed: configChanged } = this.configHash.hasConfigChanged(device.id, configToHash);
      device.configChanged = configChanged;
      if (configChanged) {
        this.log.info(`[Tuya QR] Device config changed for "${device.name}" (${device.id}), will rebuild services`);
      }
    }

    await this.deviceManager.updateInfraredRemotes(devices);
    this.log.info(`[Tuya QR] Got ${devices.length} device(s) and scene(s).`);

    const uid = this.deviceManager.api.tokenInfo?.uid || "unknown";
    const file = path.join(this.api.user.persistPath(), `TuyaDeviceList.${uid}.json`);
    this.log.info("Device list saved at %s", file);
    if (!fs.existsSync(this.api.user.persistPath())) {
      await fs.promises.mkdir(this.api.user.persistPath(), { recursive: true });
    }
    await fs.promises.writeFile(file, JSON.stringify(devices, null, 2));

    for (const device of devices) {
      this.addAccessory(device);
    }

    const Events = TuyaHADeviceManager.Events;
    this.deviceManager.on(Events.DEVICE_ADD, (device) => this.addAccessory(device));
    this.deviceManager.on(Events.DEVICE_INFO_UPDATE, this.updateAccessoryInfo.bind(this));
    this.deviceManager.on(Events.DEVICE_STATUS_UPDATE, this.updateAccessoryStatus.bind(this));
    this.deviceManager.on(Events.DEVICE_DELETE, this.removeAccessory.bind(this));

    for (const cachedAccessory of this.cachedAccessories) {
      this.log.warn("Removing unused accessory from cache:", cachedAccessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
    }
    this.cachedAccessories = [];
  }

  async initQrCloudProject() {
    const userCode = String(this.options.userCode || "").trim();
    const debugMode = !!(this.options.debug && ((this.options.debugLevel ?? "").length > 0 ? this.options.debugLevel?.includes("api") : true));

    const authData = await this.readAuthData(userCode);
    if (!authData) {
      this.log.error("[Tuya QR] No saved QR authentication found for this User Code.");
      this.log.error("[Tuya QR] Open Homebridge UI → Plugins → Tuya without developer account for Homebridge → Settings → Generate QR Code, scan it, save, then restart Homebridge.");
      this.log.error("[Tuya QR] Expected auth file: %s", this.getAuthFile(userCode));
      return undefined;
    }

    const api = new TuyaHACloudAPI(userCode, authData.terminalId, authData.endpoint, authData.tokenInfo, this.log, debugMode, async (tokenInfo) => {
      await this.writeAuthData(userCode, {
        ...authData,
        endpoint: api.endpoint,
        tokenInfo,
        savedAt: Date.now(),
        refreshedAt: Date.now(),
      });
    });
    const deviceManager = new TuyaHADeviceManager(api, debugMode);

    this.log.info("[Tuya QR] Fetching home list.");
    const res = await deviceManager.getHomeList();
    if (res.success === false) {
      this.log.error(`[Tuya QR] Fetching home list failed. code=${res.code}, msg=${res.msg}`);
      this.log.error("[Tuya QR] Token refresh was attempted automatically. If this continues, clear authentication in the plugin settings and scan again.");
      return undefined;
    }

    const homeIDList = [];
    for (const { home_id, name } of (res.result || [])) {
      const homeID = String(home_id);
      this.log.info(`[Tuya QR] Got home_id=${homeID}, name=${name}`);
      if (this.options.homeWhitelist && Array.isArray(this.options.homeWhitelist) && this.options.homeWhitelist.length > 0) {
        const whitelist = this.options.homeWhitelist.map(item => String(item));
        if (whitelist.includes(homeID)) {
          this.log.info(`[Tuya QR] Found home_id=${homeID} in whitelist; including devices from this home.`);
          homeIDList.push(homeID);
        } else {
          this.log.info(`[Tuya QR] Did not find home_id=${homeID} in whitelist; excluding devices from this home.`);
        }
      } else {
        homeIDList.push(homeID);
      }
    }

    if (homeIDList.length === 0) {
      this.log.warn("[Tuya QR] Home list is empty.");
    }

    this.log.info("[Tuya QR] Fetching device list.");
    deviceManager.ownerIDs = homeIDList.map(homeID => homeID.toString());
    const devices = await deviceManager.updateDevices(homeIDList);

    this.log.info("[Tuya QR] Fetching scene list.");
    for (const homeID of homeIDList) {
      const scenes = await deviceManager.getSceneList(homeID);
      for (const scene of scenes) {
        this.log.info(`[Tuya QR] Got scene_id=${scene.id}, name=${scene.name}`);
      }
      devices.push(...scenes);
    }

    await this.writeAuthData(userCode, {
      ...authData,
      endpoint: api.endpoint,
      tokenInfo: api.exportTokenInfo(),
      savedAt: Date.now(),
    });

    this.deviceManager = deviceManager;
    this.log.info("[Tuya QR] Starting MQTT connection.");
    await deviceManager.startMQ(homeIDList);

    return devices;
  }

  getDeviceConfig(device) {
    if (!this.options.deviceOverrides) {
      return undefined;
    }
    const matches = this.options.deviceOverrides.filter(config => {
      const idMatch = config.id === device.id || config.id === device.uuid || config.id === device.product_id || config.id === "global";
      return idMatch;
    });
    return matches.find(config => config.id === device.id || config.id === device.uuid) ||
      matches.find(config => config.id === device.product_id) ||
      matches.find(config => config.id === "global");
  }

  getDeviceSchemaConfig(device, code) {
    const deviceConfig = this.getDeviceConfig(device);
    if (!deviceConfig || !deviceConfig.schema) {
      return undefined;
    }
    deviceConfig.schema.forEach(item => {
      if (item.oldCode) {
        item.newCode = item.code;
        item.code = item.oldCode;
        item.oldCode = undefined;
      }
    });
    const schemaConfig = deviceConfig.schema.find(item => {
      if (!code) {
        return false;
      }
      const target = code.toString().toLowerCase();
      const legacyCode = item.code?.toString().toLowerCase();
      const migratedCode = item.newCode?.toString().toLowerCase();
      return legacyCode === target || migratedCode === target;
    });
    return schemaConfig;
  }

  addAccessory(device) {
    const deviceConfig = this.getDeviceConfig(device);
    if (deviceConfig?.category) {
      this.log.warn("Override %o category from %o to %o", device.name, device.category, deviceConfig.category);
      device.category = deviceConfig.category;
    }
    if (deviceConfig?.unbridged) {
      this.log.warn("Unbridge %o category %o", device.name, device.category);
      device.unbridged = deviceConfig.unbridged;
    }
    if (device.category === "hidden") {
      this.log.info("Hide Accessory:", device.name);
      return;
    }
    const uuid = this.api.hap.uuid.generate(device.id);
    const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
    if (existingAccessory && !device.unbridged) {
      this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName);
      if (!existingAccessory.context || !existingAccessory.context.deviceID) {
        this.log.info("Update accessory context:", existingAccessory.displayName);
        existingAccessory.context.deviceID = device.id;
        this.api.updatePlatformAccessories([existingAccessory]);
      }
      const handler = AccessoryFactory.createAccessory(this, existingAccessory, device);
      this.accessoryHandlers.push(handler);
      const index = this.cachedAccessories.indexOf(existingAccessory);
      if (index >= 0) {
        this.cachedAccessories.splice(index, 1);
      }
    } else {
      this.log.info("Adding new accessory:", device.name);
      const safeName = sanitizeName(device.name) ?? (device.id || "Tuya Device");
      const accessory = new this.api.platformAccessory(safeName, uuid);
      accessory.context.deviceID = device.id;
      const handler = AccessoryFactory.createAccessory(this, accessory, device);
      this.accessoryHandlers.push(handler);
      if (device.unbridged) {
        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
      } else {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      AccessoryFactory.configAccessory(this, accessory);
    }
  }

  updateAccessoryInfo(device, info) {
    const handler = this.getAccessoryHandler(device.id);
    if (!handler) {
      return;
    }
    handler.onDeviceInfoUpdate(info);
  }

  updateAccessoryStatus(device, status) {
    const handler = this.getAccessoryHandler(device.id);
    if (!handler) {
      return;
    }
    handler.onDeviceStatusUpdate(status);
  }

  removeAccessory(deviceID) {
    const handler = this.getAccessoryHandler(deviceID);
    if (!handler) {
      return;
    }
    const index = this.accessoryHandlers.indexOf(handler);
    if (index >= 0) {
      this.accessoryHandlers.splice(index, 1);
    }
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [handler.accessory]);
    this.log.info("Removing existing accessory from cache:", handler.accessory.displayName);
  }

  getAccessoryHandler(deviceID) {
    return this.accessoryHandlers.find(handler => handler.device?.id === deviceID);
  }
}

exports.TuyaPlatform = TuyaPlatform;
