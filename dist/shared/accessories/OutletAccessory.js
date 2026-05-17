"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const OutletInUse_1 = require("./characteristic/OutletInUse");
const SwitchAccessory_1 = __importDefault(require("./SwitchAccessory"));
const SCHEMA_CODE = {
    CURRENT: ['cur_current'],
};
class OutletAccessory extends SwitchAccessory_1.default {
    mainService() {
        return this.Service.Outlet;
    }
    configureSwitch(schema, name) {
        super.configureSwitch(schema, name);
        const service = this.accessory.getService(schema.code)
            || this.accessory.addService(this.mainService(), name, schema.code);
        (0, OutletInUse_1.configureOutletInUse)(this, service, this.getSchema(...SCHEMA_CODE.CURRENT));
    }
}
exports.default = OutletAccessory;
//# sourceMappingURL=OutletAccessory.js.map