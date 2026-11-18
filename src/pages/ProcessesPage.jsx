import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { ALGORITMOS } from '../core';

export const ProcessesPage = () => {
  const {
    processes,
    freeBlocksCount,
    createProcess,
    executeProcess,
    pauseProcess,
    resumeProcess,
    terminateProcess,
    addLog,
    // Simulación CPU interactiva por ticks
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
  } = useSystem();

  const { role, checkPermission } = useAuth();

  // Estado del formulario de creación
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('Media');
  const [memoryBlocksCount, setMemoryBlocksCount] = useState(2);
  const [cpu, setCpu] = useState(15);
  const [tiempoTotal, setTiempoTotal] = useState(4);
  const [formFeedback, setFormFeedback] = useState(null);

  // Estados contados
  const stateCounts = processes.reduce((acc, p) => {
    const st = p.state || p.estado;
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  // ==========================================
  // MANEJADORES DE ACCIONES CON PERMISOS
  // ==========================================
  const handleCreateSubmit = (e) => {
    e.preventDefault();
    setFormFeedback(null);

    if (!checkPermission('ADMIN', 'Crear nuevo proceso en RobotOS', addLog)) {
      return;
    }

    if (!name.trim()) {
      setFormFeedback({ type: 'error', message: 'El nombre del proceso no puede estar vacío.' });
      return;
    }

    const res = createProcess({
      name,
      priority,
      memoryBlocksCount: Number(memoryBlocksCount),
      cpu: Number(cpu),
      tiempoTotal: Number(tiempoTotal) || 4,
    });

    if (res.success) {
      setFormFeedback({
        type: 'success',
        message: `Proceso "${res.process.nombre}" (PID ${res.process.pid}) creado en estado NEW con ${res.process.memoryBlocks} bloques y ${res.process.tiempoTotal} ticks de duración.`,
      });
      setName('');
      setMemoryBlocksCount(2);
      setCpu(15);
      setTiempoTotal(4);
    } else {
      setFormFeedback({
        type: 'error',
        message: 'No hay memoria suficiente para crear el proceso. Revisa la bandeja de alertas.',
      });
    }
  };

  const handleExecute = (proc) => {
    if (!checkPermission('USER', `Ejecutar proceso "${proc.name || proc.nombre}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    executeProcess(proc.id);
  };

  const handlePause = (proc) => {
    if (!checkPermission('USER', `Pausar proceso "${proc.name || proc.nombre}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    pauseProcess(proc.id);
  };

  const handleResume = (proc) => {
    if (!checkPermission('USER', `Reanudar proceso "${proc.name || proc.nombre}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    resumeProcess(proc.id);
  };

  const handleTerminate = (proc) => {
    if (proc.isSystem && role !== 'ADMIN') {
      checkPermission(
        'ADMIN',
        `Finalizar proceso crítico del sistema "${proc.name || proc.nombre}"`,
        () => {
          addLog({
            level: 'ERROR',
            source: 'SECURITY_GUARD',
            message: `[ACCESO DENEGADO] Intento de finalizar "${proc.name || proc.nombre}": proceso crítico (requiere rol ADMIN).`,
          });
        }
      );
      return;
    }

    if (!checkPermission('ADMIN', `Finalizar proceso "${proc.name || proc.nombre}" (PID ${proc.pid})`, addLog)) {
      return;
    }

    terminateProcess(proc.id);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Gestor de Procesos & CPU Scheduler</h2>
          <p className="text-xs text-slate-400">
            Motor de ejecución mononúcleo en tiempo real, colas de planificación y ciclo de vida de procesos.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="flex items-center space-x-2 text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>TICK KERNEL:</span>
            <span className="font-bold text-white">#{tickCount}</span>
          </div>

          <div className="flex items-center space-x-1.5 text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span>ROL:</span>
            <span className="font-bold text-white uppercase">{role}</span>
          </div>
        </div>
      </div>

      {/* 1. PANEL DE CONTROL DEL SCHEDULER Y SIMULACIÓN DE CPU */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>Consola del Planificador de CPU (Mononúcleo)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Ejecución discreta por ticks. Solo un proceso en estado <strong className="text-emerald-400">RUNNING</strong> a la vez.
            </p>
          </div>

          {/* Botones de Control de Simulación */}
          <div className="flex items-center space-x-2">
            {isPlaying ? (
              <button
                type="button"
                onClick={pauseSimulation}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs tracking-wide transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
              >
                <span>⏸</span>
                <span>Pausar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={playSimulation}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
              >
                <span>▶</span>
                <span>Iniciar</span>
              </button>
            )}

            <button
              type="button"
              onClick={stepTick}
              disabled={isPlaying}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all border ${
                isPlaying
                  ? 'bg-slate-950 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                  : 'bg-slate-950 text-cyan-300 border-cyan-800/60 hover:bg-cyan-950/40 hover:border-cyan-500 cursor-pointer shadow-sm'
              }`}
              title="Avanzar exactamente 1 tick de reloj"
            >
              ⏭ Paso a Paso (Tick)
            </button>

            <button
              type="button"
              onClick={resetSimulation}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 text-xs font-mono transition-all cursor-pointer"
              title="Reiniciar contador de ticks y línea de tiempo"
            >
              🔄 Reiniciar
            </button>
          </div>
        </div>

        {/* Configuración del Algoritmo, Quantum y Velocidad */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {/* Selector de Algoritmo */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-2">
              Algoritmo de Planificación
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAlgorithm(ALGORITMOS.PRIORIDAD)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                  algorithm === ALGORITMOS.PRIORIDAD
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-500 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Prioridad
              </button>
              <button
                type="button"
                onClick={() => setAlgorithm(ALGORITMOS.ROUND_ROBIN)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                  algorithm === ALGORITMOS.ROUND_ROBIN
                    ? 'bg-purple-950 text-purple-300 border-purple-500 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Round Robin
              </button>
            </div>
          </div>

          {/* Selector de Quantum (para Round Robin) */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-mono text-slate-400 uppercase">
                Quantum (Round Robin)
              </label>
              <span className="text-[10px] font-mono text-purple-400">
                Turno: {quantumRestante} / {quantum} ticks
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[2, 4, 8].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuantum(q)}
                  disabled={algorithm !== ALGORITMOS.ROUND_ROBIN}
                  className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
                    algorithm !== ALGORITMOS.ROUND_ROBIN
                      ? 'bg-slate-900/40 text-slate-600 border-slate-900 cursor-not-allowed'
                      : quantum === q
                      ? 'bg-purple-950 text-purple-300 border-purple-500'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {q} Ticks
                </button>
              ))}
            </div>
          </div>

          {/* Selector de Velocidad */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <label className="block text-[11px] font-mono text-slate-400 uppercase mb-2">
              Velocidad de Simulación
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 5].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSimulationSpeed(spd)}
                  className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
                    simulationSpeed === spd
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LÍNEA DE TIEMPO / DIAGRAMA DE GANTT TICK A TICK */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 uppercase text-[10px]">
              Línea de Tiempo de Ejecución (Últimos {timeline.length} Ticks)
            </span>
            <span className="text-slate-500 text-[10px]">
              Proceso actual en CPU:{' '}
              <strong className="text-emerald-400 font-bold">
                {processes.find((p) => p.id === runningProcessId || p.state === 'RUNNING')?.nombre || 'Ninguno (CPU Inactiva)'}
              </strong>
            </span>
          </div>

          <div className="h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center p-1 space-x-1 overflow-x-auto">
            {timeline.length === 0 ? (
              <span className="text-[11px] font-mono text-slate-600 px-3">
                Inicia la simulación o pulsa "Paso a Paso" para visualizar los ticks de CPU.
              </span>
            ) : (
              timeline.map((entry, idx) => (
                <div
                  key={`${entry.tick}_${idx}`}
                  className="h-full px-2 rounded flex flex-col justify-center items-center shrink-0 border border-cyan-500/40 bg-cyan-950/80 text-cyan-300 transition-all shadow-sm"
                  title={`Tick #${entry.tick}: PID ${entry.pid} [${entry.nombre}] (CPU: ${entry.cpu}%)`}
                >
                  <span className="text-[9px] font-mono font-bold leading-none truncate max-w-[80px]">
                    {entry.nombre}
                  </span>
                  <span className="text-[8px] font-mono text-cyan-400/80 leading-none mt-0.5">
                    t{entry.tick}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 2. CONTADORES DE ESTADOS DEL KERNEL */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-lg font-black text-white">{processes.length}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">Total Procesos</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-blue-900/40 text-center">
          <div className="text-lg font-black text-blue-400">{stateCounts.NEW || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">NEW</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-900/40 text-center">
          <div className="text-lg font-black text-amber-400">{stateCounts.READY || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">READY</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-900/40 text-center">
          <div className="text-lg font-black text-emerald-400">{stateCounts.RUNNING || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">RUNNING</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-orange-900/40 text-center">
          <div className="text-lg font-black text-orange-400">{stateCounts.WAITING || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">WAITING</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-lg font-black text-slate-500">{stateCounts.TERMINATED || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">TERMINATED</div>
        </div>
      </div>

      {/* 3. FORMULARIO PARA CREAR PROCESOS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Crear Nuevo Proceso de RobotOS</span>
            </h3>
            <p className="text-xs text-slate-400">
              Inicia en estado <span className="text-blue-400 font-mono font-bold">NEW</span> y reserva automáticamente bloques de memoria física.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-500">Memoria libre:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                freeBlocksCount > 5
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-red-950/60 text-red-400 border border-red-800/60'
              }`}
            >
              {freeBlocksCount} bloques ({freeBlocksCount * 16} MB)
            </span>
          </div>
        </div>

        {formFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-mono font-medium ${
              formFeedback.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border border-red-800 text-red-300'
            }`}
          >
            {formFeedback.message}
          </div>
        )}

        <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          {/* Nombre */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Nombre del Proceso
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. vacuum_planner, garden_irrigation"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* Prioridad */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Prioridad
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            >
              <option value="Baja">Baja (4)</option>
              <option value="Media">Media (3)</option>
              <option value="Alta">Alta (2)</option>
              <option value="Crítica">Crítica (1)</option>
            </select>
          </div>

          {/* Memoria */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Memoria: <span className="text-cyan-400 font-bold">{memoryBlocksCount * 16} MB</span>
            </label>
            <input
              type="number"
              min={1}
              max={64}
              value={memoryBlocksCount}
              onChange={(e) => setMemoryBlocksCount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* CPU Requerida */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              CPU: <span className="text-cyan-400 font-bold">{cpu}%</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* Duración en Ticks */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Duración: <span className="text-cyan-400 font-bold">{tiempoTotal} ticks</span>
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={tiempoTotal}
              onChange={(e) => setTiempoTotal(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* Botón de Envío */}
          <div className="lg:col-span-6 sm:col-span-2 flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-cyan-600/20 flex items-center space-x-2 cursor-pointer"
            >
              <span>+ Crear Proceso</span>
              {role !== 'ADMIN' && <span className="text-[10px] text-cyan-200">(Requiere ADMIN)</span>}
            </button>
          </div>
        </form>
      </div>

      {/* 4. TABLA DE PROCESOS CON ESTADOS FORMALES Y TIEMPO RESTANTE */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Tabla de Procesos del Kernel</h3>
            <p className="text-xs text-slate-400">
              Control individual de transiciones de estados, tiempo restante de CPU y liberación de memoria.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Total activos:{' '}
            <strong className="text-white">
              {processes.filter((p) => (p.state || p.estado) !== 'TERMINATED').length}
            </strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">PID</th>
                <th className="py-3 px-3">Nombre</th>
                <th className="py-3 px-3">Prioridad</th>
                <th className="py-3 px-3">Estado</th>
                <th className="py-3 px-3">CPU</th>
                <th className="py-3 px-3">Progreso (Ticks)</th>
                <th className="py-3 px-3">Memoria</th>
                <th className="py-3 px-3 text-center">Acciones de Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {processes.map((proc) => {
                const estado = proc.state || proc.estado;
                const nombre = proc.name || proc.nombre;
                const isTerminated = estado === 'TERMINATED';
                const canExecute = estado === 'NEW' || estado === 'READY';
                const canPause = estado === 'RUNNING';
                const canResume = estado === 'WAITING';
                const canTerminate = !isTerminated;

                return (
                  <tr key={proc.id} className="hover:bg-slate-950/40 transition-colors">
                    {/* PID */}
                    <td className="py-3 px-3 font-bold text-slate-300">#{proc.pid}</td>

                    {/* Nombre y Tag de Sistema */}
                    <td className="py-3 px-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white">{nombre}</span>
                        {proc.isSystem && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            Sistema
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">{proc.description}</div>
                    </td>

                    {/* Prioridad */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          proc.priority === 'Crítica' || proc.prioridad === 1
                            ? 'bg-red-950 text-red-400 border border-red-800/80 animate-pulse'
                            : proc.priority === 'Alta' || proc.prioridad === 2
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                            : proc.priority === 'Media' || proc.prioridad === 3
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {proc.priority || (proc.prioridad === 1 ? 'Crítica' : 'Normal')} ({proc.prioridad || 3})
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                          estado === 'RUNNING'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80 animate-pulse'
                            : estado === 'WAITING'
                            ? 'bg-orange-950 text-orange-400 border border-orange-800/80'
                            : estado === 'READY'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/80'
                            : estado === 'NEW'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/80'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {estado}
                      </span>
                    </td>

                    {/* CPU */}
                    <td className="py-3 px-3 text-slate-300">
                      {isTerminated ? '0%' : `${proc.cpu || proc.cpuRequerida}%`}
                    </td>

                    {/* Progreso en Ticks */}
                    <td className="py-3 px-3">
                      {isTerminated ? (
                        <span className="text-slate-500 text-[11px]">Completado</span>
                      ) : (
                        <div className="text-slate-300 text-[11px]">
                          <span className="text-cyan-400 font-bold">{proc.tiempoRestante ?? proc.tiempoTotal}</span>
                          <span className="text-slate-500"> / {proc.tiempoTotal} ticks</span>
                        </div>
                      )}
                    </td>

                    {/* Memoria */}
                    <td className="py-3 px-3">
                      {isTerminated ? (
                        <span className="text-slate-500">Liberada</span>
                      ) : (
                        <div className="text-slate-300">
                          <span className="text-cyan-400 font-bold">{proc.memoryBlocks || 1} blq</span>
                          <span className="text-slate-500 text-[10px] ml-1">
                            ({proc.memory || proc.memoriaRequerida || proc.memoryBlocks * 16} MB)
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Botones de Acción */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center space-x-1.5">
                        {/* Ejecutar */}
                        <button
                          type="button"
                          onClick={() => handleExecute(proc)}
                          disabled={!canExecute}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canExecute
                              ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canExecute ? 'Poner en ejecución (RUNNING)' : 'No aplica al estado actual'}
                        >
                          ▶ Ejecutar
                        </button>

                        {/* Pausar */}
                        <button
                          type="button"
                          onClick={() => handlePause(proc)}
                          disabled={!canPause}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canPause
                              ? 'bg-orange-950/80 hover:bg-orange-900 text-orange-300 border border-orange-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canPause ? 'Pausar proceso (WAITING)' : 'No aplica al estado actual'}
                        >
                          ⏸ Pausar
                        </button>

                        {/* Reanudar */}
                        <button
                          type="button"
                          onClick={() => handleResume(proc)}
                          disabled={!canResume}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canResume
                              ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canResume ? 'Reanudar proceso (READY)' : 'No aplica al estado actual'}
                        >
                          🔄 Reanudar
                        </button>

                        {/* Finalizar */}
                        <button
                          type="button"
                          onClick={() => handleTerminate(proc)}
                          disabled={!canTerminate}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canTerminate
                              ? 'bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={
                            !canTerminate
                              ? 'El proceso ya está finalizado'
                              : proc.isSystem && role !== 'ADMIN'
                              ? 'Proceso crítico: requiere ADMIN'
                              : 'Finalizar y liberar memoria'
                          }
                        >
                          ⏹ Finalizar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
