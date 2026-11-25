// src/core/drivers/driverManager.js
// Gestor y registro central de Drivers de Hardware (HAL) de RobotOS SmartHouse

import { LightDriver } from './LightDriver.js';
import { CameraDriver } from './CameraDriver.js';
import { LockDriver } from './LockDriver.js';
import { ClimateDriver } from './ClimateDriver.js';
import { MotionSensorDriver } from './MotionSensorDriver.js';
import { SmokeSensorDriver } from './SmokeSensorDriver.js';
import { GasSensorDriver } from './GasSensorDriver.js';
import { DoorbellDriver } from './DoorbellDriver.js';
import { GarbageCollectorDriver } from './GarbageCollectorDriver.js';
import { IrrigationDriver } from './IrrigationDriver.js';
import { GarageDoorDriver } from './GarageDoorDriver.js';

export class DriverManager {
  constructor() {
    this.drivers = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.register(new LightDriver());
    this.register(new CameraDriver());
    this.register(new LockDriver());
    this.register(new ClimateDriver());
    this.register(new MotionSensorDriver());
    this.register(new SmokeSensorDriver());
    this.register(new GasSensorDriver());
    this.register(new DoorbellDriver());
    this.register(new GarbageCollectorDriver());
    this.register(new IrrigationDriver());
    this.register(new GarageDoorDriver());
  }

  register(driver) {
    if (!driver || !driver.type) {
      throw new Error('[DriverManager] Driver inválido: requiere propiedad type');
    }
    this.drivers.set(driver.type, driver);
    return driver;
  }

  getDriver(type) {
    return this.drivers.get(type) || null;
  }

  getAllDrivers() {
    return [...this.drivers.values()];
  }

  getDriversTelemetry(devicesList = [], processesList = []) {
    return this.getAllDrivers().map((driver) => {
      const associatedDevices = devicesList.filter((d) => d.type === driver.type);
      const procCheck = driver.checkProcessState(processesList);
      return {
        id: driver.id,
        name: driver.name,
        type: driver.type,
        associatedProcess: driver.associatedProcessName,
        processState: procCheck.processState || 'ACTIVE',
        operational: procCheck.ok,
        inhibitionReason: procCheck.ok ? null : procCheck.reason,
        connectedDevicesCount: associatedDevices.length,
        devices: associatedDevices.map((d) => ({ id: d.id, name: d.name, status: d.status, zone: d.zone })),
      };
    });
  }
}

export const driverManager = new DriverManager();
