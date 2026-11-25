/**
 * RobotOS - Concurrency & IPC Subsystem (Fase 07)
 * Proporciona primitivas reales de sincronización:
 * - Mutex con cola de espera
 * - Semáforos contadores
 * - Colas de mensajes IPC
 * - Detector determinista de Deadlocks mediante grafo de asignación de recursos (RAG)
 */

import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from './eventEngine.js';

/**
 * Primitiva de exclusión mutua
 */
export class Mutex {
  constructor(name = 'default_mutex') {
    this.name = name;
    this.locked = false;
    this.ownerPid = null;
    this.waitingQueue = []; // PIDs en espera
  }

  /**
   * Intenta adquirir el Mutex. Si está bloqueado, el proceso se encola.
   * @param {number|string} pid 
   * @returns {boolean} true si lo adquirió de inmediato, false si quedó en espera
   */
  acquire(pid) {
    if (!this.locked) {
      this.locked = true;
      this.ownerPid = pid;
      eventEngine.emit({
        type: 'MUTEX_ACQUIRED',
        source: 'CONCURRENCY',
        severity: EVENT_SEVERITY.INFO,
        pid,
        payload: { mutex: this.name, ownerPid: pid },
      });
      return true;
    }

    if (this.ownerPid === pid) {
      // Reentrante para el mismo proceso
      return true;
    }

    if (!this.waitingQueue.includes(pid)) {
      this.waitingQueue.push(pid);
    }

    eventEngine.emit({
      type: 'MUTEX_BLOCKED',
      source: 'CONCURRENCY',
      severity: EVENT_SEVERITY.WARN,
      pid,
      payload: { mutex: this.name, ownerPid: this.ownerPid, waitingQueue: [...this.waitingQueue] },
    });
    return false;
  }

  /**
   * Libera el Mutex y transfiere la propiedad al siguiente en la cola.
   * @param {number|string} pid 
   * @returns {number|string|null} el nuevo dueño si había cola, o null
   */
  release(pid) {
    if (!this.locked) return null;
    if (this.ownerPid !== pid) {
      throw new Error(`[Mutex ${this.name}] Intento no autorizado de liberación por PID ${pid}. Dueño actual: PID ${this.ownerPid}`);
    }

    eventEngine.emit({
      type: 'MUTEX_RELEASED',
      source: 'CONCURRENCY',
      severity: EVENT_SEVERITY.INFO,
      pid,
      payload: { mutex: this.name, previousOwner: pid },
    });

    if (this.waitingQueue.length > 0) {
      const nextPid = this.waitingQueue.shift();
      this.ownerPid = nextPid;
      this.locked = true;
      eventEngine.emit({
        type: 'MUTEX_ACQUIRED',
        source: 'CONCURRENCY',
        severity: EVENT_SEVERITY.INFO,
        pid: nextPid,
        payload: { mutex: this.name, ownerPid: nextPid, fromQueue: true },
      });
      return nextPid;
    }

    this.locked = false;
    this.ownerPid = null;
    return null;
  }

  getState() {
    return {
      name: this.name,
      locked: this.locked,
      ownerPid: this.ownerPid,
      waitingQueue: [...this.waitingQueue],
    };
  }
}

/**
 * Semáforo contador para control de recursos finitos
 */
export class Semaphore {
  constructor(name = 'default_sem', initialCount = 1) {
    this.name = name;
    this.count = Math.max(0, initialCount);
    this.initialCount = this.count;
    this.waitingQueue = [];
  }

  wait(pid) {
    if (this.count > 0) {
      this.count--;
      eventEngine.emit({
        type: 'SEMAPHORE_WAIT',
        source: 'CONCURRENCY',
        severity: EVENT_SEVERITY.INFO,
        pid,
        payload: { semaphore: this.name, remainingCount: this.count, granted: true },
      });
      return true;
    }

    if (!this.waitingQueue.includes(pid)) {
      this.waitingQueue.push(pid);
    }
    eventEngine.emit({
      type: 'SEMAPHORE_BLOCKED',
      source: 'CONCURRENCY',
      severity: EVENT_SEVERITY.WARN,
      pid,
      payload: { semaphore: this.name, waitingQueue: [...this.waitingQueue] },
    });
    return false;
  }

