// src/core/drivers/GarageDoorDriver.js
// Driver de portón corredizo y sensor de fin de carrera de garaje
// Proceso asociado: lock_guard
// Eventos: GARAGE_OPENED, GARAGE_CLOSED

import { BaseDriver } from './BaseDriver.js';

export class GarageDoorDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_garage_door',
      name: 'GarageDoorDriver',
      type: 'garage_door',
      associatedProcessName: 'lock_guard',
    });
  }

  validatePermissions(action, context = {}, device = null) {
    if (context?.role === 'GUEST') {
      return {
        ok: false,
        reason: 'El control de la puerta de garaje está restringido para visitantes anónimos.',
      };
    }
    return { ok: true };
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'CERRADA';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'OPEN' || normalizedAction === 'ABIERTA' || normalizedAction === 'ABRIR') {
      nextStatus = 'ABIERTA';
    } else if (normalizedAction === 'CLOSE' || normalizedAction === 'CERRADA' || normalizedAction === 'CERRAR') {
      nextStatus = 'CERRADA';
    } else {
      nextStatus = currentStatus === 'CERRADA' ? 'ABIERTA' : 'CERRADA';
    }

    const isOpen = nextStatus === 'ABIERTA';
    const eventType = isOpen ? 'GARAGE_OPENED' : 'GARAGE_CLOSED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: isOpen ? 'WARN' : 'INFO',
      payload: {
        safetyBeamClear: true,
        motorTorqueNm: 45,
        zone: device.zone,
      },
    };
  }
}
