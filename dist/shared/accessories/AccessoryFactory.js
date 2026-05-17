"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const util_1 = require("../util/util");
const LightAccessory_1 = __importDefault(require("./LightAccessory"));
const DimmerAccessory_1 = __importDefault(require("./DimmerAccessory"));
const OutletAccessory_1 = __importDefault(require("./OutletAccessory"));
const SwitchAccessory_1 = __importDefault(require("./SwitchAccessory"));
const WirelessSwitchAccessory_1 = __importDefault(require("./WirelessSwitchAccessory"));
const SceneSwitchAccessory_1 = __importDefault(require("./SceneSwitchAccessory"));
const FanAccessory_1 = __importDefault(require("./FanAccessory"));
const GarageDoorAccessory_1 = __importDefault(require("./GarageDoorAccessory"));
const WindowAccessory_1 = __importDefault(require("./WindowAccessory"));
const WindowCoveringAccessory_1 = __importDefault(require("./WindowCoveringAccessory"));
const LockAccessory_1 = __importDefault(require("./LockAccessory"));
const ThermostatAccessory_1 = __importDefault(require("./ThermostatAccessory"));
const HeaterAccessory_1 = __importDefault(require("./HeaterAccessory"));
const HeaterAccessory_old_1 = __importDefault(require("./HeaterAccessory_old"));
const ValveAccessory_1 = __importDefault(require("./ValveAccessory"));
const ContactSensorAccessory_1 = __importDefault(require("./ContactSensorAccessory"));
const LeakSensorAccessory_1 = __importDefault(require("./LeakSensorAccessory"));
const CarbonMonoxideSensorAccessory_1 = __importDefault(require("./CarbonMonoxideSensorAccessory"));
const CarbonDioxideSensorAccessory_1 = __importDefault(require("./CarbonDioxideSensorAccessory"));
const SmokeSensorAccessory_1 = __importDefault(require("./SmokeSensorAccessory"));
const TemperatureHumiditySensorAccessory_1 = __importDefault(require("./TemperatureHumiditySensorAccessory"));
const LightSensorAccessory_1 = __importDefault(require("./LightSensorAccessory"));
const MotionSensorAccessory_1 = __importDefault(require("./MotionSensorAccessory"));
const AirQualitySensorAccessory_1 = __importDefault(require("./AirQualitySensorAccessory"));
const HumanPresenceSensorAccessory_1 = __importDefault(require("./HumanPresenceSensorAccessory"));
const HumidifierAccessory_1 = __importDefault(require("./HumidifierAccessory"));
const DehumidifierAccessory_1 = __importDefault(require("./DehumidifierAccessory"));
const DiffuserAccessory_1 = __importDefault(require("./DiffuserAccessory"));
const AirPurifierAccessory_1 = __importDefault(require("./AirPurifierAccessory"));
const ExtractionHoodAccessory_1 = __importDefault(require("./ExtractionHoodAccessory"));
const CameraAccessory_1 = __importDefault(require("./CameraAccessory"));
const SceneAccessory_1 = __importDefault(require("./SceneAccessory"));
const AirConditionerAccessory_1 = __importDefault(require("./AirConditionerAccessory"));
const IRControlHubAccessory_1 = __importDefault(require("./IRControlHubAccessory"));
const IRGenericAccessory_1 = __importDefault(require("./IRGenericAccessory"));
const IRAirConditionerAccessory_1 = __importDefault(require("./IRAirConditionerAccessory"));
const SecuritySystemAccessory_1 = __importDefault(require("./SecuritySystemAccessory"));
const VibrationSensorAccessory_1 = __importDefault(require("./VibrationSensorAccessory"));
const WeatherStationAccessory_1 = __importDefault(require("./WeatherStationAccessory"));
const DoorbellAccessory_1 = __importDefault(require("./DoorbellAccessory"));
const PetFeederAccessory_1 = __importDefault(require("./PetFeederAccessory"));
const WhiteNoiseLightAccessory_1 = __importDefault(require("./WhiteNoiseLightAccessory"));
const WetBulbGlobeTemperatureAccessory_1 = __importDefault(require("./WetBulbGlobeTemperatureAccessory"));
const IRControlHubSubAccessory_1 = __importDefault(require("./IRControlHubSubAccessory"));
const LocationWeatherAccessory_1 = __importDefault(require("./LocationWeatherAccessory"));
const TowerRackAccessory_1 = __importDefault(require("./TowerRackAccessory"));
class AccessoryFactory {
    static createAccessory(platform, accessory, device) {
        let handler;
        handler = resolveAccessoryByProductID(platform, accessory, device.product_id)
            || resolveAccessoryByCategory(platform, accessory, device.category);
        // basically use should set the handler at the switch-case
        if (!handler) {
            // IR Remote Control
            if (device.isIRRemoteControl()) {
                switch (device.remote_keys?.category_id) {
                    case 5: // AC
                        platform.log.warn('case IRAirConditionerAccessory');
                        handler = new IRAirConditionerAccessory_1.default(platform, accessory);
                        break;
                    default:
                        platform.log.warn('case IRGenericAccessory');
                        handler = new IRGenericAccessory_1.default(platform, accessory);
                        break;
                }
            }
        }
        if (handler && !handler.checkRequirements()) {
            handler = undefined;
        }
        if (!handler) {
            platform.log.warn(`Unsupported device: ${device.name}.`);
            handler = new BaseAccessory_1.default(platform, accessory);
        }
        handler.configureServices();
        handler.configureStatusActive();
        handler.updateAllValues();
        handler.initialized = true;
        return handler;
    }
    static configAccessory(platform, accessory) {
        const configs = platform.options.serviceInformationOverrides;
        // Always sanitize existing Name/ConfiguredName loaded from persist
        try {
            const info = accessory.getService(platform.Service.AccessoryInformation);
            if (info) {
                const currentConfigured = info.getCharacteristic(platform.Characteristic.ConfiguredName).value;
                const currentName = info.getCharacteristic(platform.Characteristic.Name).value;
                const safeConfigured = (0, util_1.sanitizeName)(currentConfigured) ?? undefined;
                const safeName = (0, util_1.sanitizeName)(currentName) ?? undefined;
                if (safeName && safeName !== currentName) {
                    info.getCharacteristic(platform.Characteristic.Name).updateValue(safeName);
                    platform.log.info(`Sanitized Name: ${currentName} -> ${safeName}`);
                }
                if (safeConfigured && safeConfigured !== currentConfigured) {
                    info.getCharacteristic(platform.Characteristic.ConfiguredName).updateValue(safeConfigured);
                    platform.log.info(`Sanitized ConfiguredName: ${currentConfigured} -> ${safeConfigured}`);
                }
            }
        }
        catch (e) {
            platform.log.debug('Failed to sanitize accessory name:', e);
        }
        if (!configs) {
            return;
        }
        const sn = accessory.getService(platform.Service.AccessoryInformation)?.getCharacteristic(platform.Characteristic.SerialNumber).value;
        configs.filter(config => config.device_id === sn).forEach(config => {
            try {
                const service = accessory.services[config.index];
                if (config.manifacturer) {
                    const before = service.getCharacteristic(platform.Characteristic.Manufacturer).value;
                    service.getCharacteristic(platform.Characteristic.Manufacturer).updateValue(config.manifacturer);
                    platform.log.info(`manifacturer updated. ${before} -> ${config.manifacturer}`);
                }
                if (config.model) {
                    const before = service.getCharacteristic(platform.Characteristic.Model).value;
                    service.getCharacteristic(platform.Characteristic.Model).updateValue(config.model);
                    platform.log.info(`model updated. ${before} -> ${config.model}`);
                }
                if (config.firmwareRevision) {
                    const before = service.getCharacteristic(platform.Characteristic.FirmwareRevision).value;
                    service.getCharacteristic(platform.Characteristic.FirmwareRevision).updateValue(config.firmwareRevision);
                    platform.log.info(`firmwareRevision updated. ${before} -> ${config.firmwareRevision}`);
                }
                if (config.configuredName) {
                    const safe = (0, util_1.sanitizeName)(config.configuredName)
                        ?? config.configuredName
                            .replace(/[^A-Za-z0-9 '\s]/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                    const before = service.getCharacteristic(platform.Characteristic.ConfiguredName).value;
                    service.getCharacteristic(platform.Characteristic.Name).updateValue(safe);
                    service.getCharacteristic(platform.Characteristic.ConfiguredName).updateValue(safe);
                    platform.log.info(`configuredName updated. ${before} -> ${safe}`);
                }
            }
            catch (_e) {
                platform.log.error(`index out of bound.:${config.index}`);
            }
        });
    }
}
exports.default = AccessoryFactory;
function resolveAccessoryByProductID(platform, accessory, product_id) {
    switch (product_id) {
        case 'scene': // see TuyaHomeDeviceManager#getSceneList
            return new SceneAccessory_1.default(platform, accessory);
        case 'virtual-product-id-wbgt':
            return new WetBulbGlobeTemperatureAccessory_1.default(platform, accessory);
        case 'virtual-product-id-weather':
            return new LocationWeatherAccessory_1.default(platform, accessory);
        default:
            return undefined;
    }
}
function resolveAccessoryByCategory(platform, accessory, category) {
    switch (category) {
        // Lighting
        case 'dj':
        case 'dsd':
        case 'xdd':
        case 'fwd':
        case 'dc':
        case 'dd':
        case 'gyd':
        case 'tyndj':
        case 'sxd':
            return new LightAccessory_1.default(platform, accessory);
        case 'tgq':
        case 'tgkg':
            return new DimmerAccessory_1.default(platform, accessory);
        // Electrical Products
        case 'dlq':
        case 'kg':
        case 'tdq':
        case 'qjdcz':
        case 'szjqr':
            return new SwitchAccessory_1.default(platform, accessory);
        case 'cz':
        case 'pc':
        case 'wkcz':
            return new OutletAccessory_1.default(platform, accessory);
        case 'wxkg':
            return new WirelessSwitchAccessory_1.default(platform, accessory);
        case 'cjkg':
            return new SceneSwitchAccessory_1.default(platform, accessory);
        case 'bzyd':
            return new WhiteNoiseLightAccessory_1.default(platform, accessory);
        // Large Home Appliances
        case 'kt':
        case 'ktkzq':
            return new AirConditionerAccessory_1.default(platform, accessory);
        // Small Home Appliances
        case 'qn':
            return new HeaterAccessory_1.default(platform, accessory);
        case 'qn_old':
            return new HeaterAccessory_old_1.default(platform, accessory);
        case 'kj':
            return new AirPurifierAccessory_1.default(platform, accessory);
        case 'xxj':
            return new DiffuserAccessory_1.default(platform, accessory);
        case 'ckmkzq':
            return new GarageDoorAccessory_1.default(platform, accessory);
        case 'cl':
        case 'clkg':
            return new WindowCoveringAccessory_1.default(platform, accessory);
        case 'cwwsq':
            return new PetFeederAccessory_1.default(platform, accessory);
        case 'mc':
            return new WindowAccessory_1.default(platform, accessory);
        case 'wk':
        case 'wkf':
            return new ThermostatAccessory_1.default(platform, accessory);
        case 'mjj':
            return new TowerRackAccessory_1.default(platform, accessory);
        case 'ggq':
        case 'sfkzq':
            return new ValveAccessory_1.default(platform, accessory);
        case 'jsq':
            return new HumidifierAccessory_1.default(platform, accessory);
        case 'cs':
            return new DehumidifierAccessory_1.default(platform, accessory);
        case 'fs':
        case 'fsd':
        case 'fskg':
            return new FanAccessory_1.default(platform, accessory);
        case 'yyj':
            return new ExtractionHoodAccessory_1.default(platform, accessory);
        // Security & Video Surveillance
        case 'sp':
            return new CameraAccessory_1.default(platform, accessory);
        case 'ywbj':
            return new SmokeSensorAccessory_1.default(platform, accessory);
        case 'mcs':
            return new ContactSensorAccessory_1.default(platform, accessory);
        case 'zd':
            return new VibrationSensorAccessory_1.default(platform, accessory);
        case 'rqbj':
        case 'jwbj':
        case 'sj':
            return new LeakSensorAccessory_1.default(platform, accessory);
        case 'cobj':
        case 'cocgq':
            return new CarbonMonoxideSensorAccessory_1.default(platform, accessory);
        case 'co2bj':
        case 'co2cgq':
            return new CarbonDioxideSensorAccessory_1.default(platform, accessory);
        case 'wsdcg':
            return new TemperatureHumiditySensorAccessory_1.default(platform, accessory);
        case 'ldcg':
            return new LightSensorAccessory_1.default(platform, accessory);
        case 'pir':
            return new MotionSensorAccessory_1.default(platform, accessory);
        case 'pm25':
        case 'pm2.5':
        case 'pm25cgq':
        case 'hjjcy':
            return new AirQualitySensorAccessory_1.default(platform, accessory);
        case 'hps':
            return new HumanPresenceSensorAccessory_1.default(platform, accessory);
        case 'ms':
        case 'jtmspro':
            return new LockAccessory_1.default(platform, accessory);
        case 'mal':
            return new SecuritySystemAccessory_1.default(platform, accessory);
        case 'wxml':
            return new DoorbellAccessory_1.default(platform, accessory);
        case 'qxj':
            return new WeatherStationAccessory_1.default(platform, accessory);
        // IR Control
        case 'wnykq':
        case 'hwktwkq':
        case 'wsdykq':
            return new IRControlHubAccessory_1.default(platform, accessory);
        case 'qt':
            platform.log.debug('early product. add switch-case at function resolveAccessoryByProductID()');
            // eslint-disable-next-line max-len
            platform.log.warn('use plugin options and config category to another. https://github.com/homebridge-plugins/homebridge-tuya/blob/develop_1.7.0/ADVANCED_OPTIONS.md https://github.com/homebridge-plugins/homebridge-tuya/blob/develop_1.7.0/SUPPORTED_DEVICES.md');
            return undefined;
        case 'infrared_tv':
        case 'infrared_stb':
        case 'infrared_box':
        case 'infrared_ac':
        case 'infrared_fan':
        case 'infrared_light':
        case 'infrared_amplifier':
        case 'infrared_projector':
        case 'infrared_waterheater':
        case 'infrared_airpurifier':
        case 'infrared_humidifier':
            // Since it's a DIY, it might be better to handle it with resolveAccessoryByProductID.
            return new IRControlHubSubAccessory_1.default(platform, accessory);
        default:
            return undefined;
    }
}
//# sourceMappingURL=AccessoryFactory.js.map