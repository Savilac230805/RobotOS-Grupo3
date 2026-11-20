import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Proceso,
  ESTADOS,
  ALGORITMOS,
  ejecutarTickInteractivo,
  calcularMetricas,
  simular,
  processManager,
  VirtualFileSystem,
  kernelClock,
  bootManager,
  inMemoryAdapter,
  syscalls,
  memoryManager,
  SYNC_STATUS,
} from '../core';
import { SupabasePersistenceAdapter } from '../core/persistence/SupabasePersistenceAdapter';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  INITIAL_PROCESSES,
  INITIAL_FILE_SYSTEM,
  INITIAL_DEVICES,
  INITIAL_LOGS,
  INITIAL_ALERTS,
} from '../data/mockData';

const SystemContext = createContext();

// ==========================================
// PROCESOS INICIALES (se construyen UNA sola vez)
// React StrictMode ejecuta los inicializadores de useState dos veces en desarrollo;
// como cada Proceso consume un PID y reserva memoria en el singleton memoryManager,
// la construcción debe ser idempotente.
// ==========================================
let initialProcessesCache = null;
let initialProcessEventsPersisted = false;

const buildInitialProcesses = () => {
  if (initialProcessesCache) return initialProcessesCache;

  initialProcessesCache = INITIAL_PROCESSES.map((p, idx) => {
    const priorityNum = idx === 0 ? 3 : idx === 1 ? 2 : idx === 2 ? 1 : idx === 5 ? 1 : 3;
    const memReq = p.memory || p.memoryBlocks * 16;
    const proc = new Proceso({
      nombre: p.name,
      prioridad: priorityNum,
      memoriaRequerida: memReq,
      cpuRequerida: p.cpu,
      tiempoTotal: idx === 2 ? 8 : idx === 0 ? 6 : 4,
      color: p.color,
      isSystem: p.isSystem,
      description: p.description,
    });
    if (!proc.id) proc.id = `p_${proc.pid}`;
    proc.tickLlegada = kernelClock.getTicks();
    memoryManager.allocate(p.name, p.memoryBlocks || Math.ceil(memReq / 16), p.color, proc.pid);
    memoryManager.createAddressSpace(proc.pid, {
      sizeMB: Math.max(2048, proc.memoriaRequerida * 2),
    });
    processManager.register(proc);
    return proc;
  });

  return initialProcessesCache;
};

// Compara un proceso con un identificador (id o pid)
const sameId = (p, id) => p.id === id || p.pid === id;

// Emite un evento al Event Engine sin que un fallo del bus tumbe la interfaz
const safeEmit = (evt) => {
  try {
    return syscalls.emitEvent(evt);
  } catch (e) {
    console.warn('[SystemContext] emitEvent falló:', e.message);
    return null;
  }
};

