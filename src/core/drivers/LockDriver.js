// src/core/drivers/LockDriver.js
// Driver de cerrojos electromecánicos y seguros biométricos
// Proceso asociado: lock_guard
// Eventos: LOCK_ENGAGED, LOCK_DISENGAGED

import { BaseDriver } from './BaseDriver.js';

export class LockDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_lock',
      name: 'LockDriver',
      type: 'lock',
      associatedProcessName: 'lock_guard',
    });
  }

  validatePermissions(action, context = {}, device = null) {
    if (context?.role === 'GUEST') {
      return {
        ok: false,
        reason: 'El control de cerraduras de seguridad está restringido para visitantes anónimos.',
      };
    }
    return { ok: true };
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'BLOQUEADA';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'LOCK' || normalizedAction === 'BLOQUEADA' || normalizedAction === 'BLOQUEAR') {
      nextStatus = 'BLOQUEADA';
    } else if (normalizedAction === 'UNLOCK' || normalizedAction === 'DESBLOQUEADA' || normalizedAction === 'DESBLOQUEAR') {
      nextStatus = 'DESBLOQUEADA';
    } else {
      nextStatus = currentStatus === 'BLOQUEADA' ? 'DESBLOQUEADA' : 'BLOQUEADA';
    }

    const eventType = nextStatus === 'BLOQUEADA' ? 'LOCK_ENGAGED' : 'LOCK_DISENGAGED';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: nextStatus === 'DESBLOQUEADA' ? 'WARN' : 'INFO',
      payload: {
        method: payload.method || 'PIN_REMOTE',
        batteryLevel: 94,
        zone: device.zone,
      },
    };
  }
}
