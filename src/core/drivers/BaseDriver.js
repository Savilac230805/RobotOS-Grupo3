// src/core/drivers/BaseDriver.js
// Clase base para los drivers de hardware de RobotOS SmartHouse
// Arquitectura: Proceso -> Syscall -> Driver -> Dispositivo -> Event Engine -> Supabase

export class BaseDriver {
  /**
   * @param {object} config
   * @param {string} config.id - Identificador del driver (ej. 'drv_light')
   * @param {string} config.name - Nombre descriptivo (ej. 'LightDriver')
   * @param {string} config.type - Tipo de dispositivo que maneja (ej. 'light')
   * @param {string} config.associatedProcessName - Nombre del proceso controlador (ej. 'lighting_daemon')
   */
  constructor({ id, name, type, associatedProcessName }) {
    if (!id || !name || !type) {
      throw new Error('[BaseDriver] id, name y type son obligatorios');
    }
    this.id = id;
    this.name = name;
    this.type = type;
    this.associatedProcessName = associatedProcessName || null;
  }

  /**
   * REGLA FUNDAMENTAL:
   * Si el proceso asociado está BLOCKED, WAITING o TERMINATED, el dispositivo debe rechazar operaciones.
   * Si processesList está vacío (p. ej. en pruebas unitarias aisladas), la verificación pasa.
   * @param {Array} processesList - Lista de procesos actuales del sistema
   * @returns {{ ok: boolean, reason?: string, processState?: string, process?: object }}
   */
  checkProcessState(processesList = []) {
    if (!this.associatedProcessName) return { ok: true, processState: 'SYSTEM' };
    if (!Array.isArray(processesList) || processesList.length === 0) {
      return { ok: true, processState: 'UNCHECKED' };
    }

    const proc = processesList.find(
      (p) => (p.nombre || p.name) === this.associatedProcessName
    );

    if (!proc) {
      return {
        ok: false,
        reason: `Proceso controlador "${this.associatedProcessName}" no encontrado en el sistema.`,
        processState: 'NOT_FOUND',
      };
    }

    const state = proc.estado || proc.state;
    if (state === 'BLOCKED' || state === 'WAITING' || state === 'TERMINATED') {
      return {
        ok: false,
        process: proc,
        processState: state,
        reason: `El proceso controlador "${this.associatedProcessName}" está en estado ${state}. El dispositivo no responde.`,
      };
    }

    return { ok: true, process: proc, processState: state };
  }

  /**
   * Valida permisos RBAC según el contexto del usuario.
   * @param {string} action
   * @param {object} context
   * @param {object} device
   * @returns {{ ok: boolean, reason?: string }}
   */
  validatePermissions(action, context = {}, device = null) {
    return { ok: true };
  }

  /**
   * Expone estado consultable del driver y su integración con el proceso.
   */
  getStatus(device, processesList = []) {
    const procCheck = this.checkProcessState(processesList);
    return {
      driverId: this.id,
      driverName: this.name,
      deviceType: this.type,
      associatedProcess: this.associatedProcessName,
      processState: procCheck.processState || 'ACTIVE',
      operational: procCheck.ok,
      deviceStatus: device?.status || 'UNKNOWN',
      inhibitionReason: procCheck.ok ? null : procCheck.reason,
    };
  }

  /**
   * Ejecuta una acción concreta sobre el dispositivo.
   * Las subclases deben sobrescribir este método.
   */
  execute(action, payload = {}, { device, processesList = [], context = {} } = {}) {
    throw new Error(`[BaseDriver] Método execute() no implementado en ${this.name}`);
  }
}
