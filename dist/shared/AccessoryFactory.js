"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./accessories/BaseAccessory"));
const LightAccessory_1 = __importDefault(require("./accessories/LightAccessory"));
const DimmerAccessory_1 = __importDefault(require("./accessories/DimmerAccessory"));
const OutletAccessory_1 = __importDefault(require("./accessories/OutletAccessory"));
const SwitchAccessory_1 = __importDefault(require("./accessories/SwitchAccessory"));
const WirelessSwitchAccessory_1 = __importDefault(require("./accessories/WirelessSwitchAccessory"));
const SceneSwitchAccessory_1 = __importDefault(require("./accessories/SceneSwitchAccessory"));
const FanAccessory_1 = __importDefault(require("./accessories/FanAccessory"));
const GarageDoorAccessory_1 = __importDefault(require("./accessories/GarageDoorAccessory"));
const WindowAccessory_1 = __importDefault(require("./accessories/WindowAccessory"));
const WindowCoveringAccessory_1 = __importDefault(require("./accessories/WindowCoveringAccessory"));
const BlindsAccessory_1 = __importDefault(require("./accessories/BlindsAccessory"));
const LockAccessory_1 = __importDefault(require("./accessories/LockAccessory"));
const ThermostatAccessory_1 = __importDefault(require("./accessories/ThermostatAccessory"));
const HeaterAccessory_1 = __importDefault(require("./accessories/HeaterAccessory"));
const ValveAccessory_1 = __importDefault(require("./accessories/ValveAccessory"));
const ContactSensorAccessory_1 = __importDefault(require("./accessories/ContactSensorAccessory"));
const LeakSensorAccessory_1 = __importDefault(require("./accessories/LeakSensorAccessory"));
const CarbonMonoxideSensorAccessory_1 = __importDefault(require("./accessories/CarbonMonoxideSensorAccessory"));
const CarbonDioxideSensorAccessory_1 = __importDefault(require("./accessories/CarbonDioxideSensorAccessory"));
const SmokeSensorAccessory_1 = __importDefault(require("./accessories/SmokeSensorAccessory"));
const TemperatureHumiditySensorAccessory_1 = __importDefault(require("./accessories/TemperatureHumiditySensorAccessory"));
const LightSensorAccessory_1 = __importDefault(require("./accessories/LightSensorAccessory"));
const MotionSensorAccessory_1 = __importDefault(require("./accessories/MotionSensorAccessory"));
const AirQualitySensorAccessory_1 = __importDefault(require("./accessories/AirQualitySensorAccessory"));
const HumanPresenceSensorAccessory_1 = __importDefault(require("./accessories/HumanPresenceSensorAccessory"));
const HumidifierAccessory_1 = __importDefault(require("./accessories/HumidifierAccessory"));
const DehumidifierAccessory_1 = __importDefault(require("./accessories/DehumidifierAccessory"));
const DiffuserAccessory_1 = __importDefault(require("./accessories/DiffuserAccessory"));
const AirPurifierAccessory_1 = __importDefault(require("./accessories/AirPurifierAccessory"));
const ExtractionHoodAccessory_1 = __importDefault(require("./accessories/ExtractionHoodAccessory"));
const CameraAccessory_1 = __importDefault(require("./accessories/CameraAccessory"));
const SceneAccessory_1 = __importDefault(require("./accessories/SceneAccessory"));
const AirConditionerAccessory_1 = __importDefault(require("./accessories/AirConditionerAccessory"));
const IRControlHubAccessory_1 = __importDefault(require("./accessories/IRControlHubAccessory"));
const IRGenericAccessory_1 = __importDefault(require("./accessories/IRGenericAccessory"));
const IRAirConditionerAccessory_1 = __importDefault(require("./accessories/IRAirConditionerAccessory"));
const SecuritySystemAccessory_1 = __importDefault(require("./accessories/SecuritySystemAccessory"));
const VibrationSensorAccessory_1 = __importDefault(require("./accessories/VibrationSensorAccessory"));
const WeatherStationAccessory_1 = __importDefault(require("./accessories/WeatherStationAccessory"));
const DoorbellAccessory_1 = __importDefault(require("./accessories/DoorbellAccessory"));
const PetFeederAccessory_1 = __importDefault(require("./accessories/PetFeederAccessory"));
const WhiteNoiseLightAccessory_1 = __importDefault(require("./accessories/WhiteNoiseLightAccessory"));
const WetBulbGlobeTemperatureAccessory_1 = __importDefault(require("./accessories/WetBulbGlobeTemperatureAccessory"));
const IRControlHubSubAccessory_1 = __importDefault(require("./accessories/IRControlHubSubAccessory"));
const LocationWeatherAccessory_1 = __importDefault(require("./accessories/LocationWeatherAccessory"));
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
                    const before = service.getCharacteristic(platform.Characteristic.ConfiguredName).value;
                    service.getCharacteristic(platform.Characteristic.Name).updateValue(config.configuredName);
                    service.getCharacteristic(platform.Characteristic.ConfiguredName).updateValue(config.configuredName);
                    platform.log.info(`configuredName updated. ${before} -> ${config.configuredName}`);
                }
            }
            catch {
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
        case 'kj':
            return new AirPurifierAccessory_1.default(platform, accessory);
        case 'xxj':
            return new DiffuserAccessory_1.default(platform, accessory);
        case 'ckmkzq':
            return new GarageDoorAccessory_1.default(platform, accessory);
        case 'mg':
        case 'mgmt':
            return new BlindsAccessory_1.default(platform, accessory);
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