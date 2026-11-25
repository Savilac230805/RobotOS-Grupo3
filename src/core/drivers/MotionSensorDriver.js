// src/core/drivers/MotionSensorDriver.js
// Driver de sensores de presencia PIR y radar doppler
// Proceso asociado: surveillance_proc
// Eventos: MOTION_DETECTED, MOTION_CLEARED

import { BaseDriver } from './BaseDriver.js';

export class MotionSensorDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_motion',
      name: 'MotionSensorDriver',
      type: 'motion',
      associatedProcessName: 'surveillance_proc',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'EN REPOSO';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'SIMULATE_MOTION' || normalizedAction === 'TRIGGER' || normalizedAction === 'DETECTADO') {
      nextStatus = 'DETECTADO';
    } else if (normalizedAction === 'CLEAR_MOTION' || normalizedAction === 'CLEAR' || normalizedAction === 'EN REPOSO') {
      nextStatus = 'EN REPOSO';
    } else {
      nextStatus = currentStatus === 'EN REPOSO' ? 'DETECTADO' : 'EN REPOSO';
    }

    const eventType = nextStatus === 'DETECTADO' ? 'MOTION_DETECTED' : 'MOTION_CLEARED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: nextStatus === 'DETECTADO' ? 'WARN' : 'INFO',
      payload: {
        confidence: nextStatus === 'DETECTADO' ? 0.96 : 0.0,
        sensorType: 'PIR_INFRARED',
        zone: device.zone,
      },
    };
  }
}
