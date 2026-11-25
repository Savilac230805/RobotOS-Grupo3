// src/core/drivers/GarbageCollectorDriver.js
// Driver del robot autónomo recolector de residuos y aspiración
// Proceso asociado: garbage_collector_daemon
// Eventos: GARBAGE_COLLECTION_STARTED, GARBAGE_COLLECTION_STOPPED

import { BaseDriver } from './BaseDriver.js';

export class GarbageCollectorDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_garbage_collector',
      name: 'GarbageCollectorDriver',
      type: 'garbage_collector',
      associatedProcessName: 'garbage_collector_daemon',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'ESTACIONADO';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'START_CLEANING' || normalizedAction === 'START' || normalizedAction === 'LIMPIANDO') {
      nextStatus = 'LIMPIANDO';
    } else if (normalizedAction === 'STOP_CLEANING' || normalizedAction === 'DOCK' || normalizedAction === 'ESTACIONADO') {
      nextStatus = 'ESTACIONADO';
    } else {
      nextStatus = currentStatus === 'ESTACIONADO' ? 'LIMPIANDO' : 'ESTACIONADO';
    }

    const isCleaning = nextStatus === 'LIMPIANDO';
    const eventType = isCleaning ? 'GARBAGE_COLLECTION_STARTED' : 'GARBAGE_COLLECTION_STOPPED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: 'INFO',
      payload: {
        batteryPercent: 88,
        binCapacityPercent: isCleaning ? 42 : 10,
        cleaningZone: payload.zone || device.zone || 'Salón',
        lidarNavigationActive: isCleaning,
      },
    };
  }
}
