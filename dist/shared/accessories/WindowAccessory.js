"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WindowCoveringAccessory_1 = __importDefault(require("./WindowCoveringAccessory"));
class WindowAccessory extends WindowCoveringAccessory_1.default {
    mainService() {
        return this.accessory.getService(this.Service.Window)
            || this.accessory.addService(this.Service.Window);
    }
}
exports.default = WindowAccessory;
//# sourceMappingURL=WindowAccessory.js.map