import React, { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Proceso,
  ESTADOS,
  ALGORITMOS,
  ejecutarTickInteractivo,
  kernelClock,
  bootManager,
  inMemoryAdapter,
  syscalls,
  memoryManager,
} from '../core';
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

const buildInitialProcesses = () => {
  if (initialProcessesCache) return initialProcessesCache;

  initialProcessesCache = INITIAL_PROCESSES.map((p, idx) => {
    const priorityNum = idx === 0 ? 3 : idx === 1 ? 2 : idx === 2 ? 1 : idx === 5 ? 1 : 3;
    const memReq = p.memory || p.memoryBlocks * 16;
    try {
      memoryManager.allocate(p.name, p.memoryBlocks || Math.ceil(memReq / 16), p.color);
    } catch (e) {
      // Memoria insuficiente en la precarga: el proceso se crea igualmente sin bloques
    }
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
      setBootLog(res.bootLog);
      setIsSystemReady(res.success);
    });
  }, []);

  // ==========================================
  // 2. MEMORIA FÍSICA (64 bloques x 16 MB)
  // Se construyen primero los procesos iniciales para que el mapa
  // de memoria arranque reflejando sus asignaciones.
  // ==========================================
  const [memoryBlocks, setMemoryBlocks] = useState(() => {
    buildInitialProcesses();
    return [...memoryManager.getBlocks()];
  });

  // ==========================================
  // 3. PROCESOS
  // ==========================================
  const [processes, setProcesses] = useState(() => [...buildInitialProcesses()]);

  // Los Proceso son instancias que se mutan en su lugar (admitir, ejecutar...).
  // Para que React re-renderice se publica una copia del arreglo.
  const refreshProcesses = () => setProcesses((prev) => [...prev]);

  // ==========================================
  // 4. VFS, DISPOSITIVOS, LOGS Y ALERTAS
  // ==========================================
  const [fileSystem, setFileSystem] = useState(INITIAL_FILE_SYSTEM);
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
    };
  }, [processes, runningProcessId, quantumRestante, algorithm, quantum, tickCount, timeline]);

  const stepTick = useCallback(() => {
    const t0 = performance.now();
    const current = stateRef.current;
    const nextTick = current.tickCount + 1;
    kernelClock.tick();

    const resultado = ejecutarTickInteractivo({
      procesos: current.processes,
      algoritmo: current.algorithm,
      quantumMax: current.quantum,
      quantumRestanteActual: current.quantumRestante,
      procesoRunningId: current.runningProcessId,
      tickActual: nextTick,
    });

    setProcesses([...resultado.procesos]);
    setRunningProcessId(resultado.procesoRunningId);
    setQuantumRestante(resultado.quantumRestante);
    setCurrentCpuUsage(resultado.cpuInstatanea);
    setTickCount(nextTick);

    if (resultado.eventoRegistro) {
      setTimeline((prev) => [...prev.slice(-39), resultado.eventoRegistro]);
    }

    // Se mide hasta que React haya confirmado el render y el navegador pinte
    const publish = () => setLocalLatencyMs(+(performance.now() - t0).toFixed(1));
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(publish);
    } else {
      publish();
    }
  }, []);

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
    setTickCount(0);
    setTimeline([]);
    setCurrentCpuUsage(0);
    setRunningProcessId(null);
    setQuantumRestante(quantum);
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
  const createProcess = ({ name, priority = 'Media', memoryBlocksCount = 2, cpu = 10, tiempoTotal = 4 }) => {
    try {
      const res = syscalls.createProcess(
        { name, priority, memoryBlocksCount, cpu, tiempoTotal, existingProcesses: processes },
        authContext
      );

      setProcesses((prev) => [...prev, res.process]);
      setMemoryBlocks([...memoryManager.getBlocks()]);

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

  // Lleva un proceso a RUNNING garantizando una sola CPU:
  // el que estuviera corriendo vuelve a READY (expropiación).
  const promoteToRunning = (target) => {
    processes.forEach((q) => {
      if (q !== target && q.estado === ESTADOS.RUNNING) q.expropiar();
    });
    if (target.estado === ESTADOS.NEW) target.admitir();
    if (target.estado === ESTADOS.READY) {
      target.ejecutar();
      setRunningProcessId(target.id);
      setQuantumRestante(quantum);
      return true;
    }
    return false;
  };

  const executeProcess = (processId) => {
    const target = processes.find((p) => sameId(p, processId));
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
    const target = processes.find((p) => sameId(p, processId));
    if (!target) return;

    if (target.estado === ESTADOS.NEW) target.admitir();
    if (target.estado !== ESTADOS.RUNNING && target.estado !== ESTADOS.READY) return;

    target.pausar();
    if (runningProcessId === target.id) {
      setRunningProcessId(null);
      setCurrentCpuUsage(0);
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
    const target = processes.find((p) => sameId(p, processId));
    if (!target || target.estado !== ESTADOS.WAITING) return;

    target.reanudar();
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
      setMemoryBlocks([...memoryManager.getBlocks()]);

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
      setMemoryBlocks([...memoryManager.getBlocks()]);

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

  // ==========================================
  // 9. VFS VÍA SYSCALLS
  // ==========================================
  const createFile = (folder, { name, size = '10 KB', content = '' }) => {
    const path = `${folder}/${name}`;
    try {
      const res = syscalls.writeFile(path, content, fileSystem, { permissions: 'rw-r--r--' }, authContext);
      setFileSystem({ ...fileSystem });
      addLog({
        level: 'INFO',
        source: 'VFS',
        message: `sys_write_file: Archivo creado en ${path}.`,
      });
      return res;
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
    }
  };

  const updateFile = (folder, fileId, newName) => {
    try {
      syscalls.renameFile(folder, fileId, newName, fileSystem, authContext);
      setFileSystem({ ...fileSystem });
      addLog({
        level: 'INFO',
        source: 'VFS',
        message: `sys_rename_file: Archivo renombrado a "${newName}" en ${folder}.`,
      });
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
    }
  };

  const deleteFile = (folder, fileId) => {
    try {
      const res = syscalls.deleteFile(folder, fileId, fileSystem, authContext);
      setFileSystem({ ...fileSystem });
      addLog({
        level: 'WARN',
        source: 'VFS',
        message: `sys_delete_file: Archivo eliminado en ${folder}: "${res.file.name}".`,
      });
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
    }
  };

  const readFile = (path) => {
    return syscalls.readFile(path, fileSystem);
  };

  // ==========================================
  // 10. DISPOSITIVOS VÍA SYSCALLS
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

    const target = processes.find((p) => p.nombre === 'temp_manager');
    if (!target) {
      addLog({
        level: 'WARN',
        source: 'REACTOR',
        message: '[REACCIÓN KERNEL] No se encontró el proceso "temp_manager" para bloquearlo.',
      });
      return;
    }

    if (target.estado === ESTADOS.NEW) target.admitir();
    if (target.estado === ESTADOS.READY || target.estado === ESTADOS.RUNNING) {
      target.pausar();
      if (runningProcessId === target.id) {
        setRunningProcessId(null);
        setCurrentCpuUsage(0);
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

    const target = processes.find((p) => p.nombre === 'surveillance_proc');
    if (target) {
      target.prioridad = 1;
      target.priority = 'Crítica';
      target.color = '#EF4444';
      if (target.estado === ESTADOS.WAITING) target.reanudar();
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
        playSimulation,
        pauseSimulation,
        stepTick,
        resetSimulation,
        setAlgorithm,
        setQuantum,
        setSimulationSpeed,
        createProcess,
        executeProcess,
        pauseProcess,
        resumeProcess,
        terminateProcess,
        freeMemoryBlock,
        createFile,
        updateFile,
        deleteFile,
        readFile,
        toggleDevice,
        addLog,
        addAlert,
        resolveAlert,
        simulateSensorDisconnected,
        simulateCommLoss,
        simulateUnauthorizedAccess,
        getSystemSnapshot,
        isSandboxMode: inMemoryAdapter.isSandboxMode(),
        syncStatus: inMemoryAdapter.getSyncStatus(),
      }}
    >
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => useContext(SystemContext); 