  signal(pid) {
    if (this.waitingQueue.length > 0) {
      const nextPid = this.waitingQueue.shift();
      eventEngine.emit({
        type: 'SEMAPHORE_SIGNAL',
        source: 'CONCURRENCY',
        severity: EVENT_SEVERITY.INFO,
        pid,
        payload: { semaphore: this.name, unblockedPid: nextPid },
      });
      return nextPid;
    }

    this.count++;
    eventEngine.emit({
      type: 'SEMAPHORE_SIGNAL',
      source: 'CONCURRENCY',
      severity: EVENT_SEVERITY.INFO,
      pid,
      payload: { semaphore: this.name, count: this.count },
    });
    return null;
  }

  getState() {
    return {
      name: this.name,
      count: this.count,
      initialCount: this.initialCount,
      waitingQueue: [...this.waitingQueue],
    };
  }
}

/**
 * Cola de Mensajes IPC
 */
export class MessageQueue {
  constructor(channelName = 'system_bus', maxCapacity = 50) {
    this.channelName = channelName;
    this.maxCapacity = maxCapacity;
    this.messages = [];
  }

  send(senderPid, receiverPid, payload) {
    if (this.messages.length >= this.maxCapacity) {
      throw new Error(`[IPC] Canal ${this.channelName} saturado (capacidad máxima: ${this.maxCapacity})`);
    }

    const message = {
      id: globalThis.crypto?.randomUUID?.() || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderPid,
      receiverPid, // null = broadcast
      payload,
      timestamp: Date.now(),
    };

    this.messages.push(message);

    eventEngine.emit({
      type: 'IPC_MESSAGE_SENT',
      source: 'IPC',
      severity: EVENT_SEVERITY.INFO,
      pid: senderPid,
      payload: { channel: this.channelName, messageId: message.id, receiverPid },
    });

    return message;
  }

  receive(receiverPid) {
    const idx = this.messages.findIndex(
      (m) => m.receiverPid === receiverPid || m.receiverPid === null
    );
    if (idx === -1) return null;

    const [msg] = this.messages.splice(idx, 1);

    eventEngine.emit({
      type: 'IPC_MESSAGE_RECEIVED',
      source: 'IPC',
      severity: EVENT_SEVERITY.INFO,
      pid: receiverPid,
      payload: { channel: this.channelName, messageId: msg.id, senderPid: msg.senderPid },
    });

    return msg;
  }

  getPendingCount(receiverPid) {
    return this.messages.filter(
      (m) => m.receiverPid === receiverPid || m.receiverPid === null
    ).length;
  }

  getSnapshot() {
    return [...this.messages];
  }
}

/**
 * Detector y Gestor de Deadlocks mediante Grafo de Asignación de Recursos (RAG)
 */
export class DeadlockDetector {
  constructor() {
    // Recursos: id -> { name, heldBy: pid, waitingPids: [pid1, pid2] }
    this.resources = new Map();
  }

  registerResource(resourceId, name) {
    if (!this.resources.has(resourceId)) {
      this.resources.set(resourceId, {
        id: resourceId,
        name: name || resourceId,
        heldBy: null,
        waitingPids: [],
      });
    }
  }

  requestResource(pid, resourceId) {
    this.registerResource(resourceId);
    const res = this.resources.get(resourceId);

    if (res.heldBy === null) {
      res.heldBy = pid;
      return { acquired: true, blocked: false };
    }

    if (res.heldBy === pid) {
      return { acquired: true, blocked: false };
    }

    if (!res.waitingPids.includes(pid)) {
      res.waitingPids.push(pid);
    }
    return { acquired: false, blocked: true, heldBy: res.heldBy };
  }

  releaseResource(pid, resourceId) {
    const res = this.resources.get(resourceId);
    if (!res) return null;

    if (res.heldBy === pid) {
      res.heldBy = null;
      if (res.waitingPids.length > 0) {
        res.heldBy = res.waitingPids.shift();
        return res.heldBy;
      }
    } else {
      res.waitingPids = res.waitingPids.filter((p) => p !== pid);
    }
    return null;
  }

  clear() {
    this.resources.clear();
  }

