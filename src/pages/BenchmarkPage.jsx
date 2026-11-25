import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useSystem } from '../context/SystemContext';
import { BenchmarkSuite } from '../core/benchmarkSuite';

export const BenchmarkPage = () => {
  const { supabaseAdapter, addLog } = useSystem();

  const [seed, setSeed] = useState(777);
  const [workloadSize, setWorkloadSize] = useState(6);
  const [benchmarkData, setBenchmarkData] = useState(() => {
    const workload = BenchmarkSuite.generateWorkload(777, 6);
    return {
      workload,
      scheduler: BenchmarkSuite.runSchedulerBenchmark(workload),
      vm: BenchmarkSuite.runVirtualMemoryBenchmark(777),
    };
  });
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistMsg, setPersistMsg] = useState(null);

  const handleRunBenchmark = async () => {
    const workload = BenchmarkSuite.generateWorkload(Number(seed), Number(workloadSize));
    const schedRes = BenchmarkSuite.runSchedulerBenchmark(workload);
    const vmRes = BenchmarkSuite.runVirtualMemoryBenchmark(Number(seed));

    const newData = {
      workload,
      scheduler: schedRes,
      vm: vmRes,
    };
    setBenchmarkData(newData);
    setPersistMsg(null);

    addLog({
      level: 'INFO',
      source: 'BENCHMARK',
      message: `Benchmark ejecutado con Seed #${seed} (${workloadSize} procesos). ${schedRes.analysis}`,
    });

    // Persistir en Supabase en benchmark_runs y benchmark_results
    if (supabaseAdapter && typeof supabaseAdapter.saveBenchmarkRun === 'function') {
      setIsPersisting(true);
      try {
        await supabaseAdapter.saveBenchmarkRun({
          seed: Number(seed),
          workloadSize: Number(workloadSize),
          schedulerResults: schedRes.results,
          vmResults: { fifo: vmRes.fifo, lru: vmRes.lru },
          analysis: schedRes.analysis,
        });
        setPersistMsg('✅ Benchmark persistido con éxito en benchmark_runs y benchmark_results de Supabase.');
      } catch (err) {
        setPersistMsg(`⚠️ Error persistiendo en Supabase: ${err.message}`);
      } finally {
        setIsPersisting(false);
      }
    }
  };

  const handleExportJSON = () => {
    const jsonStr = BenchmarkSuite.exportToJSON({
      seed,
      workloadSize,
      timestamp: new Date().toISOString(),
      results: benchmarkData.scheduler.results,
      virtualMemory: benchmarkData.vm,
      analysis: benchmarkData.scheduler.analysis,
    });
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robotos_benchmark_seed_${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csvStr = BenchmarkSuite.exportToCSV(benchmarkData.scheduler.results);
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robotos_benchmark_seed_${seed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const schedResults = benchmarkData?.scheduler?.results || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span className="text-indigo-400">📊</span>
          Centro de Benchmarking y Evaluación Comparativa (Fase 10)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Comparaciones científicas reproducibles de Planificación de CPU y Paginación Virtual con métricas empíricas 100% reales
        </p>
      </div>

      {/* Control Bar: Seed & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">Seed:</span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-24 bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded font-mono outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono">Carga (Procesos):</span>
            <select
              value={workloadSize}
              onChange={(e) => setWorkloadSize(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded font-mono outline-none"
            >
              <option value={4}>4 procesos</option>
              <option value={6}>6 procesos</option>
              <option value={8}>8 procesos</option>
              <option value={12}>12 procesos</option>
            </select>
          </div>
          <button
            onClick={handleRunBenchmark}
            disabled={isPersisting}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>▶</span> {isPersisting ? 'Ejecutando y Sincronizando...' : 'Ejecutar Benchmark'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-semibold transition-colors"
          >
            Exportar CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-semibold transition-colors"
          >
            Exportar JSON
          </button>
        </div>
      </div>

      {persistMsg && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300">
          {persistMsg}
        </div>
      )}

      {/* Grid: Comparativas de CPU Scheduler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Tiempo de Espera y Retorno */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Tiempos Promedio: Espera vs Retorno</h2>
          <p className="text-xs text-slate-400 mb-4">Medidos en ticks de reloj de ejecución</p>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={schedResults} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="avgWait" name="Espera (Wait)" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgTurnaround" name="Retorno (Turnaround)" fill="#818CF8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Throughput y Cambios de Contexto */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-200 mb-1">Sobrecarga: Cambios de Contexto & Throughput</h2>
          <p className="text-xs text-slate-400 mb-4">Eficiencia del procesador y densidad de despacho</p>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={schedResults} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="contextSwitches" name="Cambios de Contexto" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cpuUsage" name="% CPU Requerido" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabla Comparativa Detallada */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Tabla de Métricas y Ranking Comparativo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Algoritmo</th>
                <th className="py-2.5 px-3">Espera Prom.</th>
                <th className="py-2.5 px-3">Retorno Prom.</th>
                <th className="py-2.5 px-3">Throughput</th>
                <th className="py-2.5 px-3">Cambios Contexto</th>
                <th className="py-2.5 px-3">Uso CPU</th>
                <th className="py-2.5 px-3">Ticks Totales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {schedResults.map((row, idx) => (
                <tr key={row.name} className="hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-bold text-slate-100 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] flex items-center justify-center font-bold text-slate-400">
                      {idx + 1}
                    </span>
                    <span>{row.name}</span>
                  </td>
                  <td className="py-2.5 px-3 text-cyan-400 font-semibold">{row.avgWait} ticks</td>
                  <td className="py-2.5 px-3">{row.avgTurnaround} ticks</td>
                  <td className="py-2.5 px-3 text-emerald-400 font-semibold">{row.throughput} proc/t</td>
                  <td className="py-2.5 px-3 text-rose-400">{row.contextSwitches}</td>
                  <td className="py-2.5 px-3">{row.cpuUsage}%</td>
                  <td className="py-2.5 px-3">{row.totalTicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Análisis Automático en Lenguaje Natural */}
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 uppercase tracking-wider">
            <span>🧠</span>
            <span>Análisis Automático Generado (Cálculos 100% Empíricos)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {benchmarkData?.scheduler?.analysis}
          </p>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {benchmarkData?.vm?.analysis}
          </p>
        </div>
      </div>
    </div>
  );
};
