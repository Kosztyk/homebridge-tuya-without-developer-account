'use strict';

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { default: TuyaHACloudAPI } = require('../dist/cloud/api/TuyaHACloudAPI');
const { default: TuyaHADeviceManager } = require('../dist/cloud/device/TuyaHADeviceManager');

const PLATFORM_NAME = 'TuyaNoDeveloperAccount';


function safeUserCode(userCode) {
  return String(userCode || '').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function normaliseUserCode(userCode) {
  return String(userCode || '').trim();
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function looksLikeAirConditioner(device) {
  const haystack = [
    device.name,
    device.category,
    device.productName,
    device.productId,
    device.model,
  ].filter(Boolean).join(' ').toLowerCase();

  return [
    'air conditioner',
    'airconditioner',
    'aircon',
    'a/c',
    'ac ',
    ' ac',
    'clima',
    'climă',
    'aer conditionat',
    'aer condiționat',
    'hvac',
  ].some((needle) => haystack.includes(needle))
    || ['kt', 'wk', 'air_conditioner', 'airconditioner'].includes(String(device.category || '').toLowerCase());
}

function looksLikeWindowCovering(device) {
  const haystack = [
    device.name,
    device.category,
    device.productName,
    device.productId,
    device.model,
  ].filter(Boolean).join(' ').toLowerCase();

  return [
    'blind',
    'blinds',
    'curtain',
    'shade',
    'shutter',
    'window covering',
    'roller',
    'jaluzea',
    'draperie',
    'perdea',
  ].some((needle) => haystack.includes(needle))
    || ['cl', 'clkg', 'mg', 'mgmt'].includes(String(device.category || '').toLowerCase());
}

function looksLikePetFeeder(device) {
  const haystack = [
    device.name,
    device.category,
    device.productName,
    device.productId,
    device.model,
  ].filter(Boolean).join(' ').toLowerCase();

  return [
    'pet feeder',
    'feeder',
    'cat feeder',
    'dog feeder',
    'food dispenser',
    'cwwsq',
  ].some((needle) => haystack.includes(needle))
    || ['cwwsq'].includes(String(device.category || '').toLowerCase());
}

function normaliseNameForCompare(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksGeneratedChannelName(name, deviceName, subtype) {
  const value = normaliseNameForCompare(name);
  const device = normaliseNameForCompare(deviceName);
  const sub = normaliseNameForCompare(subtype);
  if (!value) return true;
  if (/^(accessory information|battery|service)$/.test(value)) return true;
  if (/^(switch|outlet|plug|channel|device)?\s*\d+$/.test(value)) return true;
  if (sub && value === sub) return true;
  const suffixMatch = String(subtype || '').match(/(?:switch|control|scene|relay|outlet|plug|usb)[_\s-]*(\d+|usb\d+)$/i);
  const suffix = suffixMatch ? String(suffixMatch[1]).toLowerCase() : '';
  if (suffix && (value === suffix || value === `switch ${suffix}` || value === `outlet ${suffix}` || value === `plug ${suffix}`)) return true;
  if (device && suffix && value === `${device} ${suffix}`) return true;
  return false;
}

function characteristicStringValue(characteristic) {
  if (!characteristic || typeof characteristic !== 'object') return '';
  const label = String(characteristic.displayName || characteristic.name || characteristic.type || characteristic.UUID || '').toLowerCase();
  if (!label.includes('name') && !label.includes('configured')) return '';
  return firstString(characteristic.value);
}

async function readCachedAccessoryServiceNames(homebridgeStoragePath) {
  const files = [
    path.join(homebridgeStoragePath, 'accessories', 'cachedAccessories'),
    path.join(homebridgeStoragePath, 'accessories', 'cachedAccessories.json'),
  ];
  let parsed;
  for (const file of files) {
    try {
      parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      break;
    } catch {
      // Try next possible cache path.
    }
  }
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.accessories) ? parsed.accessories : [];
  const result = new Map();
  for (const accessory of entries) {
    if (!accessory || typeof accessory !== 'object') continue;
    const deviceID = firstString(accessory.context?.deviceID, accessory.context?.deviceId, accessory.context?.id);
    if (!deviceID || !Array.isArray(accessory.services)) continue;
    const accessoryName = firstString(accessory.displayName, accessory.context?.deviceName, accessory.context?.name);
    const names = result.get(deviceID) || {};
    for (const service of accessory.services) {
      if (!service || typeof service !== 'object') continue;
      const subtype = firstString(service.subtype);
      if (!subtype) continue;
      const candidates = [];
      candidates.push(firstString(service.displayName));
      if (Array.isArray(service.characteristics)) {
        for (const characteristic of service.characteristics) {
          candidates.push(characteristicStringValue(characteristic));
        }
      }
      const selected = candidates
        .map((candidate) => firstString(candidate))
        .find((candidate) => candidate && !looksGeneratedChannelName(candidate, accessoryName, subtype));
      if (selected) names[subtype] = selected;
    }
    if (Object.keys(names).length) result.set(deviceID, names);
  }
  return result;
}


async function readCachedAccessoryDevices(homebridgeStoragePath) {
  const files = [
    path.join(homebridgeStoragePath, 'accessories', 'cachedAccessories'),
    path.join(homebridgeStoragePath, 'accessories', 'cachedAccessories.json'),
  ];
  let parsed;
  for (const file of files) {
    try {
      parsed = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      break;
    } catch {
      // Try next possible cache path.
    }
  }
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.accessories) ? parsed.accessories : [];
  const devices = [];
  for (const accessory of entries) {
    if (!accessory || typeof accessory !== 'object') continue;
    const id = firstString(accessory.context?.deviceID, accessory.context?.deviceId, accessory.context?.id);
    if (!id) continue;
    const name = firstString(accessory.displayName, accessory.context?.deviceName, accessory.context?.name, id);
    const switchCodes = [];
    const homebridgeServiceNames = {};
    for (const service of Array.isArray(accessory.services) ? accessory.services : []) {
      const subtype = firstString(service?.subtype);
      if (!subtype || !/^switch(?:_\d+|_?usb_?\d+)?$/i.test(subtype)) continue;
      switchCodes.push(subtype);
      const candidates = [firstString(service?.displayName)];
      for (const characteristic of Array.isArray(service?.characteristics) ? service.characteristics : []) {
        candidates.push(characteristicStringValue(characteristic));
      }
      const selected = candidates
        .map((candidate) => firstString(candidate))
        .find((candidate) => candidate && !looksGeneratedChannelName(candidate, name, subtype));
      if (selected) homebridgeServiceNames[subtype] = selected;
    }
    if (!switchCodes.length) continue;
    devices.push({
      id,
      name,
      category: firstString(accessory.context?.category) || null,
      productName: firstString(accessory.context?.productName, accessory.context?.product_name) || null,
      productId: firstString(accessory.context?.productId, accessory.context?.product_id) || null,
      model: firstString(accessory.context?.model) || null,
      online: undefined,
      statusCodes: Array.from(new Set(switchCodes)).sort(),
      schemaCodes: Array.from(new Set(switchCodes)).sort(),
      homebridgeServiceNames,
      fromCachedAccessory: true,
      label: `${name} (${id})`,
    });
  }
  return devices;
}

function collectDevicesFromObject(root) {
  const byId = new Map();

  function addDevice(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return;
    }

    const id = firstString(
      obj.id,
      obj.devId,
      obj.dev_id,
      obj.deviceId,
      obj.device_id,
      obj.uid,
    );

    const name = firstString(
      obj.name,
      obj.deviceName,
      obj.device_name,
      obj.customName,
      obj.custom_name,
      obj.title,
    );

    if (!id || !name) {
      return;
    }

    // Avoid adding automation scenes as selectable devices.
    if (obj.scene_id || obj.sceneId || obj.rule_id || obj.ruleId) {
      return;
    }

    const category = firstString(
      obj.category,
      obj.categoryCode,
      obj.category_code,
      obj.productCategory,
      obj.product_category,
    );

    const productName = firstString(
      obj.productName,
      obj.product_name,
      obj.product,
      obj.productTitle,
    );

    const productId = firstString(
      obj.productId,
      obj.product_id,
      obj.pid,
    );

    const model = firstString(obj.model, obj.modelId, obj.model_id);

    const status = Array.isArray(obj.status) ? obj.status : [];
    const statusCodes = status
      .map((item) => item && typeof item === 'object' ? firstString(item.code) : '')
      .filter(Boolean);

    const schema = Array.isArray(obj.schema) ? obj.schema : Array.isArray(obj.schemas) ? obj.schemas : [];
    const schemaCodes = schema
      .map((item) => item && typeof item === 'object' ? firstString(item.code) : '')
      .filter(Boolean);

    const existing = byId.get(id) || {};
    const merged = {
      id,
      name: existing.name || name,
      category: existing.category || category || null,
      productName: existing.productName || productName || null,
      productId: existing.productId || productId || null,
      model: existing.model || model || null,
      online: typeof obj.online === 'boolean' ? obj.online : existing.online,
      statusCodes: Array.from(new Set([...(existing.statusCodes || []), ...statusCodes])).sort(),
      schemaCodes: Array.from(new Set([...(existing.schemaCodes || []), ...schemaCodes])).sort(),
    };
    merged.likelyAirConditioner = looksLikeAirConditioner(merged)
      || merged.statusCodes.includes('temp_set')
      || merged.schemaCodes.includes('temp_set');
    merged.likelyWindowCovering = looksLikeWindowCovering(merged)
      || ['control', 'mach_operate', 'percent_state', 'percent_control', 'position', 'control_2', 'percent_control_2'].some((code) => merged.statusCodes.includes(code) || merged.schemaCodes.includes(code));
    merged.likelyPetFeeder = looksLikePetFeeder(merged)
      || ['quick_feed', 'manual_feed', 'slow_feed', 'meal_plan', 'feed_state'].some((code) => merged.statusCodes.includes(code) || merged.schemaCodes.includes(code));
    merged.label = `${merged.name} (${merged.id})`;
    byId.set(id, merged);
  }

  function walk(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    addDevice(value);

    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        walk(child);
      }
    }
  }

  walk(root);

  return Array.from(byId.values()).sort((a, b) => {
    if (a.likelyAirConditioner !== b.likelyAirConditioner) {
      return a.likelyAirConditioner ? -1 : 1;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}

(async () => {
  const { HomebridgePluginUiServer, RequestError } = await import('@homebridge/plugin-ui-utils');

  class TuyaNoDeveloperAccountUiServer extends HomebridgePluginUiServer {
    constructor() {
      super();
      this.sessions = new Map();
      this.onRequest('/qr/start', this.startQr.bind(this));
      this.onRequest('/qr/status', this.qrStatus.bind(this));
      this.onRequest('/auth/status', this.authStatus.bind(this));
      this.onRequest('/auth/clear', this.clearAuth.bind(this));
      this.onRequest('/auth/discover', this.discoverAuth.bind(this));
      this.onRequest('/devices/list', this.listDevices.bind(this));
      this.onRequest('/config/platform', this.getPlatformConfigFromDisk.bind(this));
      this.onRequest('/config/platform/save', this.savePlatformConfigToDisk.bind(this));
      this.onRequest('/config/adaptive-lighting/save', this.saveAdaptiveLightingToDisk.bind(this));
      this.onRequest('/config/switch-names/save', this.saveSwitchNamesToDisk.bind(this));
      this.onRequest('/config/switch-names/remove', this.removeSwitchNamesFromDisk.bind(this));
      this.ready();
    }

    getConfigFile() {
      return path.join(this.homebridgeStoragePath, 'config.json');
    }

    async readHomebridgeConfigFile() {
      const file = this.getConfigFile();
      const raw = await fs.promises.readFile(file, 'utf8');
      return JSON.parse(raw);
    }

    async writeHomebridgeConfigFile(config) {
      const file = this.getConfigFile();
      const body = `${JSON.stringify(config, null, 4)}\n`;
      // Match Path.write_text() from the proven manual repair script: write the
      // existing config.json in place. Replacing it with a temp inode can change
      // ownership/mode and can confuse Homebridge UI file watching on some installs.
      try {
        await fs.promises.access(file, fs.constants.F_OK);
        await fs.promises.writeFile(file, body, 'utf8');
      } catch (error) {
        if (error && error.code !== 'ENOENT') throw error;
        await fs.promises.writeFile(file, body, { encoding: 'utf8', mode: 0o600 });
      }
      return file;
    }

    async backupHomebridgeConfigFile(config, suffix) {
      const file = this.getConfigFile();
      const stamp = Math.floor(Date.now() / 1000);
      const backup = `${file}.${suffix}-${stamp}`;
      await fs.promises.writeFile(backup, `${JSON.stringify(config, null, 4)}\n`, { mode: 0o600 });
      return backup;
    }

    findTuyaPlatformConfig(config, create = false) {
      if (!config || typeof config !== 'object') {
        throw new RequestError('Invalid Homebridge config.json.', { status: 500 });
      }
      if (!Array.isArray(config.platforms)) {
        if (!create) return undefined;
        config.platforms = [];
      }
      let platform = config.platforms.find((entry) => entry && entry.platform === PLATFORM_NAME);
      if (!platform && create) {
        platform = { platform: PLATFORM_NAME, name: 'Tuya without developer account', mode: 'cloud', options: { projectType: '3', deviceOverrides: [] } };
        config.platforms.push(platform);
      }
      if (platform) {
        platform.options = platform.options && typeof platform.options === 'object' ? platform.options : {};
        platform.options.deviceOverrides = Array.isArray(platform.options.deviceOverrides) ? platform.options.deviceOverrides : [];
      }
      return platform;
    }

    normaliseSwitchNamesPayload(payload) {
      const id = firstString(payload?.id);
      if (!id) {
        throw new RequestError('Device ID is required.', { status: 400 });
      }
      const input = payload?.switchNames;
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new RequestError('switchNames must be an object keyed by Tuya channel code.', { status: 400 });
      }
      const switchNames = {};
      for (const [rawCode, rawName] of Object.entries(input)) {
        const code = firstString(rawCode);
        const name = firstString(rawName);
        if (!code || !name) continue;
        if (!/^switch(?:_\d+|_?usb_?\d+)?$/i.test(code)) {
          // Only save real switch/outlet gang names here. This prevents blind/pet/AC
          // settings from being mixed into the HomeKit Names section.
          continue;
        }
        switchNames[code] = name;
      }
      if (!Object.keys(switchNames).length) {
        throw new RequestError('At least one non-empty switch channel name is required.', { status: 400 });
      }
      return { id, switchNames };
    }

    mergeDuplicateOverrides(platform) {
      const merged = [];
      const byId = new Map();
      for (const raw of platform.options.deviceOverrides || []) {
        if (!raw || typeof raw !== 'object' || !firstString(raw.id)) continue;
        const id = firstString(raw.id);
        raw.id = id;
        if (!byId.has(id)) {
          byId.set(id, raw);
          merged.push(raw);
          continue;
        }
        const target = byId.get(id);
        for (const [key, value] of Object.entries(raw)) {
          if (key === 'id') continue;
          if (value && typeof value === 'object' && !Array.isArray(value)
              && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
            target[key] = { ...target[key], ...value };
          } else {
            target[key] = value;
          }
        }
      }
      platform.options.deviceOverrides = merged;
    }

    async getPlatformConfigFromDisk() {
      try {
        const config = await this.readHomebridgeConfigFile();
        const platformConfig = this.findTuyaPlatformConfig(config, false);
        return { platformConfig: platformConfig || null };
      } catch (error) {
        throw new RequestError(error.message || 'Failed to read Homebridge config.json.', { status: 500 });
      }
    }

    normalisePlatformPayload(platformConfig) {
      if (!platformConfig || typeof platformConfig !== 'object') {
        throw new RequestError('Invalid platform configuration payload.', { status: 400 });
      }
      const block = JSON.parse(JSON.stringify(platformConfig));
      block.platform = PLATFORM_NAME;
      block.mode = 'cloud';
      block.options = block.options && typeof block.options === 'object' ? block.options : {};
      block.options.projectType = '3';
      block.options.deviceOverrides = Array.isArray(block.options.deviceOverrides) ? block.options.deviceOverrides : [];
      this.mergeDuplicateOverrides(block);
      // The custom Pet Feeder override UI has been removed. Keep real Tuya cwwsq devices
      // working through automatic discovery, but do not persist custom petFeeder settings.
      for (const override of block.options.deviceOverrides) {
        if (!override || typeof override !== 'object') continue;
        delete override.petFeeder;
      }
      return block;
    }

    preserveDiskSwitchNames(existingPlatform, incomingPlatform) {
      // Channel names are written directly to config.json by the HomeKit Names UI.
      // Homebridge Config UI can later send a stale staged platform object that
      // does not contain those switchNames. Never allow that stale save path to
      // delete names that already exist on disk unless the dedicated remove
      // endpoint is used.
      const existingOverrides = Array.isArray(existingPlatform?.options?.deviceOverrides)
        ? existingPlatform.options.deviceOverrides
        : [];
      const incomingOverrides = Array.isArray(incomingPlatform?.options?.deviceOverrides)
        ? incomingPlatform.options.deviceOverrides
        : [];
      const incomingById = new Map();
      for (const item of incomingOverrides) {
        const id = firstString(item?.id);
        if (id) incomingById.set(id, item);
      }
      for (const oldItem of existingOverrides) {
        const id = firstString(oldItem?.id);
        const oldNames = oldItem?.switchNames;
        if (!id || !oldNames || typeof oldNames !== 'object' || Array.isArray(oldNames) || !Object.keys(oldNames).length) {
          continue;
        }
        let target = incomingById.get(id);
        if (!target) {
          target = { id };
          incomingOverrides.push(target);
          incomingById.set(id, target);
        }
        if (!target.switchNames || typeof target.switchNames !== 'object' || Array.isArray(target.switchNames) || !Object.keys(target.switchNames).length) {
          target.switchNames = { ...oldNames };
        }
      }
      incomingPlatform.options.deviceOverrides = incomingOverrides;
    }

    async savePlatformConfigToDisk(payload) {
      try {
        const incoming = this.normalisePlatformPayload(payload?.platformConfig || payload);
        const config = await this.readHomebridgeConfigFile();
        if (!Array.isArray(config.platforms)) {
          config.platforms = [];
        }
        const index = config.platforms.findIndex((entry) => entry && entry.platform === PLATFORM_NAME);
        const existing = index >= 0 ? config.platforms[index] : null;

        // config.json is the source of truth. Preserve channel names that were
        // already written by the dedicated direct-to-disk path, even if a stale
        // Homebridge UI object is later submitted.
        this.preserveDiskSwitchNames(existing, incoming);

        const backup = await this.backupHomebridgeConfigFile(config, 'bak-tuya-ui');
        if (index >= 0) {
          config.platforms[index] = incoming;
        } else {
          config.platforms.push(incoming);
        }
        await this.writeHomebridgeConfigFile(config);

        // Read back from disk before reporting success. This prevents the UI from
        // claiming a save succeeded when another writer replaced config.json.
        const verifyConfig = await this.readHomebridgeConfigFile();
        const verified = this.findTuyaPlatformConfig(verifyConfig, false);
        if (!verified) {
          throw new Error('Tuya platform block was not found after writing config.json.');
        }
        return { ok: true, backup, platformConfig: verified };
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(error.message || 'Failed to save Tuya platform config.json.', { status: 500 });
      }
    }

    async saveAdaptiveLightingToDisk(payload) {
      try {
        const enabled = payload?.enabled === true;
        const config = await this.readHomebridgeConfigFile();
        const backup = await this.backupHomebridgeConfigFile(config, 'bak-adaptive-lighting');
        const platform = this.findTuyaPlatformConfig(config, true);
        platform.options.enableAdaptiveLighting = enabled;
        await this.writeHomebridgeConfigFile(config);

        const verifyConfig = await this.readHomebridgeConfigFile();
        const verified = this.findTuyaPlatformConfig(verifyConfig, false);
        if (!verified || verified.options?.enableAdaptiveLighting !== enabled) {
          throw new Error('Adaptive Lighting value did not survive config.json read-back verification.');
        }
        return { ok: true, enabled, backup, platformConfig: verified };
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(error.message || 'Failed to save Adaptive Lighting to config.json.', { status: 500 });
      }
    }

    async saveSwitchNamesToDisk(payload) {
      const { id, switchNames } = this.normaliseSwitchNamesPayload(payload);
      try {
        const file = this.getConfigFile();
        const config = await this.readHomebridgeConfigFile();
        // Match the proven manual repair path: update config.json directly,
        // enable Homebridge-name sync, and change the re-import token once so
        // Apple Home receives a new accessory identity with the corrected gang
        // names. Do not rely on Homebridge UI's staged plugin config here.
        const backup = await this.backupHomebridgeConfigFile(config, 'bak-homekit-names');

        const platform = this.findTuyaPlatformConfig(config, true);
        this.mergeDuplicateOverrides(platform);
        platform.options.syncHomebridgeNamesToHomeKit = true;

        let override = platform.options.deviceOverrides.find((entry) => entry && entry.id === id);
        if (!override) {
          override = { id };
          platform.options.deviceOverrides.push(override);
        }

        override.switchNames = { ...switchNames };

        const previousToken = firstString(platform.options.homeKitNameReimportToken);
        // Match the manual Python script exactly: every GUI channel-name write
        // creates a fresh re-import token. Reusing an old token lets Apple Home
        // keep stale names such as Bathroom 1/2/3 even though config.json is fixed.
        const token = `names-fixed-${Math.floor(Date.now() / 1000)}`;
        platform.options.homeKitNameReimportToken = token;

        await this.writeHomebridgeConfigFile(config);

        const verifyConfig = await this.readHomebridgeConfigFile();
        const verifiedPlatform = this.findTuyaPlatformConfig(verifyConfig, false);
        const verifiedOverride = verifiedPlatform?.options?.deviceOverrides?.find((entry) => entry && entry.id === id);
        const verifiedNames = verifiedOverride?.switchNames;
        const sameNames = verifiedNames && Object.keys(switchNames).length === Object.keys(verifiedNames).length
          && Object.entries(switchNames).every(([code, name]) => verifiedNames[code] === name);
        if (!verifiedPlatform
            || verifiedPlatform.options?.syncHomebridgeNamesToHomeKit !== true
            || verifiedPlatform.options?.homeKitNameReimportToken !== token
            || !sameNames) {
          throw new Error('Channel-name values did not survive config.json read-back verification.');
        }

        return {
          ok: true,
          id,
          switchNames: verifiedNames,
          homeKitNameReimportToken: token,
          previousHomeKitNameReimportToken: previousToken || null,
          backup,
          platformConfig: verifiedPlatform,
        };
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(error.message || 'Failed to save channel names to config.json.', { status: 500 });
      }
    }

    async removeSwitchNamesFromDisk(payload) {
      const id = firstString(payload?.id);
      if (!id) {
        throw new RequestError('Device ID is required.', { status: 400 });
      }
      try {
        const config = await this.readHomebridgeConfigFile();
        const platform = this.findTuyaPlatformConfig(config, false);
        if (!platform) {
          return { ok: true, id, removed: false, platformConfig: null };
        }
        this.mergeDuplicateOverrides(platform);
        let removed = false;
        platform.options.deviceOverrides = platform.options.deviceOverrides.filter((entry) => {
          if (!entry || entry.id !== id) return true;
          delete entry.switchNames;
          removed = true;
          const keys = Object.keys(entry).filter((key) => key !== 'id' && entry[key] !== undefined && entry[key] !== null && entry[key] !== '');
          return keys.length > 0;
        });
        await this.writeHomebridgeConfigFile(config);
        return { ok: true, id, removed, platformConfig: platform };
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(error.message || 'Failed to remove channel names from config.json.', { status: 500 });
      }
    }

    getAuthFile(userCode) {
      return path.join(this.homebridgeStoragePath, `tuya-ha-qr-auth.${safeUserCode(userCode)}.json`);
    }

    async readAuthFile(userCode) {
      try {
        const raw = await fs.promises.readFile(this.getAuthFile(userCode), 'utf8');
        const data = JSON.parse(raw);
        const tokenInfo = data.tokenInfo || {};
        if (!data.userCode || !data.endpoint || !data.terminalId || !(tokenInfo.access_token || tokenInfo.accessToken) || !(tokenInfo.refresh_token || tokenInfo.refreshToken)) {
          return null;
        }
        data.tokenInfo = {
          ...tokenInfo,
          access_token: tokenInfo.access_token || tokenInfo.accessToken,
          refresh_token: tokenInfo.refresh_token || tokenInfo.refreshToken,
          expire_time: tokenInfo.expire_time || tokenInfo.expireTime || tokenInfo.expire || 7200,
        };
        return data;
      } catch {
        return null;
      }
    }

    async writeAuthFile(userCode, data) {
      const file = this.getAuthFile(userCode);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
      return file;
    }

    async fetchLiveDevices(userCode) {
      const code = normaliseUserCode(userCode);
      if (!code) {
        return { devices: [], message: 'No User Code was supplied for live Tuya discovery.' };
      }
      const authData = await this.readAuthFile(code);
      if (!authData) {
        return { devices: [], message: 'No saved QR authentication was found for live Tuya discovery.' };
      }

      const api = new TuyaHACloudAPI(
        code,
        authData.terminalId,
        authData.endpoint,
        authData.tokenInfo,
        console,
        false,
        async (tokenInfo) => {
          await this.writeAuthFile(code, {
            ...authData,
            endpoint: api.endpoint,
            tokenInfo,
            savedAt: Date.now(),
            refreshedAt: Date.now(),
          });
        },
      );
      const manager = new TuyaHADeviceManager(api, false);
      const homes = await manager.getHomeList();
      if (!homes || homes.success === false) {
        throw new Error(`Live Tuya home discovery failed: ${homes?.code || ''} ${homes?.msg || 'unknown error'}`.trim());
      }
      const homeIDs = (homes.result || [])
        .map((home) => firstString(home?.home_id, home?.ownerId, home?.id))
        .filter(Boolean);
      const liveDevices = await manager.updateDevices(homeIDs);
      await this.writeAuthFile(code, {
        ...authData,
        endpoint: api.endpoint,
        tokenInfo: api.exportTokenInfo(),
        savedAt: Date.now(),
      });
      return {
        devices: collectDevicesFromObject(liveDevices),
        message: `Loaded ${liveDevices.length} Tuya device(s) directly from the Tuya QR cloud API.`,
      };
    }

    async listDevices(payload = {}) {
      const allDevices = new Map();
      const errors = [];
      const sources = [];

      const mergeDevice = (device, source) => {
        if (!device || !firstString(device.id)) return;
        const id = firstString(device.id);
        const existing = allDevices.get(id) || {};
        const merged = {
          ...existing,
          ...device,
          id,
          name: firstString(device.name, existing.name, id),
          category: firstString(device.category, existing.category) || null,
          productName: firstString(device.productName, existing.productName) || null,
          productId: firstString(device.productId, existing.productId) || null,
          model: firstString(device.model, existing.model) || null,
          statusCodes: Array.from(new Set([...(existing.statusCodes || []), ...(device.statusCodes || [])])).sort(),
          schemaCodes: Array.from(new Set([...(existing.schemaCodes || []), ...(device.schemaCodes || [])])).sort(),
          homebridgeServiceNames: {
            ...(existing.homebridgeServiceNames || {}),
            ...(device.homebridgeServiceNames || {}),
          },
        };
        merged.likelyAirConditioner = device.likelyAirConditioner === true || existing.likelyAirConditioner === true || looksLikeAirConditioner(merged);
        merged.likelyWindowCovering = device.likelyWindowCovering === true || existing.likelyWindowCovering === true || looksLikeWindowCovering(merged);
        merged.likelyPetFeeder = device.likelyPetFeeder === true || existing.likelyPetFeeder === true || looksLikePetFeeder(merged);
        merged.label = `${merged.name} (${id})`;
        const previousSources = Array.isArray(existing.sources) ? existing.sources : [];
        merged.sources = Array.from(new Set([...previousSources, source].filter(Boolean)));
        allDevices.set(id, merged);
      };

      // 1) Runtime Tuya device cache written by the platform after discovery.
      const persistDir = path.join(this.homebridgeStoragePath, 'persist');
      const candidates = [];
      try {
        const entries = await fs.promises.readdir(persistDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !/^TuyaDeviceList.*\.json$/i.test(entry.name)) continue;
          const file = path.join(persistDir, entry.name);
          const stat = await fs.promises.stat(file);
          candidates.push({ file, mtimeMs: stat.mtimeMs });
        }
      } catch (err) {
        if (!err || err.code !== 'ENOENT') errors.push({ source: 'persist', message: err.message });
      }
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const candidate of candidates) {
        try {
          const data = JSON.parse(await fs.promises.readFile(candidate.file, 'utf8'));
          for (const device of collectDevicesFromObject(data)) mergeDevice(device, 'persist');
        } catch (err) {
          errors.push({ file: candidate.file, message: err.message });
        }
      }
      if (candidates.length) sources.push('persist cache');

      // 2) Homebridge cached accessories. This fallback is important for child
      // bridges / older installs where TuyaDeviceList.* is missing but the
      // multi-gang accessories and switch_1/switch_2/... service subtypes exist.
      try {
        const cachedDevices = await readCachedAccessoryDevices(this.homebridgeStoragePath);
        for (const device of cachedDevices) mergeDevice(device, 'cachedAccessories');
        if (cachedDevices.length) sources.push('cached accessories');
      } catch (err) {
        errors.push({ source: 'cachedAccessories', message: err.message });
      }

      // 3) Existing explicit switchNames in config.json must always remain
      // selectable even if both caches are unavailable.
      try {
        const config = await this.readHomebridgeConfigFile();
        const platform = this.findTuyaPlatformConfig(config, false);
        for (const override of platform?.options?.deviceOverrides || []) {
          const id = firstString(override?.id);
          const switchNames = override?.switchNames;
          if (!id || !switchNames || typeof switchNames !== 'object' || Array.isArray(switchNames)) continue;
          const codes = Object.keys(switchNames).filter((code) => /^switch(?:_\d+|_?usb_?\d+)?$/i.test(code));
          if (!codes.length) continue;
          mergeDevice({
            id,
            name: firstString(override.name, id),
            schemaCodes: codes,
            statusCodes: codes,
            homebridgeServiceNames: { ...switchNames },
            fromConfigOnly: true,
          }, 'config.json');
        }
      } catch (err) {
        errors.push({ source: 'config.json', message: err.message });
      }

      // 4) On an explicit "Load detected devices" request, query the same Tuya
      // QR cloud endpoints used by the runtime plugin. This removes the old hard
      // dependency on a previously-created persist/TuyaDeviceList.* file.
      const userCode = normaliseUserCode(payload.userCode);
      if (payload.refresh === true && userCode) {
        try {
          const live = await this.fetchLiveDevices(userCode);
          for (const device of live.devices || []) mergeDevice(device, 'live cloud');
          if ((live.devices || []).length) sources.push('live Tuya cloud');
        } catch (err) {
          errors.push({ source: 'live cloud', message: err.message });
        }
      }

      // Add the best cached Homebridge names to any device discovered through a
      // different path.
      try {
        const cachedServiceNames = await readCachedAccessoryServiceNames(this.homebridgeStoragePath);
        for (const [id, names] of cachedServiceNames.entries()) {
          const device = allDevices.get(id);
          if (device) device.homebridgeServiceNames = { ...(device.homebridgeServiceNames || {}), ...names };
        }
      } catch (err) {
        errors.push({ source: 'cached service names', message: err.message });
      }

      const devices = Array.from(allDevices.values()).sort((a, b) => {
        if (a.likelyAirConditioner !== b.likelyAirConditioner) return a.likelyAirConditioner ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      });

      return {
        devices,
        files: candidates.map((item) => item.file),
        errors,
        sources,
        message: devices.length
          ? `Loaded ${devices.length} Tuya device(s) from ${sources.length ? sources.join(', ') : 'available Homebridge data'}.`
          : 'No Tuya devices could be discovered from live cloud, Homebridge cached accessories, config.json overrides, or TuyaDeviceList cache.',
      };
    }


    async discoverAuth() {
      let entries;
      try {
        entries = await fs.promises.readdir(this.homebridgeStoragePath, { withFileTypes: true });
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          return { found: false, auths: [] };
        }
        throw err;
      }

      const auths = [];
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const match = entry.name.match(/^tuya-ha-qr-auth\.(.+)\.json$/i);
        if (!match) {
          continue;
        }
        const userCode = normaliseUserCode(match[1]);
        if (!userCode) {
          continue;
        }
        const file = path.join(this.homebridgeStoragePath, entry.name);
        try {
          const stat = await fs.promises.stat(file);
          const data = await this.readAuthFile(userCode);
          if (!data) {
            continue;
          }
          auths.push({
            userCode,
            file,
            username: data.username || null,
            uid: data.tokenInfo?.uid || null,
            endpoint: data.endpoint || null,
            savedAt: data.savedAt || null,
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // Ignore unreadable or incomplete auth files.
        }
      }

      auths.sort((a, b) => (b.savedAt || b.mtimeMs || 0) - (a.savedAt || a.mtimeMs || 0));
      const latest = auths[0] || null;
      return {
        found: !!latest,
        ...(latest || {}),
        auths,
      };
    }

    async authStatus(payload = {}) {
      const userCode = normaliseUserCode(payload.userCode);
      if (!userCode) {
        throw new RequestError('User Code is required.', { status: 400 });
      }
      const data = await this.readAuthFile(userCode);
      return {
        authenticated: !!data,
        file: this.getAuthFile(userCode),
        username: data?.username || null,
        uid: data?.tokenInfo?.uid || null,
        endpoint: data?.endpoint || null,
        savedAt: data?.savedAt || null,
      };
    }

    async clearAuth(payload = {}) {
      const userCode = normaliseUserCode(payload.userCode);
      if (!userCode) {
        throw new RequestError('User Code is required.', { status: 400 });
      }
      const file = this.getAuthFile(userCode);
      try {
        await fs.promises.unlink(file);
      } catch (err) {
        if (!err || err.code !== 'ENOENT') {
          throw err;
        }
      }
      this.sessions.delete(userCode);
      return { cleared: true, file };
    }

    async startQr(payload = {}) {
      const userCode = normaliseUserCode(payload.userCode);
      if (!userCode) {
        throw new RequestError('User Code is required.', { status: 400 });
      }

      const existing = await this.readAuthFile(userCode);
      if (existing && !payload.force) {
        return {
          alreadyAuthenticated: true,
          authenticated: true,
          file: this.getAuthFile(userCode),
          username: existing.username || null,
          uid: existing.tokenInfo?.uid || null,
          endpoint: existing.endpoint || null,
        };
      }

      const api = new TuyaHACloudAPI(userCode, '', 'https://apigw.iotbing.com', undefined, console, !!payload.debug);
      const response = await api.getQRCodeToken();
      if (!response || !response.success) {
        throw new RequestError(`Failed to create Tuya QR token: ${response?.code || ''} ${response?.msg || 'Unknown error'}`.trim(), {
          status: 502,
          response,
        });
      }

      const token = response.result?.qrcode;
      if (!token) {
        throw new RequestError('Tuya QR token response did not include result.qrcode.', { status: 502, response });
      }

      const qrPayload = `tuyaSmart--qrLogin?token=${token}`;
      const qrDataUrl = await qrcode.toDataURL(qrPayload, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 300,
      });

      this.sessions.set(userCode, {
        userCode,
        token,
        qrPayload,
        createdAt: Date.now(),
      });

      return {
        authenticated: false,
        alreadyAuthenticated: false,
        token,
        qrPayload,
        qrDataUrl,
        expiresInSeconds: 180,
      };
    }

    async qrStatus(payload = {}) {
      const userCode = normaliseUserCode(payload.userCode);
      if (!userCode) {
        throw new RequestError('User Code is required.', { status: 400 });
      }
      const session = this.sessions.get(userCode);
      if (!session) {
        const existing = await this.readAuthFile(userCode);
        if (existing) {
          return {
            authenticated: true,
            pending: false,
            file: this.getAuthFile(userCode),
            username: existing.username || null,
            uid: existing.tokenInfo?.uid || null,
            endpoint: existing.endpoint || null,
          };
        }
        throw new RequestError('No active QR session. Generate a QR code first.', { status: 404 });
      }

      if (Date.now() - session.createdAt > 3 * 60 * 1000) {
        this.sessions.delete(userCode);
        return {
          authenticated: false,
          pending: false,
          expired: true,
          message: 'QR code expired. Generate a new QR code.',
        };
      }

      const api = new TuyaHACloudAPI(userCode, '', 'https://apigw.iotbing.com', undefined, console, !!payload.debug);
      const loginResponse = await api.getQRCodeLoginResult(session.token);

      if (loginResponse && loginResponse.success) {
        const info = loginResponse.result || {};
        const authData = {
          userCode,
          terminalId: info.terminal_id || info.terminalId,
          endpoint: info.endpoint,
          tokenInfo: {
            t: loginResponse.t || info.t || Date.now(),
            uid: info.uid,
            expire_time: info.expire_time || info.expireTime || info.expire || 7200,
            access_token: info.access_token || info.accessToken,
            refresh_token: info.refresh_token || info.refreshToken,
          },
          username: info.username,
          savedAt: Date.now(),
        };

        if (!authData.terminalId || !authData.endpoint || !authData.tokenInfo.access_token || !authData.tokenInfo.refresh_token) {
          throw new RequestError('Tuya login succeeded but the response was incomplete.', {
            status: 502,
            response: loginResponse,
          });
        }

        const file = await this.writeAuthFile(userCode, authData);
        this.sessions.delete(userCode);
        return {
          authenticated: true,
          pending: false,
          file,
          username: authData.username || null,
          uid: authData.tokenInfo.uid || null,
          endpoint: authData.endpoint || null,
        };
      }

      const message = `${loginResponse?.code || ''} ${loginResponse?.msg || 'Waiting for scan / approval'}`.trim();
      return {
        authenticated: false,
        pending: true,
        code: loginResponse?.code || null,
        message,
      };
    }
  }

  return new TuyaNoDeveloperAccountUiServer();
})();