  /**
   * Construye el Grafo de Asignación de Recursos (RAG) y busca ciclos.
   * Aristas:
   * Proceso -> Recurso (solicitud pendiente: waiting)
   * Recurso -> Proceso (asignación activa: heldBy)
   * En grafo condensado de procesos: P_waiter -> P_holder
   */
  detectDeadlock() {
    // Construir lista de aristas de espera entre procesos: P_a espera a P_b
    const waitGraph = new Map(); // pid -> Set of pids it waits for

    for (const res of this.resources.values()) {
      if (res.heldBy !== null && res.waitingPids.length > 0) {
        for (const waiter of res.waitingPids) {
          if (!waitGraph.has(waiter)) {
            waitGraph.set(waiter, new Set());
          }
          waitGraph.get(waiter).add(res.heldBy);
        }
      }
    }

    // Algoritmo de detección de ciclos por DFS
    const visited = new Set();
    const recStack = new Set();
    const cycle = [];

    const dfs = (node, path) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = waitGraph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const found = dfs(neighbor, path);
          if (found) return true;
        } else if (recStack.has(neighbor)) {
          // Ciclo encontrado
          const cycleStartIdx = path.indexOf(neighbor);
          cycle.push(...path.slice(cycleStartIdx), neighbor);
          return true;
        }
      }

      recStack.delete(node);
      path.pop();
      return false;
    };

    let hasDeadlock = false;
    for (const node of waitGraph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node, [])) {
          hasDeadlock = true;
          break;
        }
      }
    }

    // Encontrar recursos involucrados en el ciclo
    const involvedResources = [];
    if (hasDeadlock && cycle.length > 0) {
      for (let i = 0; i < cycle.length - 1; i++) {
        const fromPid = cycle[i];
        const toPid = cycle[i + 1];
        // Encontrar qué recurso retenía toPid que fromPid estaba esperando
        for (const res of this.resources.values()) {
          if (res.heldBy === toPid && res.waitingPids.includes(fromPid)) {
            involvedResources.push({
              resourceId: res.id,
              name: res.name,
              heldBy: toPid,
              requestedBy: fromPid,
            });
          }
        }
      }

      eventEngine.emit({
        type: 'DEADLOCK_DETECTED',
        source: 'CONCURRENCY',
        severity: EVENT_SEVERITY.CRITICAL,
        payload: {
          cycle: [...cycle],
          involvedResources,
          recommendedAction: `Terminar proceso víctima PID ${cycle[0]} para romper la espera circular en recurso "${involvedResources[0]?.name || 'desconocido'}"`,
        },
      });
    }

    return {
      hasDeadlock,
      cycle,
      involvedResources,
      waitGraph: Array.from(waitGraph.entries()).map(([k, v]) => ({
        pid: k,
        waitingFor: Array.from(v),
      })),
      recommendedVictimPid: cycle.length > 0 ? cycle[0] : null,
      recommendation: hasDeadlock
        ? `Se detectó interbloqueo circular entre los procesos ${cycle.join(' -> ')}. Recomendación: Abortar o suspender el proceso PID ${cycle[0]} para liberar recursos.`
        : 'No se detectaron condiciones de interbloqueo en el sistema.',
    };
  }

  /**
   * Resuelve el deadlock liberando forzosamente el proceso víctima
   */
  resolveDeadlock(victimPid) {
    if (!victimPid) return false;
    let freedResources = [];

    for (const res of this.resources.values()) {
      if (res.heldBy === victimPid) {
        res.heldBy = null;
        freedResources.push(res.id);
        if (res.waitingPids.length > 0) {
          res.heldBy = res.waitingPids.shift();
        }
      }
      res.waitingPids = res.waitingPids.filter((p) => p !== victimPid);
    }

    eventEngine.emit({
      type: 'DEADLOCK_RESOLVED',
      source: 'CONCURRENCY',
      severity: EVENT_SEVERITY.INFO,
      pid: victimPid,
      payload: { victimPid, freedResources },
    });

    return true;
  }

  getSnapshot() {
    return Array.from(this.resources.values()).map((r) => ({
      ...r,
      waitingPids: [...r.waitingPids],
    }));
  }
}

// Instancias globales singleton para el kernel
export const systemMutex = new Mutex('bus_i2c_lock');
export const systemSemaphore = new Semaphore('db_connections_sem', 3);
export const systemIPC = new MessageQueue('kernel_ipc_bus', 100);
export const deadlockDetector = new DeadlockDetector();