export const SystemProvider = ({ children }) => {
  const { user, role } = useAuth();
  const authContext = useMemo(() => ({ user, role }), [user, role]);

  // ==========================================
  // 0. SELECCIÓN DE ADAPTADOR DE PERSISTENCIA
  // Si Supabase está configurado y el usuario es ADMIN se usa SupabasePersistenceAdapter
  // (escritura compartida protegida por RLS).
  // En cualquier otro caso se usa InMemoryPersistenceAdapter (sandbox local).
  // El adaptador se inyecta en el singleton syscalls para que todos los eventos
  // emitidos desde cualquier punto del kernel lleguen al medio correcto.
  // ==========================================
 const [syncStatus, setSyncStatus] = useState(
  isSupabaseConfigured ? SYNC_STATUS.IDLE : SYNC_STATUS.OFFLINE
);

const persistenceAdapterRef = useRef(inMemoryAdapter);
const supabaseAdapterRef = useRef(null);

// Se elige el adaptador UNA sola vez: Supabase para todos si está configurado.
// El adaptador decide solo si cada evento va como 'sandbox' o 'admin'.
useEffect(() => {
  if (isSupabaseConfigured) {
    if (!supabaseAdapterRef.current) {
      supabaseAdapterRef.current = new SupabasePersistenceAdapter(supabase, {
        fallback: inMemoryAdapter,
      });
    }
    persistenceAdapterRef.current = supabaseAdapterRef.current;
    syscalls.persistence = supabaseAdapterRef.current;
    setSyncStatus(supabaseAdapterRef.current.getSyncStatus());
  } else {
    inMemoryAdapter.setSandboxMode(true);
    persistenceAdapterRef.current = inMemoryAdapter;
    syscalls.persistence = inMemoryAdapter;
    setSyncStatus(SYNC_STATUS.OFFLINE);
  }

  if (!initialProcessEventsPersisted) {
    initialProcessEventsPersisted = true;
    for (const process of buildInitialProcesses()) {
      const allocatedBlocks = memoryManager
        .getBlocks()
        .filter((block) => block.ownerPid === process.pid)
        .map((block) => block.id);
      syscalls.emitEvent({
        type: 'PROCESS_CREATED',
        source: 'PROCESS_MGR',
        pid: process.pid,
        payload: process.toJSON(),
      });
      syscalls.emitEvent({
        type: 'MEMORY_ALLOCATED',
        source: 'MEM_MANAGER',
        pid: process.pid,
        payload: {
          processName: process.nombre,
          blockIds: allocatedBlocks,
          allocatedBlocks: allocatedBlocks.length,
          allocatedMB: allocatedBlocks.length * 16,
          initial: true,
        },
      });
      syscalls.persist('saveProcess', process);
    }
  }

  const handleSyncEvent = (e) => setSyncStatus(e.detail.status);
  window.addEventListener('robotos:sync', handleSyncEvent);
  return () => window.removeEventListener('robotos:sync', handleSyncEvent);
}, []);

// Si cambia el usuario, el adaptador vuelve a comprobar si hay sesión real de ADMIN.
useEffect(() => {
  supabaseAdapterRef.current?.refreshOrigin();
}, [user, role]);

  // ==========================================
  // 1. ESTADO DE ARRANQUE (BOOT MANAGER)
  // ==========================================
  const [bootLog, setBootLog] = useState([]);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const bootStarted = useRef(false);

  useEffect(() => {
    // Evita arrancar dos veces bajo StrictMode
    if (bootStarted.current) return;
    bootStarted.current = true;

bootManager.executeBoot().then((res) => {
  console.log('[BOOT] terminó. success =', res.success, '| campos:', Object.keys(res));
  setBootLog(res.bootLog);
  setIsSystemReady(res.success);

  const adapter = persistenceAdapterRef.current;
  adapter
    .saveBootRecord({
      timestamp: new Date().toISOString(),
      success: res.success,
      safeMode: Boolean(res.safeMode),
      stages: res.bootLog,
    })
    .then((ok) =>
      console.log('[BOOT] saveBootRecord ->', ok, '| adaptador:', adapter.name, '| error:', adapter.lastError)
    )
    .catch((e) => console.warn('[BOOT] saveBootRecord lanzó error:', e));
});
});
  // ==========================================
  // 2. MEMORIA FÍSICA (64 bloques x 16 MB)
  // Se construyen primero los procesos iniciales para que el mapa
  // de memoria arranque reflejando sus asignaciones.
  // ==========================================
  const [memoryBlocks, setMemoryBlocks] = useState(() => {
    buildInitialProcesses();
    return [...memoryManager.getBlocks()];
  });
  const [memoryStats, setMemoryStats] = useState(() => memoryManager.getStats());
  const [virtualMemoryState, setVirtualMemoryState] = useState(() => memoryManager.getVirtualMemorySnapshot());
  const refreshMemoryState = useCallback(() => {
    setMemoryBlocks([...memoryManager.getBlocks()]);
    setMemoryStats(memoryManager.getStats());
    setVirtualMemoryState(memoryManager.getVirtualMemorySnapshot());
  }, []);

  const vfsRef = useRef(null);
  if (!vfsRef.current) {
    vfsRef.current = syscalls.attachVirtualFileSystem(new VirtualFileSystem(INITIAL_FILE_SYSTEM));
  }

  // ==========================================
  // 3. PROCESOS
  // ==========================================
  const [processes, setProcesses] = useState(() => {
    buildInitialProcesses();
    return processManager.getAll();
  });

  // Los Proceso son instancias que se mutan en su lugar (admitir, ejecutar...).
  // Para que React re-renderice se publica una copia del arreglo.
  const refreshProcesses = () => {
    const currentProcesses = processManager.getAll();
    stateRef.current = { ...stateRef.current, processes: currentProcesses };
    setProcesses(currentProcesses);
  };

  // ==========================================
  // 4. VFS, DISPOSITIVOS, LOGS Y ALERTAS
  // ==========================================
  const [fileSystem, setFileSystem] = useState(() => vfsRef.current.getSnapshot());
  const [devices, setDevices] = useState(INITIAL_DEVICES);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);

  // ==========================================
  // 5. SIMULACIÓN DE CPU POR TICKS (MONONÚCLEO)
  // ==========================================
  const [isPlaying, setIsPlaying] = useState(false);
  const [algorithm, setAlgorithm] = useState(ALGORITMOS.PRIORIDAD);
  const [quantum, setQuantum] = useState(2); // 2, 4, 8
  const [simulationSpeed, setSimulationSpeed] = useState(1); // 1x, 2x, 5x
  const [tickCount, setTickCount] = useState(0);
  const [runningProcessId, setRunningProcessId] = useState(null);
  const [quantumRestante, setQuantumRestante] = useState(2);
  const [currentCpuUsage, setCurrentCpuUsage] = useState(0);
  const [timeline, setTimeline] = useState([]);
  const [executionMetrics, setExecutionMetrics] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);

  // Latencia local: tiempo desde la acción en el kernel hasta el siguiente frame pintado.
  const [localLatencyMs, setLocalLatencyMs] = useState(0);
  const realtimeStatus = 'NO CONECTADO (MODO LOCAL SIMULADO)';
  const realtimeLatencyMs = null; // No inventar números: null mientras no haya conexión Realtime

  const measureLatency = (t0) => {
    const publish = () => setLocalLatencyMs(+(performance.now() - t0).toFixed(1));
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(publish);
    } else {
      publish();
    }
  };

  const stateRef = useRef({
    processes,
    runningProcessId,
    quantumRestante,
    algorithm,
    quantum,
    tickCount,
    timeline,
    lastPid: null,
  });

  useEffect(() => {
    stateRef.current = {
      processes,
      runningProcessId,
      quantumRestante,
      algorithm,
      quantum,
      tickCount,
      timeline,
      lastPid: stateRef.current.lastPid,
    };
  }, [processes, runningProcessId, quantumRestante, algorithm, quantum, tickCount, timeline]);

  const stepTick = useCallback(() => {
    const t0 = performance.now();
    const current = stateRef.current;
    const nextTick = current.tickCount + 1;
    kernelClock.tick();

    const admissions = [];
    current.processes.forEach((p) => {
      if (p.estado === ESTADOS.NEW) {
        p.admitir();
        p.tickLlegada ??= nextTick - 1;
        admissions.push(p);
      }
    });

    const resultado = ejecutarTickInteractivo({
      procesos: current.processes,
      algoritmo: current.algorithm,
      quantumMax: current.quantum,
      quantumRestanteActual: current.quantumRestante,
      procesoRunningId: current.runningProcessId,
      tickActual: nextTick,
      ultimoPid: current.lastPid,
    });

    admissions.forEach((process) => {
      safeEmit({
        type: 'PROCESS_STATE_CHANGED',
        source: 'PROCESS_MGR',
        pid: process.pid,
        payload: { from: ESTADOS.NEW, to: ESTADOS.READY, reason: 'ADMITTED' },
      });
    });

    resultado.cambios.forEach((change) => {
      safeEmit({
        type: 'PROCESS_STATE_CHANGED',
        source: 'PROCESS_MGR',
        pid: change.pid,
        payload: { from: change.de, to: change.a, reason: change.motivo },
      });
      const process = processManager.get(change.pid);
      if (process) syscalls.persist('saveProcess', process);
      if (change.a === ESTADOS.TERMINATED) {
        syscalls.releaseProcessMemory(change.pid);
        safeEmit({
          type: 'PROCESS_TERMINATED',
          source: 'PROCESS_MGR',
          severity: 'INFO',
          pid: change.pid,
          payload: { nombre: change.nombre, reason: 'CPU_BURST_COMPLETED' },
        });
      }
    });

    if (resultado.cambioContexto) {
      safeEmit({
        type: 'CPU_CONTEXT_SWITCH',
        source: 'SCHEDULER',
        pid: resultado.cambioContexto.hacia,
        payload: {
          fromPid: resultado.cambioContexto.desde,
          toPid: resultado.cambioContexto.hacia,
        },
      });
    }

    const executionRecord = resultado.eventoRegistro || {
      tick: nextTick - 1,
      pid: null,
      nombre: 'IDLE',
      cpu: 0,
    };
    safeEmit({
      type: 'CPU_EXECUTION',
      source: 'SCHEDULER',
      pid: executionRecord.pid,
      payload: { ...executionRecord, algorithm: current.algorithm },
    });

    const nextTimeline = [...current.timeline, executionRecord];
    const metricResult = calcularMetricas({
      procesos: processManager.getAll(),
      linea: nextTimeline.filter((entry) => entry.pid !== null),
      ticksTotales: nextTick,
    });
    const metricRecord = {
      timestamp: new Date().toISOString(),
      algorithm: current.algorithm,
      quantum: current.algorithm === ALGORITMOS.ROUND_ROBIN ? current.quantum : null,
      ...metricResult.resumen,
      processes: metricResult.filas,
    };
    Promise.resolve(persistenceAdapterRef.current.saveMetric(metricRecord)).then((result) => {
      if (result === false || result?.success === false) {
        console.error('[SystemContext] No se pudieron persistir las métricas de CPU');
      }
    }).catch((error) => console.error('[SystemContext] Persistencia de métricas falló:', error));

    resultado.procesos.forEach((process) => processManager.register(process));
    const lastPid = resultado.eventoRegistro?.pid ?? current.lastPid;
    stateRef.current = {
      ...current,
      processes: processManager.getAll(),
      runningProcessId: resultado.procesoRunningId,
      quantumRestante: resultado.quantumRestante,
      tickCount: nextTick,
      timeline: nextTimeline,
      lastPid,
    };

    setProcesses(processManager.getAll());
    setRunningProcessId(resultado.procesoRunningId);
    setQuantumRestante(resultado.quantumRestante);
    setCurrentCpuUsage(resultado.cpuInstatanea);
    setTickCount(nextTick);
    setTimeline(nextTimeline);
    setExecutionMetrics(metricRecord);
    refreshMemoryState();

    // Se mide hasta que React haya confirmado el render y el navegador pinte
    const publish = () => setLocalLatencyMs(+(performance.now() - t0).toFixed(1));
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(publish);
    } else {
      publish();
    }
  }, [refreshMemoryState]);

  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.max(200, 1000 / simulationSpeed);
    const timer = setInterval(() => {
      stepTick();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, simulationSpeed, stepTick]);

  const playSimulation = () => setIsPlaying(true);
  const pauseSimulation = () => setIsPlaying(false);
  const resetSimulation = () => {
    setIsPlaying(false);
    const activeProcesses = processManager
      .getAll()
      .filter((process) => process.estado !== ESTADOS.TERMINATED);
    const activePids = new Set(activeProcesses.map((process) => process.pid));
    const allocatedToActive = memoryManager
      .getBlocks()
      .filter((block) => block.state === 'ALLOCATED' && activePids.has(block.ownerPid)).length;
    const requiredBlocks = activeProcesses.reduce((total, process) => total + process.memoryBlocks, 0);
    if (requiredBlocks > memoryManager.getFreeBlocksCount() + allocatedToActive) {
      addAlert({
        title: 'No se pudo reiniciar la simulación',
        details: 'La memoria disponible no permite restaurar todos los procesos activos.',
        severity: 'error',
      });
      return false;
    }

    activeProcesses.forEach((process) => {
      const previousState = process.estado;
      process.finalizar();
      safeEmit({
        type: 'PROCESS_STATE_CHANGED',
        source: 'PROCESS_MGR',
        pid: process.pid,
        payload: { from: previousState, to: ESTADOS.TERMINATED, reason: 'SIMULATION_RESET' },
      });
      safeEmit({
        type: 'PROCESS_TERMINATED',
        source: 'PROCESS_MGR',
        pid: process.pid,
        payload: { nombre: process.nombre, reason: 'SIMULATION_RESET' },
      });
      syscalls.persist('saveProcess', process);
      syscalls.releaseProcessMemory(process.pid);
      processManager.remove(process.pid);
    });

    const restarted = activeProcesses.map((process) => {
      const nextProcess = new Proceso({
        nombre: process.nombre,
        prioridad: process.prioridad,
        memoriaRequerida: process.memoriaRequerida,
        cpuRequerida: process.cpuRequerida,
        tiempoTotal: process.tiempoTotal,
        color: process.color,
        isSystem: process.isSystem,
        description: process.description,
        deviceIds: process.deviceIds,
        tickLlegada: 0,
      });
      const allocation = memoryManager.allocate(
        nextProcess.nombre,
        nextProcess.memoryBlocks,
        nextProcess.color,
        nextProcess.pid
      );
      memoryManager.createAddressSpace(nextProcess.pid, {
        sizeMB: Math.max(2048, nextProcess.memoriaRequerida * 2),
      });
      processManager.register(nextProcess);
      syscalls.emitEvent({
        type: 'PROCESS_CREATED',
        source: 'PROCESS_MGR',
        pid: nextProcess.pid,
        payload: { ...nextProcess.toJSON(), restarted: true },
      });
      syscalls.emitEvent({
        type: 'MEMORY_ALLOCATED',
        source: 'MEM_MANAGER',
        pid: nextProcess.pid,
        payload: {
          processName: nextProcess.nombre,
          blockIds: allocation.blockIds,
          allocatedBlocks: allocation.allocatedBlocks,
          allocatedMB: allocation.allocatedMB,
          restarted: true,
        },
      });
      syscalls.persist('saveProcess', nextProcess);
      return nextProcess;
    });
    const allProcesses = [...processManager.getAll()];
    const nextTimeline = [];
    setProcesses(allProcesses);
    refreshMemoryState();
    setTimeline(nextTimeline);
    setTickCount(0);
    setCurrentCpuUsage(0);
    setRunningProcessId(null);
    setQuantumRestante(quantum);
    setExecutionMetrics(null);
    setComparisonResults(null);
    stateRef.current = {
      ...stateRef.current,
      processes: allProcesses,
      tickCount: 0,
      timeline: nextTimeline,
      runningProcessId: null,
      quantumRestante: quantum,
      lastPid: null,
    };
    return restarted.length > 0;
  };

  const compareSchedulers = () => {
    const workload = processManager
      .getAll()
      .filter((process) => process.estado !== ESTADOS.TERMINATED)
      .map((process) => ({
        nombre: process.nombre,
        prioridad: process.prioridad,
        memoriaRequerida: process.memoriaRequerida,
        cpuRequerida: process.cpuRequerida,
        tiempoTotal: process.tiempoRestante,
        color: process.color,
        isSystem: process.isSystem,
        description: process.description,
        originalPid: process.pid,
      }));
    const simulationId = globalThis.crypto?.randomUUID?.() || `simulation-${Date.now()}`;
    const run = (algorithm, selectedQuantum) => {
      const simulationProcesses = workload.map((process) => {
        const clone = new Proceso(process);
        clone.pid = process.originalPid;
        clone.id = `simulation_${simulationId}_${clone.pid}`;
        clone.tickLlegada = 0;
        return clone;
      });
      const result = simular(simulationProcesses, { algoritmo: algorithm, quantum: selectedQuantum });
      let previousPid = null;
      result.linea.forEach((entry) => {
        safeEmit({
          type: 'CPU_EXECUTION',
          source: 'SCHEDULER',
          pid: entry.pid,
          correlationId: simulationId,
          payload: { ...entry, algorithm, simulationId, mode: 'COMPARISON' },
        });
        if (previousPid !== null && previousPid !== entry.pid) {
          safeEmit({
            type: 'CPU_CONTEXT_SWITCH',
            source: 'SCHEDULER',
            pid: entry.pid,
            correlationId: simulationId,
            payload: { fromPid: previousPid, toPid: entry.pid, algorithm, mode: 'COMPARISON' },
          });
        }
        previousPid = entry.pid;
      });
      const metrics = {
        timestamp: new Date().toISOString(),
        simulationId,
        algorithm,
        quantum: algorithm === ALGORITMOS.ROUND_ROBIN ? selectedQuantum : null,
        ...result.resumenMetricas,
        processes: result.metricasDetalladas,
      };
      Promise.resolve(persistenceAdapterRef.current.saveMetric(metrics)).then((saved) => {
        if (saved === false || saved?.success === false) {
          console.error(`[SystemContext] No se persistió la comparación ${algorithm}`);
        }
      }).catch((error) => console.error(`[SystemContext] Error persistiendo ${algorithm}:`, error));
      return { ...result, metrics };
    };

    const results = {
      prioridad: run(ALGORITMOS.PRIORIDAD, quantum),
      roundRobin: run(ALGORITMOS.ROUND_ROBIN, quantum),
    };
    setComparisonResults(results);
    return results;
  };

  const configureQuantum = (value) => {
    const nextQuantum = Number(value);
    if (![2, 4, 8].includes(nextQuantum)) {
      throw new Error('El quantum Round Robin debe ser 2, 4 u 8 ticks');
    }
    setQuantum(nextQuantum);
    setQuantumRestante(nextQuantum);
    stateRef.current = {
      ...stateRef.current,
      quantum: nextQuantum,
      quantumRestante: nextQuantum,
    };
  };

  // ==========================================
  // 6. MÉTRICAS CALCULADAS
  // ==========================================
  const freeBlocksCount = memoryManager.getFreeBlocksCount();
  const usedBlocksCount = memoryManager.getUsedBlocksCount();
  const activeAlertsCount = alerts.filter((a) => a.state === 'Activa').length;

  const runningNow = processes.find((p) => p.estado === ESTADOS.RUNNING);

  const metrics = {
    cpuUsage: currentCpuUsage > 0 ? currentCpuUsage : runningNow?.cpuRequerida ?? 0,
    ramUsageMB: usedBlocksCount * 16,
    ramTotalMB: 1024,
    storageUsageGB: 26.8,
    storageTotalGB: 64,
    batteryPercent: 84,
    powerDrawWatts: 115 + (currentCpuUsage > 0 ? Math.round(currentCpuUsage * 0.8) : 0),
    robotStatus: activeAlertsCount > 0 ? 'EN ALERTA' : isSystemReady ? 'OPERATIVO' : 'INICIANDO',
    localLatencyMs,
    realtimeLatencyMs,
    realtimeStatus,
  };

  // ==========================================
  // 7. BITÁCORA Y ALERTAS
  // ==========================================
  const addLog = ({ level = 'INFO', source = 'SYSTEM', message }) => {
    const newLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: kernelClock.getTimestamp(),
      level,
      source,
      message,
    };
    setLogs((prev) => [newLogEntry, ...prev.slice(0, 99)]);
    inMemoryAdapter.saveLog(newLogEntry).catch(() => {});
  };

  const addAlert = ({ title, details, severity = 'error' }) => {
    const newAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: kernelClock.getTimestamp(),
      title,
      details,
      severity,
      state: 'Activa',
    };
    setAlerts((prev) => [newAlert, ...prev]);

    addLog({
      level: severity === 'warning' ? 'WARN' : 'ERROR',
      source: 'ALERT_DAEMON',
      message: `[ALERTA EMITIDA] ${title}: ${details}`,
    });

    safeEmit({
      type: 'ALERT_RAISED',
      source: 'ALERT_DAEMON',
      severity: severity === 'warning' ? 'WARN' : 'ERROR',
      payload: { title, details },
    });
  };

  const resolveAlert = (alertId) => {
    const alerta = alerts.find((al) => al.id === alertId);
    if (!alerta) return;

    addLog({
      level: 'INFO',
      source: 'ALERT_DAEMON',
      message: `Alerta "${alerta.title}" marcada como Resuelta por el operador.`,
    });
    safeEmit({
      type: 'ALERT_RESOLVED',
      source: 'ALERT_DAEMON',
      severity: 'INFO',
      payload: { alertId, title: alerta.title },
    });

    setAlerts((prev) => prev.map((al) => (al.id === alertId ? { ...al, state: 'Resuelta' } : al)));
  };

  // ==========================================
  // 8. PROCESOS Y MEMORIA VÍA SYSCALLS
  // Ninguna acción con efectos secundarios (logs, eventos, syscalls)
  // se ejecuta dentro de un setState(prev => ...): StrictMode los llama dos veces.
  // ==========================================
  const createProcess = ({
    name,
    priority = 'Media',
    memoryBlocksCount = 2,
    cpu = 10,
    tiempoTotal = 4,
    deviceIds = [],
  }) => {
    try {
      const res = syscalls.createProcess(
        {
          name,
          priority,
          memoryBlocksCount,
          cpu,
          tiempoTotal,
          deviceIds,
          tickLlegada: stateRef.current.tickCount,
          existingProcesses: processManager.getAll(),
        },
        authContext
      );

      processManager.register(res.process);
      syscalls.persist('saveProcess', res.process);
      refreshProcesses();
      refreshMemoryState();

      addLog({
        level: 'INFO',
        source: 'PROCESS_MGR',
        message: `sys_create_process: PID ${res.process.pid} [${res.process.nombre}] creado en estado NEW con ${res.memory.allocatedBlocks} bloques asignados.`,
      });

      return { success: true, process: res.process };
    } catch (err) {
      addAlert({
        title: 'Error en Creación de Proceso',
        details: err.message,
        severity: 'error',
      });
      return { success: false, reason: err.message };
    }
  };

  const recordProcessStateChange = (process, from, to, reason) => {
    safeEmit({
      type: 'PROCESS_STATE_CHANGED',
      source: 'PROCESS_MGR',
      pid: process.pid,
      payload: { from, to, reason },
    });
    syscalls.persist('saveProcess', process);
  };

  // Lleva un proceso a RUNNING garantizando una sola CPU:
  // el que estuviera corriendo vuelve a READY (expropiación).
  const promoteToRunning = (target) => {
    const previousRunning = processManager.getAll().find((process) => process.estado === ESTADOS.RUNNING);
    if (previousRunning && previousRunning !== target) {
      previousRunning.expropiar();
      recordProcessStateChange(previousRunning, ESTADOS.RUNNING, ESTADOS.READY, 'MANUAL_PREEMPTION');
    }
    if (target.estado === ESTADOS.NEW) {
      target.admitir();
      target.tickLlegada ??= stateRef.current.tickCount;
      recordProcessStateChange(target, ESTADOS.NEW, ESTADOS.READY, 'ADMITTED');
    }
    if (target.estado === ESTADOS.READY) {
      const previousPid = previousRunning && previousRunning !== target ? previousRunning.pid : null;
      target.ejecutar();
      setRunningProcessId(target.id);
      setQuantumRestante(quantum);
      recordProcessStateChange(target, ESTADOS.READY, ESTADOS.RUNNING, 'MANUAL_DISPATCH');
      if (previousPid !== null) {
        safeEmit({
          type: 'CPU_CONTEXT_SWITCH',
          source: 'SCHEDULER',
          pid: target.pid,
          payload: { fromPid: previousPid, toPid: target.pid },
        });
      }
      stateRef.current = {
        ...stateRef.current,
        runningProcessId: target.id,
        quantumRestante: quantum,
        lastPid: target.pid,
      };
      return true;
    }
    return false;
  };

  const executeProcess = (processId) => {
    const target = processManager.getAll().find((p) => sameId(p, processId));
    if (!target) return;

    if (target.estado !== ESTADOS.NEW && target.estado !== ESTADOS.READY) {
      addLog({
        level: 'WARN',
        source: 'SCHEDULER',
        message: `No se puede ejecutar PID ${target.pid} (${target.nombre}): estado actual [${target.estado}].`,
      });
      return;
    }

    const started = promoteToRunning(target);
    refreshProcesses();

    if (started) {
      addLog({
        level: 'INFO',
        source: 'SCHEDULER',
        message: `Proceso PID ${target.pid} (${target.nombre}) puesto en ejecución -> [RUNNING].`,
      });
      safeEmit({
        type: 'PROCESS_STARTED',
        source: 'PROCESS_MGR',
        severity: 'INFO',
        pid: target.pid,
        payload: { nombre: target.nombre },
      });
    }
  };

  const pauseProcess = (processId) => {
    const target = processManager.getAll().find((p) => sameId(p, processId));
    if (!target) return;

    if (target.estado === ESTADOS.NEW) {
      target.admitir();
      target.tickLlegada ??= stateRef.current.tickCount;
      recordProcessStateChange(target, ESTADOS.NEW, ESTADOS.READY, 'ADMITTED');
    }
    if (target.estado !== ESTADOS.RUNNING && target.estado !== ESTADOS.READY) return;

    const previousState = target.estado;
    target.bloquear();
    recordProcessStateChange(target, previousState, ESTADOS.BLOCKED, 'MANUAL_BLOCK');
    if (runningProcessId === target.id) {
      setRunningProcessId(null);
      setCurrentCpuUsage(0);
      stateRef.current = { ...stateRef.current, runningProcessId: null };
    }
    refreshProcesses();

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.nombre}) pausado -> [WAITING].`,
    });
    safeEmit({
      type: 'PROCESS_BLOCKED',
      source: 'PROCESS_MGR',
      severity: 'WARN',
      pid: target.pid,
      payload: { nombre: target.nombre },
    });
  };

  const resumeProcess = (processId) => {
    const target = processManager.getAll().find((p) => sameId(p, processId));
    if (!target || (target.estado !== ESTADOS.BLOCKED && target.estado !== ESTADOS.WAITING)) return;

    const previousState = target.estado;
    target.reanudar();
    recordProcessStateChange(target, previousState, ESTADOS.READY, 'MANUAL_RESUME');
    refreshProcesses();

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `Proceso PID ${target.pid} (${target.nombre}) reanudado -> [READY].`,
    });
    safeEmit({
      type: 'PROCESS_RESUMED',
      source: 'PROCESS_MGR',
      severity: 'INFO',
      pid: target.pid,
      payload: { nombre: target.nombre },
    });
  };

  const terminateProcess = (processId) => {
    try {
      const res = syscalls.terminateProcess(processId, authContext, processes);

      if (runningProcessId === res.process.id) {
        setRunningProcessId(null);
        setCurrentCpuUsage(0);
      }

      refreshProcesses();
      refreshMemoryState();

      addLog({
        level: 'WARN',
        source: 'PROCESS_MGR',
        message: `sys_terminate_process: PID ${res.process.pid} (${res.process.nombre}) finalizado -> TERMINATED. Liberados ${res.freedBlocks} bloques.`,
      });

      return { success: true, freedBlocks: res.freedBlocks };
    } catch (err) {
      addAlert({
        title: 'Acción Denegada',
        details: err.message,
        severity: 'error',
      });
      return { success: false, reason: err.message };
    }
  };

  const freeMemoryBlock = (blockId) => {
    try {
      syscalls.freeMemory(blockId, authContext, processes);
      refreshMemoryState();

      addLog({
        level: 'INFO',
        source: 'MEM_MANAGER',
        message: `sys_free_memory: Bloque #${blockId} liberado por ${user?.email || 'usuario'}.`,
      });
      return true;
    } catch (err) {
      addLog({
        level: 'WARN',
        source: 'MEM_MANAGER',
        message: `sys_free_memory error: ${err.message}`,
      });
      return false;
    }
  };

  const configureVirtualPageSize = (pageSizeMB) => {
    try {
      const snapshot = memoryManager.configurePageSize(pageSizeMB);
      refreshMemoryState();
      return { success: true, snapshot };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  };

  const setVirtualMemoryAlgorithm = (algorithm) => {
    try {
      memoryManager.setReplacementAlgorithm(algorithm);
      refreshMemoryState();
      return { success: true };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  };

  const accessVirtualAddress = (pid, address, options) => {
    try {
      const result = syscalls.accessVirtualAddress(pid, address, options);
      refreshMemoryState();
      return { success: true, result };
    } catch (error) {
      refreshMemoryState();
      return { success: false, reason: error.message };
    }
  };

  const comparePageReplacement = (references, frameCount) =>
    memoryManager.compareReferenceString(references, frameCount);

  // ==========================================
  // 9. VFS VÍA SYSCALLS
  // ==========================================
  const createDirectory = (path, permissions) => {
    try {
      const directory = syscalls.createDirectory(path, { permissions }, authContext);
      setFileSystem(vfsRef.current.getSnapshot());
      addLog({
        level: 'INFO',
        source: 'VFS',
        message: `sys_create_directory: Directorio creado en ${directory.path}.`,
      });
      return directory;
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
      return { success: false, reason: err.message };
    }
  };

  const createFile = (folder, { name, content = '', permissions = 'rw-r--r--' }, pid = null) => {
    try {
      const path = `${folder}/${name}`;
      const file = syscalls.createVirtualFile(path, content, { permissions, pid }, authContext);
      setFileSystem(vfsRef.current.getSnapshot());
      addLog({
        level: 'INFO',
        source: 'VFS',
        message: `sys_create_file: Archivo creado en ${path}.`,
      });
      return { success: true, file };
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
      return { success: false, reason: err.message };
    }
  };

  const writeFile = (path, content, pid = null) => {
    try {
      const file = syscalls.writeVirtualFile(path, content, authContext, pid);
      setFileSystem(vfsRef.current.getSnapshot());
      addLog({
        level: 'INFO',
        source: 'VFS',
        message: `sys_write_file: Archivo actualizado en ${path}.`,
      });
      return { success: true, file };
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
      return { success: false, reason: err.message };
    }
  };

  const setFilePermissions = (path, permissions, pid = null) => {
    try {
      const file = syscalls.setVirtualFilePermissions(path, permissions, authContext, pid);
      setFileSystem(vfsRef.current.getSnapshot());
      return { success: true, file };
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
      return { success: false, reason: err.message };
    }
  };

  const updateFile = (folder, fileId, newName, pid = null) => {
    try {
      const file = fileSystem[folder]?.find((entry) => entry.id === fileId);
      if (!file) throw new Error(`Archivo no encontrado (id ${fileId}) en ${folder}.`);
      const updated = syscalls.renameVirtualFile(`${folder}/${file.name}`, newName, authContext, pid);
      setFileSystem(vfsRef.current.getSnapshot());
      return { success: true, file: updated };
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
      return { success: false, reason: err.message };
    }
  };

  const deleteFile = (folder, fileId, pid = null) => {
    try {
      const file = fileSystem[folder]?.find((entry) => entry.id === fileId);
      if (!file) throw new Error(`Archivo no encontrado (id ${fileId}) en ${folder}.`);
      const deleted = syscalls.deleteVirtualFile(`${folder}/${file.name}`, authContext, pid);
      setFileSystem(vfsRef.current.getSnapshot());
      addLog({
        level: 'WARN',
        source: 'VFS',
        message: `sys_delete_file: Archivo eliminado en ${folder}: "${deleted.name}".`,
      });
      return { success: true, file: deleted };
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
      return { success: false, reason: err.message };
    }
  };

  const readFile = (path, pid = null) => {
    return syscalls.readVirtualFile(path, authContext, pid);
  };

  // ==========================================
  // 10. ACCIÓN "SALUDAR"
  // Emite un evento ROBOT_GREETING por el Event Engine con el esquema JSON fijo.
  // Si Supabase está configurado y el usuario es ADMIN, el evento se persiste en
  // kernel_events (via SupabasePersistenceAdapter.saveEvent → insert a Supabase).
  // En modo sandbox (visitante / sin Supabase) el evento queda en la caché local.
  // ==========================================
  const saludar = useCallback(() => {
    const t0 = performance.now();
    const event = safeEmit({
      type: 'ROBOT_GREETING',
      source: 'ROUTINE_ENGINE',
      severity: 'INFO',
      pid: null,
      payload: {
        message: '¡Hola! RobotOS SmartHouse operativo.',
        operator: user?.email || 'visitante',
        isSandbox: persistenceAdapterRef.current.isSandboxMode(),
      },
    });

    addLog({
      level: 'INFO',
      source: 'ROUTINE_ENGINE',
      message: `Acción Saludar ejecutada. Evento emitido: ${event?.id || '(ninguno)'}. Adaptador: ${
        persistenceAdapterRef.current.isSandboxMode() ? 'InMemory/Sandbox' : 'Supabase'
      }.`,
    });

    measureLatency(t0);
    return event;
  }, [user, role]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================
  // 11. DISPOSITIVOS VÍA SYSCALLS
  // ==========================================
  const toggleDevice = (id) => {
    const t0 = performance.now();
    const d = devices.find((x) => x.id === id);
    if (!d) return;

    let nextStatus;
    let extra = {};

    switch (d.type) {
      case 'light':
        nextStatus = d.status === 'ON' ? 'OFF' : 'ON';
        break;
      case 'motion':
        nextStatus = d.status === 'EN REPOSO' ? 'DETECTADO' : 'EN REPOSO';
        break;
      case 'camera':
        nextStatus = d.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
        break;
      case 'lock':
        nextStatus = d.status === 'BLOQUEADA' ? 'DESBLOQUEADA' : 'BLOQUEADA';
        break;
      case 'climate': {
        const nextTemp = d.temperature >= 24 ? 20.0 : +(d.temperature + 1.5).toFixed(1);
        nextStatus = `${nextTemp} °C`;
        extra = { temperature: nextTemp };
        break;
      }
      default:
        nextStatus = d.status === 'ON' ? 'OFF' : 'ON';
    }

    try {
      // Se pasa una copia para que el syscall no mute el estado de React directamente
      syscalls.deviceWrite(id, nextStatus, [{ ...d }], authContext);
    } catch (err) {
      addAlert({
        title: 'Operación Denegada',
        details: err.message,
        severity: 'warning',
      });
      return;
    }

    setDevices((prev) => prev.map((x) => (x.id === id ? { ...x, status: nextStatus, ...extra } : x)));

    addLog({
      level: 'INFO',
      source: 'IOT_MANAGER',
      message: `sys_device_write: "${d.name}" conmutado a: ${nextStatus}.`,
    });

    measureLatency(t0);
  };

  // ==========================================
  // 11. SIMULACIÓN DE FALLOS (con transiciones de estado válidas)
  // ==========================================
  const simulateSensorDisconnected = () => {
    addAlert({
      title: 'Sensor Desconectado',
      details: 'El sensor de temperatura en Salón no responde en el bus I2C (Hardware Offline).',
      severity: 'warning',
    });

    addLog({
      level: 'ERROR',
      source: 'HARDWARE_BUS',
      message: '[FALLO DETECTADO] Dispositivo sensor_temp_01 desconectado físicamente del bus I2C.',
    });
    safeEmit({
      type: 'SENSOR_ALERT',
      source: 'HARDWARE_BUS',
      severity: 'ERROR',
      payload: { device: 'sensor_temp_01', reason: 'Desconexión del bus I2C' },
    });

    const target = processManager.getAll().find((p) => p.nombre === 'temp_manager');
    if (!target) {
      addLog({
        level: 'WARN',
        source: 'REACTOR',
        message: '[REACCIÓN KERNEL] No se encontró el proceso "temp_manager" para bloquearlo.',
      });
      return;
    }

    if (target.estado === ESTADOS.NEW) {
      target.admitir();
      target.tickLlegada ??= stateRef.current.tickCount;
      recordProcessStateChange(target, ESTADOS.NEW, ESTADOS.READY, 'ADMITTED');
    }
    if (target.estado === ESTADOS.READY || target.estado === ESTADOS.RUNNING) {
      const previousState = target.estado;
      target.bloquear();
      recordProcessStateChange(target, previousState, ESTADOS.BLOCKED, 'DEVICE_UNAVAILABLE');
      if (runningProcessId === target.id) {
        setRunningProcessId(null);
        setCurrentCpuUsage(0);
        stateRef.current = { ...stateRef.current, runningProcessId: null };
      }
    }
    target.color = '#F59E0B';
    refreshProcesses();

    addLog({
      level: 'WARN',
      source: 'REACTOR',
      message: `[REACCIÓN KERNEL] Proceso "temp_manager" (PID ${target.pid}) puesto en estado WAITING por falta de telemetría.`,
    });
    safeEmit({
      type: 'PROCESS_BLOCKED',
      source: 'PROCESS_MGR',
      severity: 'WARN',
      pid: target.pid,
      payload: { nombre: target.nombre, motivo: 'Sensor desconectado' },
    });
  };

  const simulateCommLoss = () => {
    addAlert({
      title: 'Pérdida de Comunicación',
      details: 'Pérdida de enlace inalámbrico Zigbee con Cerradura Puerta Principal.',
      severity: 'error',
    });

    setDevices((prev) => prev.map((d) => (d.id === 'd5' ? { ...d, status: 'OFFLINE' } : d)));

    addLog({
      level: 'ERROR',
      source: 'NETWORK_STACK',
      message: '[FALLO DETECTADO] Pérdida de paquetes en nodo Zigbee 0x4A1F (Cerradura Puerta Principal).',
    });
    addLog({
      level: 'WARN',
      source: 'REACTOR',
      message: '[REACCIÓN KERNEL] Dispositivo "Cerradura Puerta Principal" conmutado a estado OFFLINE.',
    });
    addLog({
      level: 'INFO',
      source: 'NETWORK_STACK',
      message: '[REINTENTO CONEXIÓN] Handshake con nodo 0x4A1F (Reintento 1/3)... Fallido (Timeout 3000ms).',
    });
    safeEmit({
      type: 'DEVICE_DISCONNECTED',
      source: 'NETWORK_STACK',
      severity: 'ERROR',
      payload: { deviceId: 'd5', node: '0x4A1F', reason: 'Pérdida de enlace Zigbee' },
    });
  };

  const simulateUnauthorizedAccess = () => {
    addAlert({
      title: 'Acceso No Autorizado',
      details: 'Detección de intento de apertura forzada o PIN erróneo en Entrada.',
      severity: 'critical',
    });

    addLog({
      level: 'ERROR',
      source: 'SECURITY_CORE',
      message: '[FALLO DETECTADO] 3 intentos erróneos consecutivos en Cerradura Puerta Principal.',
    });
    safeEmit({
      type: 'SECURITY_VIOLATION',
      source: 'SECURITY_CORE',
      severity: 'CRITICAL',
      payload: { reason: '3 intentos erróneos en cerradura', zone: 'Entrada' },
    });

    const target = processManager.getAll().find((p) => p.nombre === 'surveillance_proc');
    if (target) {
      target.prioridad = 1;
      target.priority = 'Crítica';
      target.color = '#EF4444';
      if (target.estado === ESTADOS.BLOCKED || target.estado === ESTADOS.WAITING) {
        const previousState = target.estado;
        target.reanudar();
        recordProcessStateChange(target, previousState, ESTADOS.READY, 'SECURITY_ALERT_RESUME');
      }
      const started = promoteToRunning(target);
      refreshProcesses();

      addLog({
        level: 'WARN',
        source: 'REACTOR',
        message: started
          ? `[REACCIÓN KERNEL] Protocolo de intrusión: "surveillance_proc" (PID ${target.pid}) elevado a prioridad CRÍTICA y estado RUNNING.`
          : `[REACCIÓN KERNEL] "surveillance_proc" (PID ${target.pid}) elevado a prioridad CRÍTICA (estado actual: ${target.estado}).`,
      });
    }

    setDevices((prev) => prev.map((d) => (d.type === 'lock' ? { ...d, status: 'BLOQUEADA' } : d)));

    addLog({
      level: 'INFO',
      source: 'REACTOR',
      message: '[REACCIÓN HARDWARE] Cerrojo electrónico asegurado forzosamente: Estado fijado en BLOQUEADA.',
    });
  };

  const getSystemSnapshot = async () => {
    return inMemoryAdapter.getSystemSnapshot();
  };

  return (
    <SystemContext.Provider
      value={{
        metrics,
        processes,
        memoryBlocks,
        memoryStats,
        virtualMemoryState,
        freeBlocksCount,
        usedBlocksCount,
        fileSystem,
        devices,
        logs,
        alerts,
        activeAlertsCount,
        bootLog,
        isSystemReady,
        isPlaying,
        algorithm,
        quantum,
        simulationSpeed,
        tickCount,
        runningProcessId,
        quantumRestante,
        timeline,
        executionMetrics,
        comparisonResults,
        playSimulation,
        pauseSimulation,
        stepTick,
        resetSimulation,
        setAlgorithm,
        setQuantum: configureQuantum,
        setSimulationSpeed,
        compareSchedulers,
        createProcess,
        executeProcess,
        pauseProcess,
        resumeProcess,
        terminateProcess,
        freeMemoryBlock,
        configureVirtualPageSize,
        setVirtualMemoryAlgorithm,
        accessVirtualAddress,
        comparePageReplacement,
        createFile,
        writeFile,
        setFilePermissions,
        createDirectory,
        updateFile,
        deleteFile,
        readFile,
        listVirtualDirectory: (path) => syscalls.listVirtualDirectory(path, authContext),
        processDeviceRelations: processManager.getDeviceRelations(),
        memoryHistory: memoryManager.getHistory(),
        toggleDevice,
        addLog,
        addAlert,
        resolveAlert,
        simulateSensorDisconnected,
        simulateCommLoss,
        simulateUnauthorizedAccess,
        getSystemSnapshot,
        saludar,
        isSandboxMode: persistenceAdapterRef.current.isSandboxMode(),
        syncStatus,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => useContext(SystemContext); 