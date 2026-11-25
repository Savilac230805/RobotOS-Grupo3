// src/core/drivers/ClimateDriver.js
// Driver de climatización y termostatos HVAC
// Proceso asociado: temp_manager
// Eventos: CLIMATE_TEMP_CHANGED

import { BaseDriver } from './BaseDriver.js';

export class ClimateDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_climate',
      name: 'ClimateDriver',
      type: 'climate',
      associatedProcessName: 'temp_manager',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    let currentTemp = typeof device.temperature === 'number' ? device.temperature : 22.5;
    let nextTemp;

    if (typeof payload.temperature === 'number') {
      nextTemp = Number(payload.temperature.toFixed(1));
    } else {
      // Ciclar entre 20°C y 25°C (+1.5°C)
      nextTemp = currentTemp >= 24.5 ? 20.0 : +(currentTemp + 1.5).toFixed(1);
    }

    const nextStatus = `${nextTemp} °C`;

    return {
      success: true,
      nextStatus,
      eventType: 'CLIMATE_TEMP_CHANGED',
      severity: 'INFO',
      extra: { temperature: nextTemp },
      payload: {
        previousTemperature: currentTemp,
        targetTemperature: nextTemp,
        hvacMode: nextTemp > 22 ? 'COOLING' : 'HEATING',
        zone: device.zone,
      },
    };
  }
}
