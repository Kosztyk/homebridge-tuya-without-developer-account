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
      this.ready();
    }

    getAuthFile(userCode) {
      return path.join(this.homebridgeStoragePath, `tuya-ha-qr-auth.${safeUserCode(userCode)}.json`);
    }

    async readAuthFile(userCode) {
      try {
        const raw = await fs.promises.readFile(this.getAuthFile(userCode), 'utf8');
        const data = JSON.parse(raw);
        if (!data.userCode || !data.endpoint || !data.terminalId || !data.tokenInfo?.access_token || !data.tokenInfo?.refresh_token) {
          return null;
        }
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
          terminalId: info.terminal_id,
          endpoint: info.endpoint,
          tokenInfo: {
            t: loginResponse.t || info.t || Date.now(),
            uid: info.uid,
            expire_time: info.expire_time,
            access_token: info.access_token,
            refresh_token: info.refresh_token,
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
