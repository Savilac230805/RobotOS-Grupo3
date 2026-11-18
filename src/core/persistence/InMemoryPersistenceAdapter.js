// src/core/persistence/InMemoryPersistenceAdapter.js
// Implementación en memoria del adaptador de persistencia para modo standalone y offline.
// Cumple estrictamente con IPersistenceAdapter, soporta modo sandbox y cola de reintentos.

import { IPersistenceAdapter, SYNC_STATUS } from './IPersistenceAdapter.js';

export class InMemoryPersistenceAdapter extends IPersistenceAdapter {
  constructor() {
    super();
    this.syncStatus = SYNC_STATUS.IDLE;
    this.isSandbox = true; // Por defecto modo visitante anónimo (sandbox local)

    // Almacenamiento compartido
    this.sharedStorage = {
      events: [],
      processes: [],
      metrics: [],
      bootRecords: [],
      devices: [],
      logs: [],
    };

    // Almacenamiento sandbox aislado para visitantes anónimos
    this.sandboxStorage = {
      events: [],
      processes: [],
      metrics: [],
      bootRecords: [],
      devices: [],
      logs: [],
    };

    // Cola de reintentos
    this.retryQueue = [];
    this.maxRetries = 3;
  }

  setSandboxMode(isSandbox) {
    this.isSandbox = Boolean(isSandbox);
  }

  isSandboxMode() {
    return this.isSandbox;
  }

  getStorage() {
    return this.isSandbox ? this.sandboxStorage : this.sharedStorage;
  }

  getSyncStatus() {
    return this.syncStatus;
  }

  // Operaciones de Eventos
  async saveEvent(event) {
    const storage = this.getStorage();
    storage.events.unshift(event);
    if (storage.events.length > 500) storage.events.pop();
    return { success: true, event };
  }

  // Operaciones de Procesos
  async saveProcess(process) {
    const storage = this.getStorage();
    const data = typeof process.toJSON === 'function' ? process.toJSON() : process;
    const idx = storage.processes.findIndex((p) => p.pid === data.pid);
    if (idx >= 0) {
      storage.processes[idx] = data;
    } else {
      storage.processes.push(data);
    }
    return { success: true, process: data };
  }

  // Operaciones de Métricas
  async saveMetric(metric) {
    const storage = this.getStorage();
    storage.metrics.push({
      ...metric,
      timestamp: metric.timestamp || new Date().toISOString(),
    });
    if (storage.metrics.length > 1000) storage.metrics.shift();
    return { success: true };
  }

  // Carga de Historial
  async loadHistory(filter = null) {
    const storage = this.getStorage();
    let events = storage.events;
    if (filter && typeof filter === 'function') {
      events = events.filter(filter);
    }
    return events;
  }

  // Registro de Arranque
  async saveBootRecord(bootRecord) {
    const storage = this.getStorage();
    storage.bootRecords.push({
      recordedAt: new Date().toISOString(),
      record: bootRecord,
    });
    return { success: true };
  }

  // Dispositivos
  async getDevices() {
    return this.getStorage().devices;
  }

  async saveDeviceState(deviceId, status, metadata = {}) {
    const storage = this.getStorage();
    const idx = storage.devices.findIndex((d) => d.id === deviceId);
    if (idx >= 0) {
      storage.devices[idx] = { ...storage.devices[idx], status, ...metadata };
    } else {
      storage.devices.push({ id: deviceId, status, ...metadata });
    }
    return { success: true, deviceId, status };
  }

  // Logs
  async getLogs(limit = 100) {
    return this.getStorage().logs.slice(0, limit);
  }

  async saveLog(logEntry) {
    const storage = this.getStorage();
    storage.logs.unshift(logEntry);
    if (storage.logs.length > 200) storage.logs.pop();
    return { success: true };
  }

  // Snapshot completo del sistema para inicialización instantánea del Gemelo Digital
  async getSystemSnapshot() {
    const storage = this.getStorage();
    return {
      timestamp: new Date().toISOString(),
      isSandbox: this.isSandbox,
      syncStatus: this.syncStatus,
      devices: [...storage.devices],
      processes: [...storage.processes],
      recentEvents: storage.events.slice(0, 50),
      recentLogs: storage.logs.slice(0, 50),
      metrics: storage.metrics.slice(-20),
    };
  }

  // Cola de Reintentos
  enqueueRetry(operation) {
    this.retryQueue.push({
      id: `retry_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      operation,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
  }

  async processRetryQueue() {
    if (this.retryQueue.length === 0) return { processed: 0, failed: 0 };
    this.syncStatus = SYNC_STATUS.SYNCING;
    let processed = 0;
    let failed = 0;
    const remaining = [];

    for (const item of this.retryQueue) {
      item.attempts += 1;
      try {
        await item.operation();
        processed++;
      } catch (err) {
        if (item.attempts < this.maxRetries) {
          remaining.push(item);
        } else {
          failed++;
        }
      }
    }

    this.retryQueue = remaining;
    this.syncStatus = remaining.length > 0 ? SYNC_STATUS.ERROR : SYNC_STATUS.IDLE;
    return { processed, failed, remaining: remaining.length };
  }
}

export const inMemoryAdapter = new InMemoryPersistenceAdapter();
