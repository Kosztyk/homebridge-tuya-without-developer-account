"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const IR = require('../dist/shared/accessories/IRAirConditionerHAAccessory');
function hapFixture(config = {}) {
  const props = ['Manufacturer','Name','ConfiguredName','Model','SerialNumber','StatusActive','Active','CurrentHeaterCoolerState','TargetHeaterCoolerState','CurrentTemperature','RotationSpeed','HeatingThresholdTemperature','CoolingThresholdTemperature','CurrentHumidifierDehumidifierState','TargetHumidifierDehumidifierState','CurrentRelativeHumidity','TargetFanState','On'];
  const Characteristic = Object.fromEntries(props.map(name => [name, { UUID: `HAP-${name}`, ...({
    Active: { INACTIVE: 0, ACTIVE: 1 }, CurrentHeaterCoolerState: { INACTIVE: 0, IDLE: 1, HEATING: 2, COOLING: 3 },
    TargetHeaterCoolerState: { AUTO: 0, HEAT: 1, COOL: 2 }, TargetFanState: { AUTO: 0, MANUAL: 1 },
    CurrentHumidifierDehumidifierState: { DEHUMIDIFYING: 2 }, TargetHumidifierDehumidifierState: { DEHUMIDIFIER: 2 },
  }[name] || {}) }]));
  const names = ['AccessoryInformation','Battery','HeaterCooler','HumidifierDehumidifier','Fanv2','Switch','HumiditySensor','TemperatureSensor'];
  class FakeService {
    constructor(type,name,subtype) { this.UUID = type?.UUID || 'unknown'; this.subtype = subtype; this.displayName = name || type?.serviceName || 'Service'; this.characteristics=[]; }
    getCharacteristic(type) {
      let ch = this.characteristics.find(c=>c.UUID === type.UUID);
      if (!ch) {
        ch={ UUID:type.UUID, value: undefined, props: {}, onGet(f){this.getHandler=f;return this;}, onSet(f){this.setHandler=f;return this;}, setProps(v){this.props=v;return this;}, updateValue(v){this.value=v;return this;}, setCharacteristic(v){this.value=v;return this;} };
        this.characteristics.push(ch);
      }
      return ch;
    }
    setCharacteristic(type,value) {this.getCharacteristic(type).updateValue(value);return this;}
    updateCharacteristic(type,value) {return this.setCharacteristic(type,value);}
    addOptionalCharacteristic(type) {this.getCharacteristic(type);}
    testCharacteristic(type) {return this.characteristics.some(c=>c.UUID===type.UUID);}
    setPrimaryService(flag) {this.isPrimaryService=flag;}
  }
  const Service={};
  for(const name of names) Service[name]=class extends FakeService { static UUID=`HAP-${name}`; static serviceName=name; constructor(n,subtype){super(Service[name],n,subtype);} };
  const accessory={ context:{deviceID:'ir-remote'},displayName:'Livingroom IR AC',services:[],
    getService(type){return this.services.find(s=>s.UUID===type.UUID);},
    addService(type,name,subtype){const s=new type(name,subtype);this.services.push(s);return s;},
    getServiceById(type,subtype){return this.services.find(s=>s.UUID===type.UUID && s.subtype===subtype);},
    removeService(s){this.services=this.services.filter(x=>x!==s);},
  };
  const remote={id:'ir-remote',uuid:'ir-remote',name:'Livingroom IR AC',product_name:'IR remote',category:'infrared_ac',owner_id:'home',online:true,status:[],
    schema:[{code:'M',property:{min:0,max:4}},{code:'T',property:{min:17,max:30}},{code:'F',property:{min:0,max:3}}],
    isIRControlHub:()=>false};
  const requests=[];
  const manager={devices:[remote],getDevice:id=>id===remote.id?remote:undefined,sendCommands:async(id,commands)=>{requests.push({id,commands});return true;}};
  const platform={ deviceManager:manager,api:Object.assign(new EventEmitter(),{hap:{Service,Characteristic,HapStatusError:class HapStatusError extends Error {constructor(code){super('HAP '+code);this.code=code;}}}}),
    log:{warn(){},debug(){},info(){},error(){}},options:{preserveHomeKitNames:true,syncHomebridgeNamesToHomeKit:true,debug:false},
    getDeviceSchemaConfig:()=>undefined, getDeviceConfig:()=>({airConditioner:{minTemperature:18,maxTemperature:29},irAirConditioner:{localState:false,...config}}),
    accessoryHandlers:[]};
  return {accessory,platform,manager,requests,Characteristic,Service};
}

