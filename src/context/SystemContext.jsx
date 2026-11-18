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

export const SystemProvider = ({ children }) => {
  const { user, role } = useAuth();
  const authContext = useMemo(() => ({ user, role }), [user, role]);

  // ==========================================
  // 1. ESTADO DE ARRANQUE (BOOT MANAGER - 8 ETAPAS)
  // ==========================================
  const [bootLog, setBootLog] = useState([]);
  const [isSystemReady, setIsSystemReady] = useState(false);

  useEffect(() => {
    // Ejecutar secuencia canónica de arranque al montar el Kernel
    bootManager.executeBoot().then((res) => {
      setBootLog(res.bootLog);
      setIsSystemReady(res.success);
    });
  }, []);

  // ==========================================
  // 2. MEMORIA FÍSICA (MemoryManager: 64 bloques x 16 MB)
  // ==========================================
  const [memoryBlocks, setMemoryBlocks] = useState(() => memoryManager.getBlocks());

  // ==========================================
  // 3. PROCESOS (Instancias de Proceso del Core)
  // ==========================================
  const [processes, setProcesses] = useState(() => {
    return INITIAL_PROCESSES.map((p, idx) => {
      const priorityNum = idx === 0 ? 3 : idx === 1 ? 2 : idx === 2 ? 1 : idx === 5 ? 1 : 3;
      const memReq = p.memory || p.memoryBlocks * 16;
      // Registrar asignación en memoryManager si no está asignado
      try {
        memoryManager.allocate(p.name, p.memoryBlocks || Math.ceil(memReq / 16), p.color);
      } catch (e) {
        // Ignorar en precarga inicial
      }
      return new Proceso({
        nombre: p.name,
        prioridad: priorityNum,
        memoriaRequerida: memReq,
        cpuRequerida: p.cpu,
        tiempoTotal: idx === 2 ? 8 : idx === 0 ? 6 : 4,
        color: p.color,
        isSystem: p.isSystem,
        description: p.description,
      });
    });
  });

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

  // Latencia medida localmente vs estado de Realtime
  const [localLatencyMs, setLocalLatencyMs] = useState(1);
  const realtimeStatus = 'NO CONECTADO (MODO LOCAL SIMULADO)';
  const realtimeLatencyMs = null; // No inventar números: null al no haber conexión WebSocket activa

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

    const tRender = performance.now() - t0;
    setLocalLatencyMs(Math.max(1, Math.round(tRender)));
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

  const metrics = {
    cpuUsage: currentCpuUsage > 0 ? currentCpuUsage : (processes.find((p) => p.state === 'RUNNING')?.cpu || 0),
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
      id: `alert_${Date.now()}`,
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

    syscalls.emitEvent({
      type: 'ALERT_RAISED',
      source: 'ALERT_DAEMON',
      severity: severity === 'warning' ? 'WARN' : 'ERROR',
      payload: { title, details },
    });
  };

  const resolveAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((al) => {
        if (al.id === alertId) {
          addLog({
            level: 'INFO',
            source: 'ALERT_DAEMON',
            message: `Alerta "${al.title}" marcada como Resuelta por el operador.`,
          });
          syscalls.emitEvent({
            type: 'ALERT_RESOLVED',
            source: 'ALERT_DAEMON',
            severity: 'INFO',
            payload: { alertId, title: al.title },
          });
          return { ...al, state: 'Resuelta' };
        }
        return al;
      })
    );
  };

  // ==========================================
  // 8. GESTIÓN DE PROCESOS Y MEMORIA VÍA SYSCALLS
  // ==========================================
  const createProcess = ({ name, priority = 'Media', memoryBlocksCount = 2, cpu = 10, tiempoTotal = 4 }) => {
    try {
      // Pasa estrictamente por la syscall validando rol ADMIN y memoria
      const res = syscalls.createProcess(
        { name, priority, memoryBlocksCount, cpu, tiempoTotal },
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

  const executeProcess = (processId) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if (p.id === processId || p.pid === processId) {
          if (p.estado === ESTADOS.NEW) {
            p.admitir();
          }
          if (p.estado === ESTADOS.READY) {
            p.ejecutar();
            setRunningProcessId(p.id);
            setQuantumRestante(quantum);
          }
          addLog({
            level: 'INFO',
            source: 'SCHEDULER',
            message: `Proceso PID ${p.pid} (${p.nombre}) en estado [${p.estado}].`,
          });
          return p;
        }
        return p;
      })
    );
  };

  const pauseProcess = (processId) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if ((p.id === processId || p.pid === processId) && (p.estado === ESTADOS.RUNNING || p.estado === ESTADOS.READY)) {
          p.pausar();
          if (runningProcessId === p.id) {
            setRunningProcessId(null);
          }
          addLog({
            level: 'INFO',
            source: 'SCHEDULER',
            message: `Proceso PID ${p.pid} (${p.nombre}) pausado -> [WAITING].`,
          });
          return p;
        }
        return p;
      })
    );
  };

  const resumeProcess = (processId) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if ((p.id === processId || p.pid === processId) && p.estado === ESTADOS.WAITING) {
          p.reanudar();
          addLog({
            level: 'INFO',
            source: 'SCHEDULER',
            message: `Proceso PID ${p.pid} (${p.nombre}) reanudado -> [READY].`,
          });
          return p;
        }
        return p;
      })
    );
  };

  const terminateProcess = (processId) => {
    try {
      // Pasa estrictamente por la syscall validando rol ADMIN y proceso de sistema
      const res = syscalls.terminateProcess(processId, authContext, processes);

      if (runningProcessId === res.process.id) {
        setRunningProcessId(null);
        setCurrentCpuUsage(0);
      }

      setProcesses((prev) =>
        prev.map((p) => (p.id === res.process.id ? res.process : p))
      );
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
      // Pasa estrictamente por syscall sys_free_memory
      const res = syscalls.freeMemory(blockId, authContext);
      setMemoryBlocks([...memoryManager.getBlocks()]);

      addLog({
        level: 'INFO',
        source: 'MEM_MANAGER',
        message: `sys_free_memory: Bloque #${blockId} liberado por ${user?.email || 'ADMIN'}.`,
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
    const existing = fileSystem[folder]?.find((f) => f.id === fileId);
    if (!existing) return;
    try {
      const path = `${folder}/${newName}`;
      syscalls.writeFile(path, existing.content || '', fileSystem, { permissions: existing.permissions }, authContext);
      setFileSystem({ ...fileSystem });
      addLog({
        level: 'INFO',
        source: 'VFS',
        message: `sys_write_file: Archivo renombrado a "${newName}".`,
      });
    } catch (err) {
      addLog({ level: 'ERROR', source: 'VFS', message: err.message });
    }
  };

  const deleteFile = (folder, fileId) => {
    const file = fileSystem[folder]?.find((f) => f.id === fileId);
    if (!file) return;

    setFileSystem((prev) => ({
      ...prev,
      [folder]: prev[folder].filter((f) => f.id !== fileId),
    }));

    addLog({
      level: 'WARN',
      source: 'VFS',
      message: `Archivo eliminado en ${folder}: "${file.name}".`,
    });

    syscalls.emitEvent({
      type: 'VFS_FILE_DELETED',
      source: 'VFS',
      severity: 'WARN',
      payload: { path: `${folder}/${file.name}` },
    });
  };

  const readFile = (path) => {
    return syscalls.readFile(path, fileSystem);
  };

  // ==========================================
  // 10. DISPOSITIVOS VÍA SYSCALLS
  // ==========================================
  const toggleDevice = (id) => {
    const t0 = performance.now();
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          let nextStatus = d.status;
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
            case 'climate':
              const nextTemp = d.temperature >= 24 ? 20.0 : +(d.temperature + 1.5).toFixed(1);
              nextStatus = `${nextTemp} °C`;
              return { ...d, status: nextStatus, temperature: nextTemp };
            default:
              nextStatus = d.status === 'ON' ? 'OFF' : 'ON';
          }

          try {
            syscalls.deviceWrite(id, nextStatus, [d], authContext);
          } catch (err) {
            addAlert({
              title: 'Operación Denegada',
              details: err.message,
              severity: 'warning',
            });
            return d;
          }

          addLog({
            level: 'INFO',
            source: 'IOT_MANAGER',
            message: `sys_device_write: "${d.name}" conmutado a: ${nextStatus}.`,
          });
          return { ...d, status: nextStatus };
        }
        return d;
      })
    );
    const latency = Math.max(1, Math.round(performance.now() - t0));
    setLocalLatencyMs(latency);
  };

  // ==========================================
  // 11. SIMULACIÓN DE FALLOS
  // ==========================================
  const simulateSensorDisconnected = () => {
    addAlert({
      title: 'Sensor Desconectado',
      details: 'El sensor de temperatura en Salón no responde en el bus I2C (Hardware Offline).',
      severity: 'warning',
    });

    setProcesses((prev) =>
      prev.map((p) => {
        if (p.nombre === 'temp_manager') {
          p.pausar();
          p.color = '#F59E0B';
          return p;
        }
        return p;
      })
    );

    addLog({
      level: 'ERROR',
      source: 'HARDWARE_BUS',
      message: '[FALLO DETECTADO] Dispositivo sensor_temp_01 desconectado físicamente del bus I2C.',
    });
  };

  const simulateCommLoss = () => {
    addAlert({
      title: 'Pérdida de Comunicación',
      details: 'Pérdida de enlace inalámbrico Zigbee con Cerradura Puerta Principal.',
      severity: 'error',
    });

    setDevices((prev) =>
      prev.map((d) => (d.id === 'd5' ? { ...d, status: 'OFFLINE' } : d))
    );

    addLog({
      level: 'ERROR',
      source: 'NETWORK_STACK',
      message: '[FALLO DETECTADO] Pérdida de paquetes en nodo Zigbee 0x4A1F (Cerradura Puerta Principal).',
    });
  };

  const simulateUnauthorizedAccess = () => {
    addAlert({
      title: 'Acceso No Autorizado',
      details: 'Detección de intento de apertura forzada o PIN erróneo en Entrada.',
      severity: 'critical',
    });

    setProcesses((prev) =>
      prev.map((p) => {
        if (p.nombre === 'surveillance_proc') {
          p.prioridad = 1;
          p.priority = 'Crítica';
          p.color = '#EF4444';
          if (p.estado === ESTADOS.READY || p.estado === ESTADOS.NEW) {
            p.ejecutar();
          }
          return p;
        }
        return p;
      })
    );

    setDevices((prev) =>
      prev.map((d) => (d.type === 'lock' ? { ...d, status: 'BLOQUEADA' } : d))
    );

    addLog({
      level: 'ERROR',
      source: 'SECURITY_CORE',
      message: '[FALLO DETECTADO] 3 intentos erróneos consecutivos en Cerradura Puerta Principal.',
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
