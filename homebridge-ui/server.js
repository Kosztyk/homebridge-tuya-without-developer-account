'use strict';

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { default: TuyaHACloudAPI } = require('../dist/cloud/api/TuyaHACloudAPI');

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
      await fs.promises.writeFile(file, `${JSON.stringify(config, null, 4)}\n`, { mode: 0o600 });
      return file;
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

    async savePlatformConfigToDisk(payload) {
      try {
        const incoming = this.normalisePlatformPayload(payload?.platformConfig || payload);
        const config = await this.readHomebridgeConfigFile();
        if (!Array.isArray(config.platforms)) {
          config.platforms = [];
        }
        const index = config.platforms.findIndex((entry) => entry && entry.platform === PLATFORM_NAME);
        if (index >= 0) {
          config.platforms[index] = incoming;
        } else {
          config.platforms.push(incoming);
        }
        await this.writeHomebridgeConfigFile(config);
        return { ok: true, platformConfig: incoming };
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(error.message || 'Failed to save Tuya platform config.json.', { status: 500 });
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
        const backup = `${file}.bak-homekit-names-ui-${Date.now()}`;
        await fs.promises.writeFile(backup, `${JSON.stringify(config, null, 4)}\n`, { mode: 0o600 });

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
        const requestedToken = firstString(payload?.homeKitNameReimportToken);
        const token = requestedToken || `names-fixed-${Date.now()}`;
        platform.options.homeKitNameReimportToken = token;

        await this.writeHomebridgeConfigFile(config);
        return {
          ok: true,
          id,
          switchNames: override.switchNames,
          homeKitNameReimportToken: token,
          previousHomeKitNameReimportToken: previousToken || null,
          backup,
          platformConfig: platform,
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

    async listDevices() {
      const persistDir = path.join(this.homebridgeStoragePath, 'persist');
      let entries;
      try {
        entries = await fs.promises.readdir(persistDir, { withFileTypes: true });
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          return { devices: [], files: [], message: 'No Homebridge persist directory found yet. Authenticate and restart Homebridge once so the plugin can save a device list.' };
        }
        throw err;
      }

      const candidates = [];
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        if (!/^TuyaDeviceList.*\.json$/i.test(entry.name)) {
          continue;
        }
        const file = path.join(persistDir, entry.name);
        const stat = await fs.promises.stat(file);
        candidates.push({ file, mtimeMs: stat.mtimeMs });
      }

      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

      const allDevices = new Map();
      const errors = [];
      for (const candidate of candidates) {
        try {
          const data = JSON.parse(await fs.promises.readFile(candidate.file, 'utf8'));
          for (const device of collectDevicesFromObject(data)) {
            if (!allDevices.has(device.id)) {
              allDevices.set(device.id, device);
            }
          }
        } catch (err) {
          errors.push({ file: candidate.file, message: err.message });
        }
      }

      const cachedServiceNames = await readCachedAccessoryServiceNames(this.homebridgeStoragePath);
      for (const [id, names] of cachedServiceNames.entries()) {
        const device = allDevices.get(id);
        if (device) {
          device.homebridgeServiceNames = names;
        }
      }

      const devices = Array.from(allDevices.values()).sort((a, b) => {
        if (a.likelyAirConditioner !== b.likelyAirConditioner) {
          return a.likelyAirConditioner ? -1 : 1;
        }
        return String(a.name).localeCompare(String(b.name));
      });

      return {
        devices,
        files: candidates.map((item) => item.file),
        errors,
        message: devices.length ? `Loaded ${devices.length} Tuya device(s) from Homebridge persist cache.` : 'No devices found in TuyaDeviceList cache yet. Authenticate and restart Homebridge once, then reopen this settings page.',
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
