"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureTempDisplayUnits = configureTempDisplayUnits;
function configureTempDisplayUnits(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const { CELSIUS, FAHRENHEIT } = accessory.Characteristic.TemperatureDisplayUnits;
    service.getCharacteristic(accessory.Characteristic.TemperatureDisplayUnits)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return (status.value.toLowerCase() === 'c') ? CELSIUS : FAHRENHEIT;
    })
        .onSet(async (value) => {
        const status = accessory.getStatus(schema.code);
        const isLowerCase = status.value.toLowerCase() === status.value;
        let unit = (value === CELSIUS) ? 'c' : 'f';
        unit = isLowerCase ? unit.toLowerCase() : unit.toUpperCase();
        await accessory.sendCommands([{
                code: schema.code,
                value: unit,
            }]);
    });
}
//# sourceMappingURL=TemperatureDisplayUnits.js.map