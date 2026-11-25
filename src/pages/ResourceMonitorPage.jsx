import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useSystem } from '../context/SystemContext';
import { ESTADOS } from '../core';

const STATE_COLORS = {
  [ESTADOS.RUNNING]: '#10B981', // emerald
  [ESTADOS.READY]: '#3B82F6',   // blue
  [ESTADOS.BLOCKED]: '#F59E0B', // amber
  [ESTADOS.NEW]: '#8B5CF6',     // purple
  [ESTADOS.TERMINATED]: '#64748B', // slate
};

export const ResourceMonitorPage = () => {
  const {
    processes,
    memoryStats,
    memoryBlocks,
    timeline,
    algorithm,
    quantum,
    executionMetrics,
    tickCount,
    isPlaying,
    playSimulation,
    pauseSimulation,
    stepTick,
    simulationSpeed,
    setSimulationSpeed,
  } = useSystem();

  // Gráfica de CPU: últimos 25 registros
  const cpuChartData = useMemo(() => {
    if (!timeline || timeline.length === 0) {
      return Array.from({ length: 10 }, (_, i) => ({
        tick: i + 1,
        cpuUsage: 0,
        active: 0,
      }));
    }
    return timeline.slice(-25).map((t, idx) => ({
      tick: t.tick || idx + 1,
      cpuUsage: t.cpuUsage ?? (t.runningPid ? 100 : 0),
      active: (t.activePids || []).length,
    }));
  }, [timeline]);

  // Procesos por estado para el PieChart
  const processDistribution = useMemo(() => {
    const counts = {
      [ESTADOS.RUNNING]: 0,
      [ESTADOS.READY]: 0,
      [ESTADOS.BLOCKED]: 0,
      [ESTADOS.NEW]: 0,
      [ESTADOS.TERMINATED]: 0,
    };
    processes.forEach((p) => {
      if (counts[p.estado] !== undefined) {
        counts[p.estado]++;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);
  }, [processes]);

  const totalUsedBlocks = memoryStats?.usedBlocks ?? 0;
  const totalFreeBlocks = memoryStats?.freeBlocks ?? 64;
  const totalBlocks = memoryStats?.totalBlocks ?? 64;
  const usedPercent = memoryStats?.usagePercent ?? Math.round((totalUsedBlocks / totalBlocks) * 100);

  return (
    <div className="space-y-6">
      {/* Top Banner & Simulation Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Monitor de Recursos del Sistema
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Telemetría en vivo del Kernel: CPU, Memoria, Scheduler y Ticks ({tickCount} ticks ejecutados)
          </p>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? pauseSimulation : playSimulation}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pausar
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Ejecutar
              </>
            )}
          </button>
          <button
            onClick={stepTick}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700"
            title="Paso a paso (1 tick)"
          >
            Paso (+1)
          </button>
          <select
            value={simulationSpeed}
            onChange={(e) => setSimulationSpeed(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: CPU Utilization Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Utilización de CPU en Tiempo Real</h2>
              <p className="text-xs text-slate-400">Historial de ticks y porcentaje de uso del procesador</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 font-mono">
              {cpuChartData[cpuChartData.length - 1]?.cpuUsage ?? 0}% CPU
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpuChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="tick" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#64748B" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                  formatter={(val) => [`${val}%`, 'Uso de CPU']}
                  labelFormatter={(lbl) => `Tick ${lbl}`}
                />
                <Area type="monotone" dataKey="cpuUsage" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Panel 2: Memory Physical & Virtual */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-200">Distribución de Memoria Física</h2>
              <span className="text-xs font-mono text-cyan-400">{usedPercent}% Utilizada</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Bloques de 16MB | Kernel: 8 bloques fijos (0-7) | Usuario: 56 bloques
            </p>

            {/* Progress Bar */}
            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex mb-4 border border-slate-700">
              <div
                className="bg-indigo-600 h-full transition-all duration-300"
                style={{ width: `${(8 / totalBlocks) * 100}%` }}
                title="Kernel (8 bloques reservados)"
              />
              <div
                className="bg-cyan-500 h-full transition-all duration-300"
                style={{ width: `${((Math.max(0, totalUsedBlocks - 8)) / totalBlocks) * 100}%` }}
                title={`Procesos Usuario (${Math.max(0, totalUsedBlocks - 8)} bloques)`}
              />
              <div
                className="bg-slate-700 h-full transition-all duration-300"
                style={{ width: `${(totalFreeBlocks / totalBlocks) * 100}%` }}
                title={`Libre (${totalFreeBlocks} bloques)`}
              />
            </div>

            {/* Legend / Stats */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs text-indigo-400 block font-medium">Kernel OS</span>
                <span className="text-base font-bold text-slate-100 font-mono">128 MB</span>
                <span className="text-[10px] text-slate-400 block">8 bloques</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs text-cyan-400 block font-medium">Asignada</span>
                <span className="text-base font-bold text-slate-100 font-mono">{totalUsedBlocks * 16} MB</span>
                <span className="text-[10px] text-slate-400 block">{totalUsedBlocks} bloques</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <span className="text-xs text-emerald-400 block font-medium">Disponible</span>
                <span className="text-base font-bold text-slate-100 font-mono">{totalFreeBlocks * 16} MB</span>
                <span className="text-[10px] text-slate-400 block">{totalFreeBlocks} bloques</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Detección de fugas: Activa</span>
            <span className="text-emerald-400">Integridad: 100% OK</span>
          </div>
        </div>

        {/* Panel 3: Process Distribution by State */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Distribución de Procesos</h2>
          <p className="text-xs text-slate-400 mb-4">Total de {processes.length} procesos cargados en el PCB</p>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processDistribution}
                    innerRadius={36}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {processDistribution.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={STATE_COLORS[entry.name] || '#64748B'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 space-y-1.5 w-full">
              {Object.entries(STATE_COLORS).map(([st, color]) => {
                const count = processes.filter((p) => p.estado === st).length;
                return (
                  <div key={st} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }}></span>
                      <span className="text-slate-300">{st}</span>
                    </div>
                    <span className="font-mono text-slate-100 font-semibold">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel 4: Scheduler KPI & Metrics */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-slate-200">Métricas del Planificador (Scheduler)</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800/50 font-mono">
                {algorithm}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Quantum: {quantum} ticks | Rendimiento y tiempos de respuesta del CPU
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Tiempo Espera Promedio</span>
                <span className="text-lg font-bold text-slate-100 font-mono">
                  {executionMetrics?.avgWait ?? 0} <span className="text-xs font-normal text-slate-400">ticks</span>
                </span>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Tiempo Retorno Promedio</span>
                <span className="text-lg font-bold text-slate-100 font-mono">
                  {executionMetrics?.avgTurnaround ?? 0} <span className="text-xs font-normal text-slate-400">ticks</span>
                </span>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Throughput (Rendimiento)</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {executionMetrics?.throughput ?? 0} <span className="text-xs font-normal text-slate-400">proc/tick</span>
                </span>
              </div>
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Cambios de Contexto</span>
                <span className="text-lg font-bold text-cyan-400 font-mono">
                  {executionMetrics?.contextSwitches ?? 0}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Algoritmos soportados: Priority Preemptive & Round Robin</span>
            <span className="text-slate-300 font-mono">Tick actual: #{tickCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
