"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SecuritySystemState_1 = require("./characteristic/SecuritySystemState");
const Name_1 = require("./characteristic/Name");
const SCHEMA_CODE = {
    MASTER_MODE: ['master_mode'],
    SOS_STATE: ['sos_state'],
};
class SecuritySystemAccessory extends BaseAccessory_1.default {
    constructor() {
        super(...arguments);
        this.isNightArm = false;
    }
    requiredSchema() {
        return [SCHEMA_CODE.MASTER_MODE, SCHEMA_CODE.SOS_STATE];
    }
    configureServices() {
        const service = this.accessory.getService(this.Service.SecuritySystem)
            || this.accessory.addService(this.Service.SecuritySystem);
        (0, Name_1.configureName)(this, service, this.device.name);
        (0, SecuritySystemState_1.configureSecuritySystemCurrentState)(this, service, this.getSchema(...SCHEMA_CODE.MASTER_MODE), this.getSchema(...SCHEMA_CODE.SOS_STATE));
        (0, SecuritySystemState_1.configureSecuritySystemTargetState)(this, service, this.getSchema(...SCHEMA_CODE.MASTER_MODE), this.getSchema(...SCHEMA_CODE.SOS_STATE));
    }
}
exports.default = SecuritySystemAccessory;
//# sourceMappingURL=SecuritySystemAccessory.js.map