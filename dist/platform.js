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
    this.options.enableAdaptiveLighting = this.options.enableAdaptiveLighting === true;
    // Preserve names changed by users in Apple Home/Homebridge by default.
    // nameOverride is accepted as a compatibility alias used by some plugins.
    this.options.preserveHomeKitNames = typeof this.options.preserveHomeKitNames === 'boolean'
      ? this.options.preserveHomeKitNames
      : (typeof this.options.nameOverride === 'boolean' ? this.options.nameOverride : true);
    // Push names edited/shown in Homebridge Accessories back into HAP Name/ConfiguredName.
    // This is stronger than preserveHomeKitNames: it makes Homebridge's visible names
    // authoritative for Apple Home for every service, not only multi-gang switches.
    this.options.syncHomebridgeNamesToHomeKit = typeof this.options.syncHomebridgeNamesToHomeKit === 'boolean'
      ? this.options.syncHomebridgeNamesToHomeKit
      : true;
    // Optional one-time HomeKit identity bump. Apple Home can keep old per-service
    // names (for example Bathroom 1/2/3) in the controller cache even after the
    // plugin updates Name/ConfiguredName. Setting this token changes the HAP UUID
    // for Tuya accessories, so Apple Home imports them as fresh accessories using
    // the names currently stored in Homebridge's cached services. Change the token
    // only when you intentionally want a HomeKit re-import/name migration.
    this.options.homeKitNameReimportToken = String(this.options.homeKitNameReimportToken || '').trim();

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
    const mergeOverride = (target, source) => {
      for (const [key, value] of Object.entries(source)) {
        if (key === 'id') {
          continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          mergeOverride(target[key], value);
        } else if (value !== undefined) {
          target[key] = value;
        }
      }
      return target;
    };

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
      // The custom Pet Feeder override settings were removed. Real Tuya pet
      // feeders are still handled automatically when Tuya reports category cwwsq,
      // but config-level petFeeder options are ignored to avoid mixing device types.
      if (item.petFeeder !== undefined) {
        delete item.petFeeder;
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
      if (item.windowCovering && typeof item.windowCovering === 'object') {
        const normalizedWindowCovering = {};
        for (const key of ['invertPosition', 'reverseControl', 'trustExternalControlState', 'tapToStop', 'doubleClickToClose', 'estimatePositionOnStop']) {
          if (typeof item.windowCovering[key] === 'boolean') {
            normalizedWindowCovering[key] = item.windowCovering[key];
          }
        }
        if (item.windowCovering.externalControlStateMode !== undefined) {
          const mode = String(item.windowCovering.externalControlStateMode || '').trim();
          if (['normal', 'reversed', 'followReverseControl'].includes(mode)) {
            normalizedWindowCovering.externalControlStateMode = mode;
          } else {
            this.log.warn('[Tuya QR] Ignoring invalid windowCovering.externalControlStateMode override for id "%s". Use normal, reversed, or followReverseControl.', id);
          }
        }
        if (item.windowCovering.settleSeconds !== undefined) {
          const settleSeconds = Number(item.windowCovering.settleSeconds);
          if (Number.isFinite(settleSeconds)) {
            normalizedWindowCovering.settleSeconds = Math.max(5, Math.min(180, Math.round(settleSeconds)));
          } else {
            this.log.warn('[Tuya QR] Ignoring invalid windowCovering.settleSeconds override for id "%s". Use a number from 5 to 180.', id);
          }
        }
        if (item.windowCovering.travelSeconds !== undefined) {
          const travelSeconds = Number(item.windowCovering.travelSeconds);
          if (Number.isFinite(travelSeconds)) {
            normalizedWindowCovering.travelSeconds = Math.max(5, Math.min(180, Math.round(travelSeconds)));
          } else {
            this.log.warn('[Tuya QR] Ignoring invalid windowCovering.travelSeconds override for id "%s". Use a number from 5 to 180.', id);
          }
        }
        if (item.windowCovering.channels && typeof item.windowCovering.channels === 'object' && !Array.isArray(item.windowCovering.channels)) {
          const normalizedChannels = {};
          for (const [rawChannel, rawChannelConfig] of Object.entries(item.windowCovering.channels)) {
            const channel = String(rawChannel || '').trim();
            if (!channel || !rawChannelConfig || typeof rawChannelConfig !== 'object' || Array.isArray(rawChannelConfig)) {
              continue;
            }
            const channelConfig = {};
            for (const key of ['invertPosition', 'reverseControl', 'trustExternalControlState', 'tapToStop', 'doubleClickToClose', 'estimatePositionOnStop']) {
              if (typeof rawChannelConfig[key] === 'boolean') {
                channelConfig[key] = rawChannelConfig[key];
              }
            }
            if (rawChannelConfig.externalControlStateMode !== undefined) {
              const mode = String(rawChannelConfig.externalControlStateMode || '').trim();
              if (['normal', 'reversed', 'followReverseControl'].includes(mode)) {
                channelConfig.externalControlStateMode = mode;
              } else {
                this.log.warn('[Tuya QR] Ignoring invalid windowCovering.channels.%s.externalControlStateMode override for id "%s". Use normal, reversed, or followReverseControl.', channel, id);
              }
            }
            if (rawChannelConfig.settleSeconds !== undefined) {
              const settleSeconds = Number(rawChannelConfig.settleSeconds);
              if (Number.isFinite(settleSeconds)) {
                channelConfig.settleSeconds = Math.max(5, Math.min(180, Math.round(settleSeconds)));
              } else {
                this.log.warn('[Tuya QR] Ignoring invalid windowCovering.channels.%s.settleSeconds override for id "%s". Use a number from 5 to 180.', channel, id);
              }
            }
            if (rawChannelConfig.travelSeconds !== undefined) {
              const travelSeconds = Number(rawChannelConfig.travelSeconds);
              if (Number.isFinite(travelSeconds)) {
                channelConfig.travelSeconds = Math.max(5, Math.min(180, Math.round(travelSeconds)));
              } else {
                this.log.warn('[Tuya QR] Ignoring invalid windowCovering.channels.%s.travelSeconds override for id "%s". Use a number from 5 to 180.', channel, id);
              }
            }
            if (Object.keys(channelConfig).length > 0) {
              normalizedChannels[channel] = channelConfig;
            }
          }
          if (Object.keys(normalizedChannels).length > 0) {
            normalizedWindowCovering.channels = normalizedChannels;
          }
        }
        if (Object.keys(normalizedWindowCovering).length > 0) {
          item.windowCovering = normalizedWindowCovering;
        } else {
          delete item.windowCovering;
        }
      }
      if (item.preserveHomeKitNames === undefined && typeof item.nameOverride === 'boolean') {
        item.preserveHomeKitNames = item.nameOverride;
      }
      if (item.preserveHomeKitNames !== undefined && typeof item.preserveHomeKitNames !== 'boolean') {
        this.log.warn('[Tuya QR] Ignoring invalid preserveHomeKitNames override for id "%s". Use true or false.', id);
        delete item.preserveHomeKitNames;
      }
      delete item.nameOverride;
      if (item.switchNames !== undefined) {
        if (!item.switchNames || typeof item.switchNames !== 'object' || Array.isArray(item.switchNames)) {
          this.log.warn('[Tuya QR] Ignoring invalid switchNames override for id "%s" because it is not an object.', id);
          delete item.switchNames;
        } else {
          const normalizedSwitchNames = {};
          for (const [rawCode, rawName] of Object.entries(item.switchNames)) {
            const code = String(rawCode || '').trim();
            const requestedName = String(rawName || '').trim();
            if (!code || !requestedName) {
              continue;
            }
            const fallbackName = requestedName.replace(/[^A-Za-z0-9 '\s]/g, ' ').replace(/\s+/g, ' ').trim();
            const safeName = sanitizeName(requestedName) ?? fallbackName;
            if (!safeName) {
              this.log.warn('[Tuya QR] Ignoring invalid switch name for code "%s" on device id "%s".', code, id);
              continue;
            }
            normalizedSwitchNames[code] = safeName;
          }
          if (Object.keys(normalizedSwitchNames).length > 0) {
            item.switchNames = normalizedSwitchNames;
          } else {
            delete item.switchNames;
          }
        }
      }
      if (item.adaptiveLighting !== undefined) {
        if (typeof item.adaptiveLighting === 'boolean') {
          item.adaptiveLighting = { enabled: item.adaptiveLighting };
        } else if (item.adaptiveLighting && typeof item.adaptiveLighting === 'object' && typeof item.adaptiveLighting.enabled === 'boolean') {
          item.adaptiveLighting = { enabled: item.adaptiveLighting.enabled };
        } else {
          this.log.warn('[Tuya QR] Ignoring invalid adaptiveLighting override for id "%s". Use true/false or { enabled: true/false }.', id);
          delete item.adaptiveLighting;
        }
      }
      if (seenIds.has(id)) {
        skippedDuplicateId++;
        const existing = validOverrides.find(existingItem => existingItem.id === id);
        if (existing) {
          this.log.warn('[Tuya QR] Merging duplicate device override for id "%s" so settings from different UI sections do not override each other.', id);
          mergeOverride(existing, item);
        }
        continue;
      }
      seenIds.add(id);
      validOverrides.push(item);
    }

    if (skippedMissingId > 0) {
      this.log.warn('[Tuya QR] Ignored %d invalid device override(s) without an "id". QR cloud startup will continue.', skippedMissingId);
    }
    if (skippedDuplicateId > 0) {
      this.log.warn('[Tuya QR] Merged %d duplicate device override(s). QR cloud startup will continue.', skippedDuplicateId);
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
        alarm: deviceConfig?.alarm ? JSON.stringify(deviceConfig.alarm) : undefined,
        windowCovering: deviceConfig?.windowCovering ? JSON.stringify(deviceConfig.windowCovering) : undefined,
        globalAdaptiveLighting: !!this.options.enableAdaptiveLighting,
        adaptiveLighting: deviceConfig?.adaptiveLighting ? JSON.stringify(deviceConfig.adaptiveLighting) : undefined,
        globalPreserveHomeKitNames: this.options.preserveHomeKitNames !== false,
        globalSyncHomebridgeNamesToHomeKit: this.options.syncHomebridgeNamesToHomeKit !== false,
        preserveHomeKitNames: typeof deviceConfig?.preserveHomeKitNames === 'boolean' ? deviceConfig.preserveHomeKitNames : undefined,
        switchNames: deviceConfig?.switchNames ? JSON.stringify(deviceConfig.switchNames) : undefined,
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

  getDeviceCodes(device) {
    const codes = [];
    for (const source of [device?.schema, device?.status]) {
      if (!Array.isArray(source)) {
        continue;
      }
      for (const item of source) {
        const code = String(item?.code || '').trim().toLowerCase();
        if (code) {
          codes.push(code);
        }
      }
    }
    return Array.from(new Set(codes));
  }

  getDeviceText(device) {
    return [
      device?.name,
      device?.category,
      device?.product_name,
      device?.productName,
      device?.product_id,
      device?.productId,
      device?.model,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  isPetFeederLikeDevice(device) {
    const category = String(device?.category || '').toLowerCase();
    const codes = this.getDeviceCodes(device);
    const text = this.getDeviceText(device);
    return category === 'cwwsq'
      || ['quick_feed', 'manual_feed', 'slow_feed', 'meal_plan', 'feed_state'].some(code => codes.includes(code))
      || ['pet feeder', 'feeder', 'cat feeder', 'dog feeder', 'food dispenser'].some(term => text.includes(term));
  }

  isWindowCoveringLikeDevice(device) {
    const category = String(device?.category || '').toLowerCase();
    const codes = this.getDeviceCodes(device);
    const text = this.getDeviceText(device);
    const hasKnownCategory = ['cl', 'clkg', 'mg', 'mgmt'].includes(category);
    const hasNameHint = ['blind', 'blinds', 'curtain', 'shade', 'shutter', 'window covering', 'roller', 'jaluzea', 'draperie', 'perdea'].some(term => text.includes(term));
    const hasWindowControl = ['control', 'control_2', 'mach_operate'].some(code => codes.includes(code));
    const hasWindowPercent = ['percent_state', 'percent_control', 'percent_control_2', 'position'].some(code => codes.includes(code));
    return hasKnownCategory || hasNameHint || (hasWindowControl && hasWindowPercent);
  }

  isAirConditionerLikeDevice(device) {
    const category = String(device?.category || '').toLowerCase();
    const codes = this.getDeviceCodes(device);
    const text = this.getDeviceText(device);
    const hasCategoryOrName = ['kt', 'ktkzq', 'air_conditioner', 'airconditioner'].includes(category)
      || ['air conditioner', 'airconditioner', 'aircon', 'a/c', 'ac ', ' ac', 'clima', 'climă', 'aer conditionat', 'aer condiționat', 'hvac'].some(term => text.includes(term));
    const hasAcTemperatureTarget = ['temp_set', 'temp_set_f', 'temp_set_c', 'target_temperature', 'temp_current_f'].some(code => codes.includes(code));
    return hasCategoryOrName || hasAcTemperatureTarget;
  }

  isSwitchLikeDevice(device) {
    const category = String(device?.category || '').toLowerCase();
    const codes = this.getDeviceCodes(device);
    return ['dlq', 'kg', 'tdq', 'qjdcz', 'szjqr', 'cz', 'pc', 'wkcz'].includes(category)
      || codes.some(code => /^switch(_\d+|_usb\d+)?$/i.test(code));
  }

  warnOverrideIsolationOnce(id, message) {
    if (!this.overrideIsolationWarnings) {
      this.overrideIsolationWarnings = new Set();
    }
    const key = `${id}:${message}`;
    if (this.overrideIsolationWarnings.has(key)) {
      return;
    }
    this.overrideIsolationWarnings.add(key);
    this.log.warn(message);
  }

  isolateDeviceConfigForDevice(device, config) {
    if (!config) {
      return undefined;
    }
    const scoped = JSON.parse(JSON.stringify(config));
    const id = String(scoped.id || device?.id || '').trim();

    // "global" is only for harmless global/name/schema style options. Never let a
    // global override force every device into Pet Feeder, Blind, AC, or Switch naming.
    if (id === 'global') {
      delete scoped.category;
      delete scoped.petFeeder;
      delete scoped.windowCovering;
      delete scoped.airConditioner;
      delete scoped.switchNames;
      return scoped;
    }

    const category = String(scoped.category || '').toLowerCase();
    const petLike = this.isPetFeederLikeDevice(device);
    const coverLike = this.isWindowCoveringLikeDevice(device);
    const acLike = this.isAirConditionerLikeDevice(device);
    const switchLike = this.isSwitchLikeDevice(device);

    if ((scoped.petFeeder || category === 'cwwsq') && !petLike) {
      this.warnOverrideIsolationOnce(id, `[Tuya QR] Ignoring Pet Feeder override for ${device?.name || id}; the detected Tuya device is not a pet feeder and does not expose pet-feeder DPs.`);
      delete scoped.petFeeder;
      if (category === 'cwwsq') {
        delete scoped.category;
      }
    }

    if (scoped.windowCovering && !coverLike) {
      this.warnOverrideIsolationOnce(id, `[Tuya QR] Ignoring blind/window-covering override for ${device?.name || id}; the detected Tuya device is not a blind/curtain/shade.`);
      delete scoped.windowCovering;
      if (['cl', 'clkg'].includes(category)) {
        delete scoped.category;
      }
    }

    if (scoped.airConditioner && !acLike) {
      this.warnOverrideIsolationOnce(id, `[Tuya QR] Ignoring air-conditioner override for ${device?.name || id}; the detected Tuya device is not an air conditioner.`);
      delete scoped.airConditioner;
      if (['kt', 'ktkzq'].includes(category)) {
        delete scoped.category;
      }
    }

    if (scoped.switchNames && !switchLike) {
      this.warnOverrideIsolationOnce(id, `[Tuya QR] Ignoring switch channel-name override for ${device?.name || id}; the detected Tuya device is not a switch/outlet with Tuya switch DPs.`);
      delete scoped.switchNames;
    }

    // Do not let a category override switch an unrelated device into a special
    // handler. This protects against UI/old-config mistakes such as blinds showing
    // as Pet Feeder or pet feeders showing in blind settings.
    if (category === 'cwwsq' && !petLike) {
      delete scoped.category;
    }
    if (['cl', 'clkg'].includes(category) && !coverLike) {
      delete scoped.category;
    }
    if (['kt', 'ktkzq'].includes(category) && !acLike) {
      delete scoped.category;
    }

    return scoped;
  }

  getDeviceConfig(device) {
    if (!this.options.deviceOverrides) {
      return undefined;
    }
    const matches = this.options.deviceOverrides.filter(config => {
      const idMatch = config.id === device.id || config.id === device.uuid || config.id === device.product_id || config.id === "global";
      return idMatch;
    });
    const config = matches.find(config => config.id === device.id || config.id === device.uuid) ||
      matches.find(config => config.id === device.product_id) ||
      matches.find(config => config.id === "global");
    return this.isolateDeviceConfigForDevice(device, config);
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

  getHomeKitUUID(device) {
    const token = String(this.options.homeKitNameReimportToken || '').trim();
    if (!token) {
      return this.api.hap.uuid.generate(device.id);
    }
    // When the explicit re-import token is in use, also include the effective
    // HomeKit naming inputs. This avoids the stale-name case where Apple Home
    // keeps an old accessory identity even after switchNames were corrected.
    const deviceConfig = this.getDeviceConfig(device) || {};
    const namingSeed = JSON.stringify({
      deviceName: device?.name || '',
      switchNames: deviceConfig.switchNames || {},
      category: deviceConfig.category || '',
    });
    return this.api.hap.uuid.generate(`${device.id}:homekit-name-reimport:${token}:${namingSeed}`);
  }

  getLegacyHomeKitUUID(device) {
    return this.api.hap.uuid.generate(device.id);
  }

  findCachedAccessoryForDevice(device, preferredUUID) {
    return this.cachedAccessories.find(accessory => accessory.UUID === preferredUUID)
      || this.cachedAccessories.find(accessory => accessory.context?.deviceID === device.id)
      || this.cachedAccessories.find(accessory => accessory.UUID === this.getLegacyHomeKitUUID(device));
  }

  isGeneratedServiceName(name, device, service) {
    const raw = String(name || '').trim();
    if (!raw) {
      return true;
    }
    const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const deviceName = String(device?.name || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const subtype = String(service?.subtype || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return true;
    }
    if (/^(accessory information|battery|service)$/.test(normalized)) {
      return true;
    }
    if (/^(switch|outlet|plug|relay|channel|device)?\s*\d+$/.test(normalized)) {
      return true;
    }
    if (subtype && normalized === subtype) {
      return true;
    }
    const suffixMatch = String(service?.subtype || '').match(/(?:switch|control|scene|relay|outlet|plug|usb)[_\s-]*(\d+|usb\d+)$/i);
    const suffix = suffixMatch ? String(suffixMatch[1]).toLowerCase() : '';
    if (suffix && (normalized === suffix || normalized === `switch ${suffix}` || normalized === `outlet ${suffix}` || normalized === `plug ${suffix}`)) {
      return true;
    }
    if (deviceName && suffix && normalized === `${deviceName} ${suffix}`) {
      return true;
    }
    return false;
  }

  extractCachedServiceNames(device, cachedAccessory) {
    const names = {};
    if (!cachedAccessory || !Array.isArray(cachedAccessory.services)) {
      return names;
    }
    const skipUUIDs = new Set([this.Service.AccessoryInformation.UUID, this.Service.Battery.UUID]);
    for (const service of cachedAccessory.services) {
      if (!service || skipUUIDs.has(service.UUID)) {
        continue;
      }
      const subtypeKey = String(service.subtype || service.displayName || service.UUID);
      const candidates = [];
      if (typeof service.displayName === 'string') {
        candidates.push(service.displayName);
      }
      for (const characteristicType of [this.Characteristic.ConfiguredName, this.Characteristic.Name]) {
        try {
          if (service.testCharacteristic(characteristicType)) {
            const value = service.getCharacteristic(characteristicType).value;
            if (typeof value === 'string') {
              candidates.push(value);
            }
          }
        } catch {
          // Ignore malformed cached characteristics.
        }
      }
      const selected = candidates
        .map(value => sanitizeName(String(value || '').trim()) ?? String(value || '').trim())
        .find(value => value && !this.isGeneratedServiceName(value, device, service));
      if (selected) {
        names[subtypeKey] = selected;
      }
    }
    return names;
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
    const uuid = this.getHomeKitUUID(device);
    const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
    const legacyAccessory = existingAccessory ? undefined : this.findCachedAccessoryForDevice(device, uuid);
    const migratedServiceNames = legacyAccessory ? this.extractCachedServiceNames(device, legacyAccessory) : {};
    if (Object.keys(migratedServiceNames).length > 0) {
      this.log.info(`[Tuya QR] Found ${Object.keys(migratedServiceNames).length} cached Homebridge service name(s) for ${device.name}; will use them for HomeKit re-import.`);
    }
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
      if (Object.keys(migratedServiceNames).length > 0) {
        accessory.context.homebridgeServiceNames = { ...migratedServiceNames };
        accessory.context.homeKitServiceNames = { ...migratedServiceNames };
      }
      const handler = AccessoryFactory.createAccessory(this, accessory, device);
      this.accessoryHandlers.push(handler);
      if (device.unbridged) {
        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
      } else {
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
      AccessoryFactory.configAccessory(this, accessory);
      if (legacyAccessory && legacyAccessory.UUID !== accessory.UUID && !device.unbridged) {
        this.log.warn(`[Tuya QR] Removing old cached HomeKit identity for ${device.name} after name re-import.`);
        try {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [legacyAccessory]);
        } catch (error) {
          this.log.debug(`Failed to unregister old HomeKit identity for ${device.name}:`, error);
        }
        const legacyIndex = this.cachedAccessories.indexOf(legacyAccessory);
        if (legacyIndex >= 0) {
          this.cachedAccessories.splice(legacyIndex, 1);
        }
      }
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
