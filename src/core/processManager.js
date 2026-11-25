const SMART_HOME_PROCESS_DEVICES = Object.freeze({
  lighting_daemon: ['d1', 'd2'],
  surveillance_proc: ['d3', 'd4'],
  surveillance_process: ['d3', 'd4'],
  temp_manager: ['d6'],
  climate_daemon: ['d6'],
  lock_guard: ['d3', 'd5'],
  security_daemon: ['d3', 'd4', 'd5'],
  energy_monitor: ['d1', 'd2', 'd6'],
  energy_manager: ['d1', 'd2', 'd6'],
  garbage_collector_daemon: ['d10'],
  irrigation_daemon: ['d11'],
});

export class ProcessManager {
  constructor() {
    this.processes = new Map();
    this.deviceRelations = new Map();
  }

  register(process) {
    if (!process || !Number.isInteger(process.pid)) {
      throw new Error('No se puede registrar un proceso sin PID válido');
    }

    const current = this.processes.get(process.pid);
    if (current && current !== process) {
      throw new Error(`El PID ${process.pid} ya está registrado`);
    }

    this.processes.set(process.pid, process);
    const defaultDevices = SMART_HOME_PROCESS_DEVICES[process.nombre] || [];
    for (const deviceId of [...defaultDevices, ...(process.deviceIds || [])]) {
      this.associateDevice(process.pid, deviceId);
    }
    return process;
  }

  get(pid) {
    return this.processes.get(Number(pid)) || null;
  }

  getAll() {
    return [...this.processes.values()];
  }

  remove(pid) {
    const key = Number(pid);
    this.deviceRelations.delete(key);
    return this.processes.delete(key);
  }

  associateDevice(pid, deviceId) {
    const process = this.get(pid);
    if (!process) throw new Error(`Proceso PID ${pid} no encontrado`);
    if (typeof deviceId !== 'string' || deviceId.trim() === '') {
      throw new Error('El identificador del dispositivo es obligatorio');
    }

    const devices = this.deviceRelations.get(process.pid) || new Set();
    devices.add(deviceId);
    this.deviceRelations.set(process.pid, devices);
    process.deviceIds = [...devices];
    return { pid: process.pid, deviceId };
  }

  getDeviceRelations(pid = null) {
    const rows = [];
    for (const [processPid, deviceIds] of this.deviceRelations) {
      if (pid !== null && processPid !== Number(pid)) continue;
      for (const deviceId of deviceIds) rows.push({ pid: processPid, deviceId });
    }
    return rows;
  }
}

export const processManager = new ProcessManager();
