"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TUYA_HA_QR_ENDPOINT = exports.TUYA_HA_SCHEMA = exports.TUYA_HA_CLIENT_ID = void 0;
/* eslint-disable max-len */
const https_1 = __importDefault(require("https"));
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("../../shared/util/util");
const Logger_1 = require("../../shared/util/Logger");
exports.TUYA_HA_CLIENT_ID = 'HA_3y9q4ak7g4ephrvke';
exports.TUYA_HA_SCHEMA = 'haauthorize';
exports.TUYA_HA_QR_ENDPOINT = 'https://apigw.iotbing.com';
class TuyaHACloudAPI {
    constructor(userCode, terminalId, endpoint, tokenInfo, log = console, debug = false) {
        this.userCode = userCode;
        this.terminalId = terminalId;
        this.endpoint = endpoint;
        this.log = log;
        this.debug = debug;
        this.tokenInfo = {
            access_token: '',
            refresh_token: '',
            uid: '',
            expire: 0,
        };
        this.refreshTokenInProgress = false;
        this.log = new Logger_1.PrefixLogger(log, TuyaHACloudAPI.name, debug);
        if (tokenInfo) {
            this.setTokenInfo(tokenInfo);
        }
    }
    setTokenInfo(tokenInfo) {
        this.tokenInfo = {
            access_token: tokenInfo.access_token,
            refresh_token: tokenInfo.refresh_token,
            uid: tokenInfo.uid,
            expire: (tokenInfo.t || Date.now()) + (tokenInfo.expire_time || 0) * 1000,
        };
    }
    exportTokenInfo() {
        return {
            t: Date.now(),
            uid: this.tokenInfo.uid,
            expire_time: Math.max(0, Math.floor((this.tokenInfo.expire - Date.now()) / 1000)),
            access_token: this.tokenInfo.access_token,
            refresh_token: this.tokenInfo.refresh_token,
        };
    }
    isLogin() {
        return this.tokenInfo.access_token.length > 0;
    }
    isTokenExpired() {
        return (this.tokenInfo.expire - 60 * 1000 <= Date.now());
    }
    async getQRCodeToken() {
        const path = `/v1.0/m/life/home-assistant/qrcode/tokens?clientid=${encodeURIComponent(exports.TUYA_HA_CLIENT_ID)}&usercode=${encodeURIComponent(this.userCode)}&schema=${encodeURIComponent(exports.TUYA_HA_SCHEMA)}`;
        return this.rawRequest('POST', exports.TUYA_HA_QR_ENDPOINT, path);
    }
    async getQRCodeLoginResult(token) {
        const path = `/v1.0/m/life/home-assistant/qrcode/tokens/${encodeURIComponent(token)}?clientid=${encodeURIComponent(exports.TUYA_HA_CLIENT_ID)}&usercode=${encodeURIComponent(this.userCode)}`;
        return this.rawRequest('GET', exports.TUYA_HA_QR_ENDPOINT, path);
    }
    async rawRequest(method, endpoint, path, body) {
        this.log.debug('HA raw request: %s %s%s', method, endpoint, path);
        const res = await (0, util_1.retry)(async () => new Promise((resolve, reject) => {
            const req = https_1.default.request({
                host: new URL(endpoint).host,
                method,
                path,
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
            }, response => {
                response.setEncoding('utf8');
                let rawData = '';
                response.on('data', chunk => rawData += chunk);
                response.on('end', () => {
                    try {
                        const parsed = rawData ? JSON.parse(rawData) : {};
                        resolve(parsed);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', reject);
            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        }), { retriesMax: 3, interval: 500, exponential: true, factor: 2, jitter: 100 });
        this.log.debug('HA raw response: %s', JSON.stringify(res));
        return res;
    }
    async refreshAccessTokenIfNeed() {
        if (!this.isLogin()) {
            return;
        }
        if (!this.isTokenExpired()) {
            return;
        }
        if (this.refreshTokenInProgress) {
            return;
        }
        this.refreshTokenInProgress = true;
        try {
            this.log.info('Refreshing Tuya Home Assistant QR access token.');
            const response = await this.get(`/v1.0/m/token/${this.tokenInfo.refresh_token}`);
            if (response && response.success) {
                const result = response.result || {};
                const tokenInfo = {
                    t: response.t || Date.now(),
                    expire_time: result.expireTime || result.expire_time || 0,
                    uid: result.uid,
                    access_token: result.accessToken || result.access_token,
                    refresh_token: result.refreshToken || result.refresh_token,
                };
                this.setTokenInfo(tokenInfo);
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.log.error('Failed to refresh Tuya access token: %s', msg);
        }
        finally {
            this.refreshTokenInProgress = false;
        }
    }
    async request(method, path, params, body) {
        if (!this.refreshTokenInProgress) {
            await this.refreshAccessTokenIfNeed();
        }
        const rid = (0, util_1.generateUUID)();
        const sid = '';
        const hashKey = crypto_1.default.createHash('md5').update(rid + this.tokenInfo.refresh_token).digest('hex');
        const secret = this.secretGenerating(rid, sid, hashKey);
        let queryEncData = '';
        let finalParams;
        if (params && Object.keys(params).length > 0) {
            queryEncData = this.aesGcmEncrypt(this.formToJson(params), secret);
            finalParams = { encdata: queryEncData };
        }
        let bodyEncData = '';
        let finalBody;
        if (body && Object.keys(body).length > 0) {
            bodyEncData = this.aesGcmEncrypt(this.formToJson(body), secret);
            finalBody = { encdata: bodyEncData };
        }
        const t = Date.now();
        const headers = {
            'X-appKey': exports.TUYA_HA_CLIENT_ID,
            'X-requestId': rid,
            'X-sid': sid,
            'X-time': String(t),
        };
        if (this.tokenInfo.access_token) {
            headers['X-token'] = this.tokenInfo.access_token;
        }
        headers['X-sign'] = this.restfulSign(hashKey, queryEncData, bodyEncData, headers);
        let requestPath = path;
        if (finalParams) {
            requestPath += '?' + new URLSearchParams(finalParams).toString();
        }
        this.log.debug('HA encrypted request:\nmethod = %s\nendpoint = %s\npath = %s\nbody = %s', method, this.endpoint, requestPath, JSON.stringify(finalBody));
        const res = await (0, util_1.retry)(async () => new Promise((resolve, reject) => {
            const req = https_1.default.request({
                host: new URL(this.endpoint).host,
                method,
                path: requestPath,
                headers,
            }, response => {
                response.setEncoding('utf8');
                let rawData = '';
                response.on('data', chunk => rawData += chunk);
                response.on('end', () => {
                    try {
                        const parsed = rawData ? JSON.parse(rawData) : {};
                        if (parsed && parsed.success && parsed.result && typeof parsed.result === 'string') {
                            const decrypted = this.aesGcmDecrypt(parsed.result, secret);
                            try {
                                parsed.result = JSON.parse(decrypted);
                            }
                            catch {
                                parsed.result = decrypted;
                            }
                        }
                        resolve(parsed);
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
            req.on('error', reject);
            if (finalBody) {
                req.write(JSON.stringify(finalBody));
            }
            req.end();
        }), { retriesMax: 5, interval: 300, exponential: true, factor: 2, jitter: 100 });
        this.log.debug('HA encrypted response: %s', JSON.stringify(res));
        return res;
    }
    async get(path, params) {
        return this.request('GET', path, params || null, null);
    }
    async post(path, params, body) {
        // Keep compatibility with the old plugin style where post(path, body) is common.
        if (body === undefined) {
            body = params || null;
            params = null;
        }
        return this.request('POST', path, params || null, body || null);
    }
    async put(path, body) {
        return this.request('PUT', path, null, body || null);
    }
    async delete(path, params) {
        return this.request('DELETE', path, params || null, null);
    }
    async getDeviceDetails(deviceId) {
        return this.get('/v1.0/m/life/ha/devices/detail', { devIds: deviceId });
    }
    formToJson(content) {
        return JSON.stringify(content);
    }
    randomNonce(length = 12) {
        const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
        let value = '';
        for (let i = 0; i < length; i++) {
            value += chars[Math.floor(Math.random() * chars.length)];
        }
        return value;
    }
    aesGcmEncrypt(rawData, secret) {
        const nonce = this.randomNonce(12);
        const cipher = crypto_1.default.createCipheriv('aes-128-gcm', Buffer.from(secret, 'utf8'), Buffer.from(nonce, 'utf8'));
        const encrypted = Buffer.concat([cipher.update(rawData, 'utf8'), cipher.final(), cipher.getAuthTag()]);
        return Buffer.from(nonce, 'utf8').toString('base64') + encrypted.toString('base64');
    }
    aesGcmDecrypt(cipherData, secret) {
        const data = Buffer.from(cipherData, 'base64');
        const nonce = data.subarray(0, 12);
        const cipherTextWithTag = data.subarray(12);
        const authTag = cipherTextWithTag.subarray(cipherTextWithTag.length - 16);
        const cipherText = cipherTextWithTag.subarray(0, cipherTextWithTag.length - 16);
        const decipher = crypto_1.default.createDecipheriv('aes-128-gcm', Buffer.from(secret, 'utf8'), nonce);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
    }
    secretGenerating(rid, sid, hashKey) {
        let message = hashKey;
        const mod = 16;
        if (sid !== '') {
            const sidLength = sid.length;
            const length = sidLength < mod ? sidLength : mod;
            let ecode = '';
            for (let i = 0; i < length; i++) {
                const idx = sid.charCodeAt(i) % mod;
                ecode += sid[idx];
            }
            message += '_' + ecode;
        }
        return crypto_1.default.createHmac('sha256', Buffer.from(rid, 'utf8')).update(Buffer.from(message, 'utf8')).digest('hex').slice(0, 16);
    }
    restfulSign(hashKey, queryEncData, bodyEncData, data) {
        const headers = ['X-appKey', 'X-requestId', 'X-sid', 'X-time', 'X-token'];
        const headerParts = [];
        for (const item of headers) {
            const val = data[item] || '';
            if (val !== '') {
                headerParts.push(`${item}=${val}`);
            }
        }
        let signStr = headerParts.join('||');
        if (queryEncData) {
            signStr += queryEncData;
        }
        if (bodyEncData) {
            signStr += bodyEncData;
        }
        return crypto_1.default.createHmac('sha256', Buffer.from(hashKey, 'utf8')).update(Buffer.from(signStr, 'utf8')).digest('hex');
    }
}
exports.default = TuyaHACloudAPI;
//# sourceMappingURL=TuyaHACloudAPI.js.map