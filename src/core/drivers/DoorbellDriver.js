// src/core/drivers/DoorbellDriver.js
// Driver de timbre inteligente y captura de llamada en puerta
// Proceso asociado: surveillance_proc
// Eventos: DOORBELL_PRESSED

import { BaseDriver } from './BaseDriver.js';

export class DoorbellDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_doorbell',
      name: 'DoorbellDriver',
      type: 'doorbell',
      associatedProcessName: 'surveillance_proc',
    });
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const nextStatus = 'TIMBRANDO';

    return {
      success: true,
      nextStatus,
      eventType: 'DOORBELL_PRESSED',
      severity: 'INFO',
      payload: {
        chimeTone: payload.chimeTone || 'DING_DONG_HARMONIC',
        snapshotUrl: 'https://robotos.local/snapshots/doorbell_latest.jpg',
        callerVolumeDb: 72,
        zone: device.zone,
      },
    };
  }
}
