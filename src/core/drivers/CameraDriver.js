// src/core/drivers/CameraDriver.js
// Driver de cámaras de videovigilancia y stream RTSP
// Proceso asociado: surveillance_proc
// Eventos: CAMERA_ONLINE, CAMERA_OFFLINE

import { BaseDriver } from './BaseDriver.js';

export class CameraDriver extends BaseDriver {
  constructor() {
    super({
      id: 'drv_camera',
      name: 'CameraDriver',
      type: 'camera',
      associatedProcessName: 'surveillance_proc',
    });
  }

  validatePermissions(action, context = {}, device = null) {
    // Visitantes GUEST no pueden alterar el estado de cámaras perimetrales
    if (context?.role === 'GUEST') {
      return {
        ok: false,
        reason: 'El control de cámaras de vigilancia está restringido para visitantes anónimos.',
      };
    }
    return { ok: true };
  }

  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    const currentStatus = device.status || 'OFFLINE';
    let nextStatus;

    const normalizedAction = String(action || 'TOGGLE').toUpperCase();

    if (normalizedAction === 'CONNECT' || normalizedAction === 'ONLINE') {
      nextStatus = 'ONLINE';
    } else if (normalizedAction === 'DISCONNECT' || normalizedAction === 'OFFLINE') {
      nextStatus = 'OFFLINE';
    } else {
      nextStatus = currentStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    }

    const eventType = nextStatus === 'ONLINE' ? 'CAMERA_ONLINE' : 'CAMERA_OFFLINE';

    return {
      success: true,
      nextStatus,
      eventType,
      severity: nextStatus === 'ONLINE' ? 'INFO' : 'WARN',
      payload: {
        resolution: '1080p',
        fps: nextStatus === 'ONLINE' ? 30 : 0,
        streamUrl: nextStatus === 'ONLINE' ? `rtsp://robotos.local/live/${device.id}` : null,
        zone: device.zone,
      },
    };
  }
}
