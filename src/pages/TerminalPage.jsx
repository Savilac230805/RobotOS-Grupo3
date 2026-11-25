import React, { useState, useRef, useEffect } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { ALGORITMOS, kernelClock } from '../core';

export const TerminalPage = ({ onNavigate }) => {
  const {
    processes,
    createProcess,
    terminateProcess,
    devices,
    executeDeviceAction,
    memoryStats,
    memoryBlocks,
    algorithm,
    setAlgorithm,
    quantum,
    setQuantum,
    executionMetrics,
    tickCount,
    addLog,
  } = useSystem();

  const { role } = useAuth();

  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState([
    { text: '=======================================================', color: 'cyan' },
    { text: '  RobotOS Kernel Shell (v1.0.0-fase06)', color: 'green' },
    { text: '  Conectado a Syscalls y Event Engine en tiempo real.', color: 'gray' },
    { text: '  Escriba "help" para ver la lista de comandos disponibles.', color: 'yellow' },
    { text: '=======================================================', color: 'cyan' },
  ]);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCommand = async (cmdStr) => {
    const rawCmd = cmdStr.trim();
    if (!rawCmd) return;

    // Agregar al historial de comandos
    setCmdHistory((prev) => [...prev, rawCmd]);
    setHistoryIndex(-1);

    // Eco del comando
    setHistory((prev) => [
      ...prev,
      { text: `robotos@smarthouse:~$ ${rawCmd}`, color: 'white' },
    ]);

    addLog({
      level: 'INFO',
      source: 'TERMINAL',
      message: `Comando ejecutado: "${rawCmd}" por rol ${role}`,
    });

    const parts = rawCmd.split(/\s+/);
    const main = parts[0].toLowerCase();
    const sub = parts[1]?.toLowerCase();
    const args = parts.slice(2);

    const out = (text, color = 'gray') => {
      setHistory((prev) => [...prev, { text, color }]);
    };

    switch (main) {
      case 'help':
        out('--- COMANDOS DISPONIBLES EN ROBOTOS ---', 'cyan');
        out('  process list                      - Lista los procesos y sus estados', 'green');
        out('  process start <nombre> [prio]     - Crea un proceso (prioridad 1-10)', 'green');
        out('  process terminate <pid>           - Finaliza un proceso por PID', 'green');
        out('  device list                       - Muestra dispositivos domóticos', 'green');
        out('  device status <id>                - Estado detallado de un dispositivo', 'green');
        out('  device toggle <id>                - Alterna estado (ON/OFF o BLOQUEADA)', 'green');
        out('  memory status                     - Estadísticas de memoria física y virtual', 'green');
        out('  memory map                        - Mapa visual en ASCII de bloques de memoria', 'green');
        out('  scheduler status                  - Algoritmo actual, quantum y métricas', 'green');
        out('  scheduler set priority            - Cambia scheduler a Priority Preemptive', 'green');
        out('  scheduler set rr [quantum]        - Cambia scheduler a Round Robin', 'green');
        out('  clock                             - Muestra ticks del Kernel Clock', 'green');
        out('  whoami                            - Rol actual y contexto de seguridad', 'green');
        out('  clear                             - Limpia la pantalla de la terminal', 'green');
        out('  desktop                           - Ir al escritorio principal', 'green');
        out('  exit                              - Volver al Centro de Control', 'green');
        break;

      case 'clear':
        setHistory([]);
        break;

      case 'whoami':
        out(`Usuario actual: Rol ${role}`, 'yellow');
        out(`Sandbox status: ACTIVO (origin='sandbox')`, 'gray');
        break;

      case 'clock':
        out(`Kernel Clock: ${tickCount} ticks ejecutados (Hardware Clock: ${kernelClock.ticks})`, 'cyan');
        break;

      case 'process':
        if (sub === 'list') {
          out('PID   | NOMBRE                | ESTADO      | PRIO | MEMORIA', 'cyan');
          out('------+-----------------------+-------------+------+--------', 'gray');
          processes.forEach((p) => {
            const mem = Array.isArray(p.bloquesAsignados) ? `${p.bloquesAsignados.length} blk` : `${p.bloquesMemoria || 2} blk`;
            out(
              `${String(p.pid).padEnd(5)} | ${String(p.nombre).padEnd(21)} | ${String(p.estado).padEnd(11)} | ${String(p.prioridad).padEnd(4)} | ${mem}`,
              p.estado === 'RUNNING' ? 'green' : p.estado === 'TERMINATED' ? 'gray' : 'white'
            );
          });
        } else if (sub === 'start') {
          const rawName = args[0] || parts[2];
          const prio = parseInt(args[1] || parts[3] || '5', 10);
          if (!rawName || !rawName.trim()) {
            out('Error: Debe especificar el nombre del proceso. Ej: process start Backup 6', 'red');
          } else {
            try {
              const res = createProcess({
                name: rawName.trim(),
                nombre: rawName.trim(),
                priority: isNaN(prio) ? 5 : prio,
                prioridad: isNaN(prio) ? 5 : prio,
                memoryBlocksCount: 2,
                bloquesMemoria: 2,
                tiempoTotal: 4,
              });
              if (res && res.success === false) {
                out(`[SYSCALL ERROR] ${res.reason}`, 'red');
              } else {
                out(`[SYSCALL] Proceso "${rawName.trim()}" creado exitosamente (PID ${res?.process?.pid || 'NEW'}).`, 'green');
              }
            } catch (err) {
              out(`[SYSCALL ERROR] ${err.message}`, 'red');
            }
          }
        } else if (sub === 'terminate') {
          const pid = args[0] || parts[2];
          if (!pid) {
            out('Error: Debe especificar el PID. Ej: process terminate 101', 'red');
          } else {
            try {
              terminateProcess(pid);
              out(`[SYSCALL] Solicitud de terminación enviada para PID ${pid}.`, 'green');
            } catch (err) {
              out(`[SYSCALL ERROR] ${err.message}`, 'red');
            }
          }
        } else {
          out('Subcomando desconocido. Use: process list | process start <nombre> | process terminate <pid>', 'red');
        }
        break;

      case 'device':
        if (sub === 'list') {
          out('ID             | TIPO         | ZONA        | ESTADO', 'cyan');
          out('---------------+--------------+-------------+-------------', 'gray');
          devices.forEach((d) => {
            out(
              `${String(d.id).padEnd(14)} | ${String(d.type).padEnd(12)} | ${String(d.zone).padEnd(11)} | ${d.status}`,
              d.status === 'ON' || d.status === 'ABIERTA' || d.status === 'DESBLOQUEADA' ? 'green' : 'yellow'
            );
          });
        } else if (sub === 'status') {
          const devId = args[0] || parts[2];
          const dev = devices.find((d) => d.id === devId);
          if (!dev) {
            out(`Dispositivo "${devId}" no encontrado. Use "device list" para ver IDs.`, 'red');
          } else {
            out(`Dispositivo: ${dev.name} (${dev.id})`, 'cyan');
            out(`  Tipo:      ${dev.type}`, 'white');
            out(`  Zona:      ${dev.zone}`, 'white');
            out(`  Estado:    ${dev.status}`, 'yellow');
            if (dev.metrics) {
              out(`  Métricas:  ${JSON.stringify(dev.metrics)}`, 'gray');
            }
          }
        } else if (sub === 'toggle') {
          const devId = args[0] || parts[2];
          const dev = devices.find((d) => d.id === devId);
          if (!dev) {
            out(`Dispositivo "${devId}" no encontrado.`, 'red');
          } else {
            try {
              let nextAction = 'TOGGLE';
              if (dev.type === 'light') nextAction = dev.status === 'ON' ? 'TURN_OFF' : 'TURN_ON';
              else if (dev.type === 'lock') nextAction = dev.status === 'BLOQUEADA' ? 'UNLOCK' : 'LOCK';
              else if (dev.type === 'camera') nextAction = dev.status === 'TRANSMITIENDO' ? 'STOP_RECORDING' : 'RECORD';
              else nextAction = dev.status === 'ACTIVE' ? 'TURN_OFF' : 'TURN_ON';

              await executeDeviceAction(dev.id, nextAction);
              out(`[SYSCALL sys_access_device] Acción ${nextAction} ejecutada en ${dev.id}.`, 'green');
            } catch (err) {
              out(`[DRIVER ERROR] ${err.message}`, 'red');
            }
          }
        } else {
          out('Subcomando desconocido. Use: device list | device status <id> | device toggle <id>', 'red');
        }
        break;

      case 'memory':
        if (sub === 'status') {
          const stats = memoryStats || {};
          out('--- ESTADO DE MEMORIA FÍSICA ---', 'cyan');
          out(`  Total Bloques:    ${stats.totalBlocks ?? 64} (1024 MB)`, 'white');
          out(`  Bloques Usados:   ${stats.usedBlocks ?? 0}`, 'yellow');
          out(`  Bloques Libres:   ${stats.freeBlocks ?? 64}`, 'green');
          out(`  Porcentaje Uso:   ${stats.usagePercent ?? 0}%`, 'cyan');
          out(`  Bloques Kernel:   8 reservados (0-7)`, 'gray');
        } else if (sub === 'map') {
          out('--- MAPA DE BLOQUES (K:Kernel, U:Usado, .:Libre) ---', 'cyan');
          const blocks = memoryBlocks || [];
          let row = '';
          for (let i = 0; i < Math.min(blocks.length, 64); i++) {
            const b = blocks[i];
            let char = '.';
            if (i < 8) char = 'K';
            else if (b?.ocupado || b?.allocated) char = 'U';
            row += char;
            if ((i + 1) % 16 === 0) {
              out(`  [${String(i - 15).padStart(2, '0')}-${String(i).padStart(2, '0')}]: ${row}`, 'green');
              row = '';
            }
          }
        } else {
          out('Subcomando desconocido. Use: memory status | memory map', 'red');
        }
        break;

      case 'scheduler':
        if (sub === 'status') {
          out('--- SCHEDULER METRICS ---', 'cyan');
          out(`  Algoritmo Actual:       ${algorithm}`, 'yellow');
          out(`  Quantum Round Robin:    ${quantum} ticks`, 'white');
          out(`  Tiempo Retorno Prom:    ${executionMetrics?.avgTurnaround ?? 0} ticks`, 'gray');
          out(`  Tiempo Espera Prom:     ${executionMetrics?.avgWait ?? 0} ticks`, 'gray');
          out(`  Throughput:             ${executionMetrics?.throughput ?? 0} proc/tick`, 'gray');
          out(`  Cambios de Contexto:    ${executionMetrics?.contextSwitches ?? 0}`, 'gray');
        } else if (sub === 'set') {
          const targetAlgo = args[0] || parts[2];
          if (targetAlgo === 'priority') {
            setAlgorithm(ALGORITMOS.PRIORIDAD || ALGORITMOS.PRIORITY || 'PRIORIDAD');
            out('[SCHEDULER] Algoritmo cambiado a PRIORITY PREEMPTIVE.', 'green');
          } else if (targetAlgo === 'rr' || targetAlgo === 'round_robin') {
            const q = parseInt(args[1] || parts[3] || '4', 10);
            setAlgorithm(ALGORITMOS.ROUND_ROBIN);
            if (!isNaN(q) && q > 0) setQuantum(q);
            out(`[SCHEDULER] Algoritmo cambiado a ROUND ROBIN (Quantum: ${q || quantum}).`, 'green');
          } else {
            out('Algoritmo no válido. Use: scheduler set priority | scheduler set rr [quantum]', 'red');
          }
        } else {
          out('Subcomando desconocido. Use: scheduler status | scheduler set priority | scheduler set rr', 'red');
        }
        break;

      case 'desktop':
        if (onNavigate) onNavigate('desktop');
        break;

      case 'exit':
        if (onNavigate) onNavigate('overview');
        break;

      default:
        out(`Comando no reconocido: "${rawCmd}". Escriba "help" para ver la lista de comandos.`, 'red');
        break;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommand(inputVal);
      setInputVal('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const nextIndex = historyIndex === -1 ? cmdHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputVal(cmdHistory[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdHistory.length === 0 || historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= cmdHistory.length) {
        setHistoryIndex(-1);
        setInputVal('');
      } else {
        setHistoryIndex(nextIndex);
        setInputVal(cmdHistory[nextIndex] || '');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const commands = ['help', 'clear', 'process list', 'process start ', 'process terminate ', 'device list', 'device status ', 'memory status', 'memory map', 'scheduler status', 'scheduler set priority', 'scheduler set rr', 'clock', 'whoami', 'exit', 'desktop'];
      const match = commands.find((c) => c.startsWith(inputVal.trim()));
      if (match) setInputVal(match);
    }
  };

  const getColorClass = (color) => {
    switch (color) {
      case 'green': return 'text-emerald-400';
      case 'cyan': return 'text-cyan-400';
      case 'yellow': return 'text-amber-300';
      case 'red': return 'text-rose-400';
      case 'white': return 'text-slate-100';
      case 'gray':
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-black rounded-xl border border-slate-800 shadow-2xl overflow-hidden font-mono">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 select-none">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-rose-500"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-xs text-slate-400 font-semibold ml-2">
            RobotOS Terminal Shell — TTY1 (Kernel Clock: {tickCount} ticks)
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-400">
            Rol: {role}
          </span>
          <button
            onClick={() => setHistory([])}
            className="hover:text-slate-200 transition-colors"
            title="Limpiar pantalla"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        className="flex-1 p-4 overflow-y-auto space-y-1 text-xs md:text-sm"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((line, idx) => (
          <div key={idx} className={`${getColorClass(line.color)} whitespace-pre-wrap leading-relaxed`}>
            {line.text}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      {/* Command Input Prompt */}
      <div className="flex items-center px-4 py-3 bg-slate-950 border-t border-slate-800">
        <span className="text-emerald-400 font-bold mr-2 text-xs md:text-sm select-none">
          robotos@smarthouse:~$
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escriba un comando (ej: help, process list)..."
          className="flex-1 bg-transparent text-slate-100 outline-none text-xs md:text-sm font-mono placeholder:text-slate-600"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <span className="text-xs text-slate-500 hidden sm:inline ml-2">
          [Tab: autocompletar | ↑/↓: historial]
        </span>
      </div>
    </div>
  );
};
