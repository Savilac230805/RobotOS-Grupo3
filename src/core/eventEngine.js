// src/core/eventEngine.js
// Bus de eventos desacoplado con esquema JSON estricto
// Esquema fijo: { id, timestamp, source, type, severity, pid, payload }

import { kernelClock } from './clock.js';

export const EVENT_SEVERITY = Object.freeze({
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
});

export const EVENT_SOURCES = Object.freeze({
  KERNEL: 'KERNEL',
  SCHEDULER: 'SCHEDULER',
  PROCESS_MGR: 'PROCESS_MGR',
  MEM_MANAGER: 'MEM_MANAGER',
  VFS: 'VFS',
  HARDWARE_BUS: 'HARDWARE_BUS',
  IOT_MANAGER: 'IOT_MANAGER',
  SECURITY_GUARD: 'SECURITY_GUARD',
  ALERT_DAEMON: 'ALERT_DAEMON',
  BOOT_MANAGER: 'BOOT_MANAGER',
});

export function createEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export class EventEngine {
  constructor(clock = kernelClock) {
    this.clock = clock;
    this.listeners = new Map(); // type -> Set<callback>
    this.globalListeners = new Set();
    this.history = [];
    this.maxHistory = 500;
  }

  /**
   * Crea y emite un evento con el esquema JSON fijo exigido por la arquitectura.
   * id: identificador único con timestamp y secuencia aleatoria.
   * timestamp: generado estrictamente por el kernelClock.
   */
  emit({
    type,
    source = EVENT_SOURCES.KERNEL,
    severity = EVENT_SEVERITY.INFO,
    pid = null,
    payload = {},
    correlationId = null,
  }) {
    if (!type || typeof type !== 'string') {
      throw new Error('El tipo de evento (type) es obligatorio y debe ser un string');
    }

    const event = Object.freeze({
      id: createEventId(),
      timestamp: this.clock.getISOTimestamp(),
      source,
      type,
      severity,
      pid: pid !== null ? Number(pid) : null,
      payload: payload && typeof payload === 'object' ? payload : { raw: payload },
      ...(correlationId ? { correlationId } : {}),
    });

    // Guardar en bitácora circular
    this.history.unshift(event);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    // Notificar suscriptores del tipo específico
    if (this.listeners.has(type)) {
      for (const cb of this.listeners.get(type)) {
        try {
          cb(event);
        } catch (err) {
          console.error(`[EventEngine] Error en listener para tipo ${type}:`, err);
        }
      }
    }

    // Notificar suscriptores globales
    for (const cb of this.globalListeners) {
      try {
        cb(event);
      } catch (err) {
        console.error('[EventEngine] Error en listener global:', err);
      }
    }

    return event;
  }

  subscribe(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.unsubscribe(type, callback);
  }

  subscribeAll(callback) {
    this.globalListeners.add(callback);
    return () => this.globalListeners.delete(callback);
  }

  unsubscribe(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback);
    }
  }

  getHistory(limit = 100, filter = null) {
    let result = this.history;
    if (filter) {
      result = result.filter(filter);
    }
    return result.slice(0, limit);
  }

  clearHistory() {
    this.history = [];
  }
}

// Instancia singleton del motor de eventos
export const eventEngine = new EventEngine();
