'use strict';

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { default: TuyaHACloudAPI } = require('../dist/cloud/api/TuyaHACloudAPI');

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
      this.ready();
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
