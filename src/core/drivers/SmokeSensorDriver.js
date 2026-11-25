// src/core/drivers/SmokeSensorDriver.js
// Driver de detectores fotoeléctricos de humo e incendios
// Proceso asociado: temp_manager
// Eventos: SMOKE_DETECTED, SMOKE_CLEARED

import { BaseDriver } from './BaseDriver.js';

export class SmokeSensorDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_smoke',
      name: 'SmokeSensorDriver',
      type: 'smoke',
      associatedProcessName: 'temp_manager',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'NORMAL';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'TRIGGER_SMOKE' || normalizedAction === 'ALERT' || normalizedAction === 'HUMO DETECTADO') {
      nextStatus = 'HUMO DETECTADO';
    } else if (normalizedAction === 'CLEAR_SMOKE' || normalizedAction === 'CLEAR' || normalizedAction === 'NORMAL') {
      nextStatus = 'NORMAL';
    } else {
      nextStatus = currentStatus === 'NORMAL' ? 'HUMO DETECTADO' : 'NORMAL';
    }

    const isAlarm = nextStatus === 'HUMO DETECTADO';
    const eventType = isAlarm ? 'SMOKE_DETECTED' : 'SMOKE_CLEARED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: isAlarm ? 'CRITICAL' : 'INFO',
      payload: {
        ppm: isAlarm ? (payload.ppm || 420) : 15,
        alarmSirenActive: isAlarm,
        zone: device.zone,
      },
    };
  }
}