test('IR remote config creates a native HeaterCooler, preserving AC range overrides',()=>{
  const f=hapFixture(); const handler=new IR(f.platform,f.accessory);
  handler.configureServices();
  const svc=f.accessory.getService(f.Service.HeaterCooler);
  assert.ok(svc);
  assert.equal(svc.isPrimaryService,true);
  assert.equal(svc.getCharacteristic(f.Characteristic.CoolingThresholdTemperature).props.minValue,18);
  assert.equal(svc.getCharacteristic(f.Characteristic.CoolingThresholdTemperature).props.maxValue,29);
  assert.ok(f.accessory.getService(f.Service.HumidifierDehumidifier));
  assert.ok(f.accessory.getService(f.Service.Fanv2));
});
test('IR AC toggle calls QR PowerOn and PowerOff as HAP awaited writes',async()=>{
  const f=hapFixture(); const handler=new IR(f.platform,f.accessory);handler.configureServices();
  const svc=f.accessory.getService(f.Service.HeaterCooler); const ch=svc.getCharacteristic(f.Characteristic.Active);
  await ch.setHandler(1);assert.deepEqual(f.requests.map(r=>r.commands[0].code),['PowerOn']);
  await ch.setHandler(0);assert.deepEqual(f.requests.map(r=>r.commands[0].code),['PowerOn','PowerOff']);
});
test('IR AC physical hub state is not assumed when localState is disabled',()=>{
  const f=hapFixture({localState:false});const handler=new IR(f.platform,f.accessory);handler.configureServices();
  assert.equal(f.accessory.getService(f.Service.HumiditySensor),undefined);
  assert.equal(handler.findHub(),undefined);
});
test('IR AC optional dry/fan services can be hidden without hiding HeaterCooler',()=>{
  const f=hapFixture({dryAndFanModes:false,fanAutoSwitch:false});const handler=new IR(f.platform,f.accessory);handler.configureServices();
  assert.ok(f.accessory.getService(f.Service.HeaterCooler));
  assert.equal(f.accessory.getService(f.Service.HumidifierDehumidifier),undefined);
  assert.equal(f.accessory.getServiceById(f.Service.Switch,'ir_ac_fan_auto'),undefined);
  assert.ok(f.accessory.getServiceById(f.Service.Fanv2,'ir_ac_fan_speed'));
});
test('IR AC reports real cooling/heating only with a room temperature measurement',()=>{
  const f=hapFixture();const handler=new IR(f.platform,f.accessory);handler.configureServices();
  const svc=f.accessory.getService(f.Service.HeaterCooler);const ch=svc.getCharacteristic(f.Characteristic.CurrentHeaterCoolerState);
  handler.acState.power=1;handler.acState.mode=0;handler.acState.temp=22;
  assert.equal(ch.getHandler(),f.Characteristic.CurrentHeaterCoolerState.IDLE);
  handler.sensors.currentTemperature=26;
  assert.equal(ch.getHandler(),f.Characteristic.CurrentHeaterCoolerState.COOLING);
  handler.acState.mode=1;
  assert.equal(ch.getHandler(),f.Characteristic.CurrentHeaterCoolerState.IDLE);
});
test('IR AC command failure propagates through the HAP Active setter',async()=>{
  const f=hapFixture();f.manager.sendCommands=async()=>false;
  const handler=new IR(f.platform,f.accessory);handler.configureServices();
  const svc=f.accessory.getService(f.Service.HeaterCooler);const ch=svc.getCharacteristic(f.Characteristic.Active);
  await assert.rejects(ch.setHandler(1),e=>e.code===-70402);
  assert.equal(handler.acState.power,0);
});

test('explicit hubId accepts a hidden IR hub, creates humidity sensor, and starts local state', () => {
  const f = hapFixture({ hubId: 'hub-hidden', localState: true });
  const hub = { id: 'hub-hidden', category: 'hidden', original_category: 'hwktwkq', owner_id: 'home', name: 'Hidden hub' };
  f.manager.devices.push(hub);
  const handler = new IR(f.platform, f.accessory);
  let starts = 0;
  handler.startLocalState = async () => { starts++; };
  handler.configureServices();
  assert.equal(handler.findHub(), hub);
  assert.ok(f.accessory.getService(f.Service.HumiditySensor));
  assert.equal(starts, 1);
});

test('explicit hubId is authoritative even when the original category is not available', () => {
  const f = hapFixture({ hubId: 'hub-hidden', localState: true });
  const hub = { id: 'hub-hidden', category: 'hidden', owner_id: 'home' };
  f.manager.devices.push(hub);
  const handler = new IR(f.platform, f.accessory);
  assert.equal(handler.findHub(), hub);
});

test('auto-discovery uses original Tuya category of a hidden hub in the same home', () => {
  const f = hapFixture({ localState: true });
  const hub = { id: 'hub-a', category: 'hidden', original_category: 'hwktwkq', owner_id: 'home' };
  const otherHomeHub = { id: 'hub-b', category: 'hwktwkq', owner_id: 'other-home' };
  const hiddenNonHub = { id: 'plug', category: 'hidden', original_category: 'cz', owner_id: 'home' };
  f.manager.devices.push(hub, otherHomeHub, hiddenNonHub);
  const handler = new IR(f.platform, f.accessory);
  let starts = 0;
  handler.startLocalState = async () => { starts++; };
  handler.configureServices();
  assert.equal(handler.findHub(), hub);
  assert.ok(f.accessory.getService(f.Service.HumiditySensor));
  assert.equal(starts, 1);
});

