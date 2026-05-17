"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TuyaDeviceSchemaType = exports.TuyaDeviceSchemaMode = void 0;
var TuyaDeviceSchemaMode;
(function (TuyaDeviceSchemaMode) {
    TuyaDeviceSchemaMode["UNKNOWN"] = "";
    TuyaDeviceSchemaMode["READ_WRITE"] = "rw";
    TuyaDeviceSchemaMode["READ_ONLY"] = "ro";
    TuyaDeviceSchemaMode["WRITE_ONLY"] = "wo";
})(TuyaDeviceSchemaMode || (exports.TuyaDeviceSchemaMode = TuyaDeviceSchemaMode = {}));
var TuyaDeviceSchemaType;
(function (TuyaDeviceSchemaType) {
    TuyaDeviceSchemaType["Boolean"] = "Boolean";
    TuyaDeviceSchemaType["Integer"] = "Integer";
    TuyaDeviceSchemaType["Enum"] = "Enum";
    TuyaDeviceSchemaType["String"] = "String";
    TuyaDeviceSchemaType["Json"] = "Json";
    TuyaDeviceSchemaType["Raw"] = "Raw";
})(TuyaDeviceSchemaType || (exports.TuyaDeviceSchemaType = TuyaDeviceSchemaType = {}));
class TuyaDevice {
    constructor(obj) {
        Object.assign(this, obj);
        // Deep copy status array to ensure independence between instances
        if (Array.isArray(this.status)) {
            this.status = this.status.map(s => ({ ...s }));
        }
        else {
            this.status = [];
        }
        // Deep copy schema array to ensure independence between instances
        if (Array.isArray(this.schema)) {
            this.schema = this.schema.map(s => ({ ...s }));
        }
        else {
            this.schema = [];
        }
    }
    isVirtualDevice() {
        return this.id.startsWith('vdevo');
    }
    isIRControlHub() {
        return ['wnykq', 'hwktwkq', 'wsdykq']
            .includes(this.category);
    }
    isIRRemoteControl() {
        return this.remote_keys !== undefined || this.category.startsWith('infrared_');
    }
}
exports.default = TuyaDevice;
//# sourceMappingURL=TuyaDevice.js.map