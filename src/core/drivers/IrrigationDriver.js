// src/core/drivers/IrrigationDriver.js
// Driver de electroválvulas y aspersores de riego inteligente
// Proceso asociado: irrigation_daemon
// Eventos: IRRIGATION_STARTED, IRRIGATION_STOPPED

import { BaseDriver } from './BaseDriver.js';

export class IrrigationDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_irrigation',
      name: 'IrrigationDriver',
      type: 'irrigation',
      associatedProcessName: 'irrigation_daemon',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'INACTIVO';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'START_IRRIGATION' || normalizedAction === 'START' || normalizedAction === 'REGANDO') {
      nextStatus = 'REGANDO';
    } else if (normalizedAction === 'STOP_IRRIGATION' || normalizedAction === 'STOP' || normalizedAction === 'INACTIVO') {
      nextStatus = 'INACTIVO';
    } else {
      nextStatus = currentStatus === 'INACTIVO' ? 'REGANDO' : 'INACTIVO';
    }

    const isWatering = nextStatus === 'REGANDO';
    const eventType = isWatering ? 'IRRIGATION_STARTED' : 'IRRIGATION_STOPPED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: 'INFO',
      payload: {
        waterFlowLpm: isWatering ? 18.5 : 0.0,
        soilMoisturePercent: isWatering ? 65 : 32,
        zone: device.zone,
        durationMinutes: payload.durationMinutes || 15,
      },
    };
  }
}