test('auto-discovery refuses ambiguous same-home IR hubs until hubId is specified', () => {
  const f = hapFixture({ localState: true });
  f.manager.devices.push(
    { id: 'hub-a', category: 'hidden', original_category: 'hwktwkq', owner_id: 'home' },
    { id: 'hub-b', category: 'wnykq', owner_id: 'home' },
  );
  const handler = new IR(f.platform, f.accessory);
  handler.configureServices();
  assert.equal(handler.findHub(), undefined);
  assert.equal(f.accessory.getService(f.Service.HumiditySensor), undefined);
});

test('migrates old IR AC fan service subtypes without touching new services', () => {
  const f = hapFixture({ dryAndFanModes: false });
  const oldFan = f.accessory.addService(f.Service.Fanv2, 'Legacy Fan', 'fan_speed');
  const oldAuto = f.accessory.addService(f.Service.Switch, 'Legacy Auto', 'fan_auto');
  const unrelated = f.accessory.addService(f.Service.Switch, 'Extra Switch', 'unrelated');
  const handler = new IR(f.platform, f.accessory);
  handler.configureServices();
  assert.ok(!f.accessory.services.includes(oldFan));
  assert.ok(!f.accessory.services.includes(oldAuto));
  assert.ok(f.accessory.services.includes(unrelated));
  assert.ok(f.accessory.getServiceById(f.Service.Fanv2, 'ir_ac_fan_speed'));
  assert.ok(f.accessory.getServiceById(f.Service.Switch, 'ir_ac_fan_auto'));
  assert.equal(f.accessory.getServiceById(f.Service.Fanv2, 'fan_speed'), undefined);
  assert.equal(f.accessory.getServiceById(f.Service.Switch, 'fan_auto'), undefined);
});

test('old IR AC fan services removed even when the corresponding new feature is disabled', () => {
  const f = hapFixture({ dryAndFanModes: true, fanAutoSwitch: false });
  f.accessory.addService(f.Service.Fanv2, 'Legacy Fan', 'fan_speed');
  f.accessory.addService(f.Service.Switch, 'Legacy Auto', 'fan_auto');
  const handler = new IR(f.platform, f.accessory);
  handler.configureServices();
  assert.equal(f.accessory.getServiceById(f.Service.Fanv2, 'fan_speed'), undefined);
  assert.equal(f.accessory.getServiceById(f.Service.Switch, 'fan_auto'), undefined);
  assert.equal(f.accessory.getServiceById(f.Service.Switch, 'ir_ac_fan_auto'), undefined);
});


test('connected LAN hub power wins over delayed QR cloud power, while QR mode/temp/fan refresh',async()=>{
  const f=hapFixture();
  const handler=new IR(f.platform,f.accessory);
  handler.configureServices();
  handler.updateAllValues=async()=>{};
  handler.hubConnection={connected:true};
  handler.onHubDps({1:true,2:254,3:22,4:'warm',5:'middle',12:63});
  assert.equal(handler.acState.power,1);
  await handler.onDeviceStatusUpdate([
    {code:'power',value:false},{code:'mode',value:0},{code:'temp',value:23},{code:'wind',value:1},
  ]);
  assert.equal(handler.acState.power,1,'cloud must not turn off the IR AC after a physical-remote ON');
  assert.equal(handler.known.power,1,'known state must also preserve hub power');
  assert.equal(handler.acState.mode,0);
  assert.equal(handler.acState.temp,23);
  assert.equal(handler.acState.wind,1);
  assert.equal(handler.sensors.currentTemperature,25.4);
  assert.equal(handler.sensors.humidity,63);
});

test('partial hub DPS without power retains power and updates fan/temperature/humidity',()=>{
  const f=hapFixture();
  const handler=new IR(f.platform,f.accessory);
  handler.configureServices();
  handler.updateAllValues=async()=>{};
  handler.hubConnection={connected:true};
  handler.onHubDps({1:true,3:23,4:'cold',5:'low',12:61});
  handler.onHubDps({3:25,4:'warm',5:'high',12:66});
  assert.deepEqual({power:handler.acState.power,mode:handler.acState.mode,temp:handler.acState.temp,wind:handler.acState.wind,humidity:handler.sensors.humidity},
    {power:1,mode:1,temp:25,wind:3,humidity:66});
});

test('cloud power resumes authority after hub disconnect',async()=>{
  const f=hapFixture();
  const handler=new IR(f.platform,f.accessory);
  handler.configureServices();
  handler.updateAllValues=async()=>{};
  handler.hubConnection={connected:true};
  handler.onHubDps({1:true});
  await handler.onDeviceStatusUpdate([{code:'power',value:false}]);
  assert.equal(handler.acState.power,1);
  handler.hubConnection.connected=false;
  await handler.onDeviceStatusUpdate([{code:'power',value:false}]);
  assert.equal(handler.acState.power,0);
  assert.equal(handler.known.power,0);
});

test('without a LAN hub QR cloud power is still applied',async()=>{
  const f=hapFixture();
  const handler=new IR(f.platform,f.accessory);
  handler.configureServices();
  handler.updateAllValues=async()=>{};
  handler.applyState({power:1});
  await handler.onDeviceStatusUpdate([{code:'power',value:false}]);
  assert.equal(handler.acState.power,0);
});
