// src/core/persistence/IPersistenceAdapter.js
// Contrato de persistencia de RobotOS SmartHouse
// Define la interfaz unificada para desacoplar el Kernel del medio de almacenamiento.

export const SYNC_STATUS = Object.freeze({
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  ERROR: 'ERROR',
  OFFLINE: 'OFFLINE',
});

/**
 * Interfaz base IPersistenceAdapter
 * Garantiza que tanto InMemoryPersistenceAdapter como SupabasePersistenceAdapter
 * implementen exactamente las mismas operaciones.
 */
export class IPersistenceAdapter {
  constructor() {
    if (new.target === IPersistenceAdapter) {
      throw new TypeError('No se puede instanciar la clase abstracta IPersistenceAdapter directamente');
    }
  }

  // Operaciones de Eventos y Telemetría
  async saveEvent(event) {
    throw new Error('Método saveEvent() no implementado');
  }

  async saveProcess(process) {
    throw new Error('Método saveProcess() no implementado');
  }

  async saveMetric(metric) {
    throw new Error('Método saveMetric() no implementado');
  }

  async loadHistory(filter = null) {
    throw new Error('Método loadHistory() no implementado');
  }

  // Registro de Arranque
  async saveBootRecord(bootRecord) {
    throw new Error('Método saveBootRecord() no implementado');
  }

  // Dispositivos y Logs
  async getDevices() {
    throw new Error('Método getDevices() no implementado');
  }

  async saveDeviceState(deviceId, status, metadata = {}) {
    throw new Error('Método saveDeviceState() no implementado');
  }

  async getLogs(limit = 100) {
    throw new Error('Método getLogs() no implementado');
  }

  async saveLog(logEntry) {
    throw new Error('Método saveLog() no implementado');
  }

  // Snapshot completo para carga inmediata del Gemelo Digital
  async getSystemSnapshot() {
    throw new Error('Método getSystemSnapshot() no implementado');
  }

  // Cola de Reintentos y Sincronización
  enqueueRetry(operation) {
    throw new Error('Método enqueueRetry() no implementado');
  }

  async processRetryQueue() {
    throw new Error('Método processRetryQueue() no implementado');
  }

  getSyncStatus() {
    throw new Error('Método getSyncStatus() no implementado');
  }

  // Modo Sandbox para visitantes anónimos
  setSandboxMode(isSandbox) {
    throw new Error('Método setSandboxMode() no implementado');
  }

  isSandboxMode() {
    throw new Error('Método isSandboxMode() no implementado');
  }
}
