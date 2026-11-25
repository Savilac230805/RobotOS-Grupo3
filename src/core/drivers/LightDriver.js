// src/core/drivers/LightDriver.js
// Driver de control de actuadores de iluminación
// Proceso asociado: lighting_daemon
// Eventos: LIGHT_ON, LIGHT_OFF

import { BaseDriver } from './BaseDriver.js';

export class LightDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_light',
      name: 'LightDriver',
      type: 'light',
      associatedProcessName: 'lighting_daemon',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'OFF';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'TURN_ON' || normalizedAction === 'ON') {
      nextStatus = 'ON';
    } else if (normalizedAction === 'TURN_OFF' || normalizedAction === 'OFF') {
      nextStatus = 'OFF';
    } else {
      // TOGGLE
      nextStatus = currentStatus === 'ON' ? 'OFF' : 'ON';
    }

    const eventType = nextStatus === 'ON' ? 'LIGHT_ON' : 'LIGHT_OFF';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: 'INFO',
      payload: {
        brightness: nextStatus === 'ON' ? (payload.brightness || 100) : 0,
        colorTemp: payload.colorTemp || 'neutral',
        zone: device.zone,
      },
    };
  }
}
