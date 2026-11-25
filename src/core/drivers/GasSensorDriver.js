// src/core/drivers/GasSensorDriver.js
// Driver de detectores electroquímicos de monóxido y gas licuado (GLP/CH4)
// Proceso asociado: temp_manager
// Eventos: GAS_DETECTED, GAS_CLEARED

import { BaseDriver } from './BaseDriver.js';

export class GasSensorDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_gas',
      name: 'GasSensorDriver',
      type: 'gas',
      associatedProcessName: 'temp_manager',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'NORMAL';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'TRIGGER_GAS' || normalizedAction === 'ALERT' || normalizedAction === 'FUGA DETECTADA') {
      nextStatus = 'FUGA DETECTADA';
    } else if (normalizedAction === 'CLEAR_GAS' || normalizedAction === 'CLEAR' || normalizedAction === 'NORMAL') {
      nextStatus = 'NORMAL';
    } else {
      nextStatus = currentStatus === 'NORMAL' ? 'FUGA DETECTADA' : 'NORMAL';
    }

    const isAlarm = nextStatus === 'FUGA DETECTADA';
    const eventType = isAlarm ? 'GAS_DETECTED' : 'GAS_CLEARED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: isAlarm ? 'CRITICAL' : 'INFO',
      payload: {
        gasType: payload.gasType || 'LPG_METHANE',
        ppm: isAlarm ? (payload.ppm || 680) : 5,
        cutoffValveEngaged: isAlarm,
        zone: device.zone,
      },
    };
  }
}
