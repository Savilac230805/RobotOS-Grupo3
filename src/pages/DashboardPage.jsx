import React from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

export const DashboardPage = ({ onNavigate }) => {
  const { metrics, processes, devices, activeAlertsCount, persistenceSync } = useSystem();
  const { user, role } = useAuth();

  const totalProcesses = processes?.length || 0;
  const runningProcesses = processes?.filter((p) => p.estado === 'RUNNING' || p.estado === 'running').length || 0;
  const readyProcesses = processes?.filter((p) => p.estado === 'READY' || p.estado === 'ready').length || 0;

  const totalDevices = devices?.length || 0;
  const onlineDevices = devices?.filter((d) => d.status === 'ONLINE' || d.status === 'online').length || 0;
  const offlineDevices = totalDevices - onlineDevices;

  const memPercent = Math.round((metrics.ramUsageMB / metrics.ramTotalMB) * 100);
  const isHealthy = metrics.robotStatus === 'OPERATIVO';

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard Principal</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase">
              Centro de Operaciones
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Supervisión integral de recursos, procesos del kernel y domótica en tiempo real
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className={`px-3 py-1.5 rounded-xl border flex items-center space-x-2 text-xs font-mono font-medium ${
            isHealthy
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
              : 'bg-red-950/40 border-red-800 text-red-400 animate-pulse'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
            <span>ESTADO: {metrics.robotStatus}</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
            <span>ROL: </span>
            <span className={`font-bold ${
              role === 'ADMIN' ? 'text-purple-400' : role === 'USER' ? 'text-cyan-400' : 'text-amber-400'
            }`}>
              {role}
            </span>
          </div>
        </div>
      </div>

      {/* Tarjetas KPI de Estado Principal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: CPU */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>USO DE CPU</span>
            <span className="text-cyan-400 font-bold">{metrics.cpuUsage}%</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics.cpuUsage}%
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                metrics.cpuUsage > 80 ? 'bg-red-500' : metrics.cpuUsage > 50 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(5, metrics.cpuUsage))}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>Potencia: {metrics.powerDrawWatts}W</span>
            <span>Batería: {metrics.batteryPercent}%</span>
          </div>
        </div>

        {/* KPI: Memoria */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>MEMORIA RAM</span>
            <span className="text-indigo-400 font-bold">{memPercent}%</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {metrics.ramUsageMB} <span className="text-xs text-slate-500 font-normal">/ {metrics.ramTotalMB} MB</span>
          </div>
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-300 ${
                memPercent > 80 ? 'bg-red-500' : memPercent > 60 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${memPercent}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>Libre: {metrics.ramTotalMB - metrics.ramUsageMB} MB</span>
            <span>Bloques: 16 MB c/u</span>
          </div>
        </div>

        {/* KPI: Procesos */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>PROCESOS DEL KERNEL</span>
            <span className="text-emerald-400 font-bold">{runningProcesses} RUN</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {totalProcesses} <span className="text-xs text-slate-500 font-normal">totales</span>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
              {runningProcesses} Running
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
              {readyProcesses} Ready
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Scheduler activo: Round Robin / Prioridad
          </div>
        </div>

        {/* KPI: Dispositivos & Latencia */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>DISPOSITIVOS & RED</span>
            <span className="text-amber-400 font-bold">{metrics.localLatencyMs || 5} ms</span>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {onlineDevices} <span className="text-xs text-slate-500 font-normal">/ {totalDevices} Online</span>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">
              {offlineDevices} Alertas/Off
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 text-cyan-400 border border-slate-800">
              Sync: {persistenceSync?.status || 'OK'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Alertas críticas: {activeAlertsCount}
          </div>
        </div>
      </div>

      {/* Accesos Rápidos Principales (Fase 11D Requisito) */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 font-mono">
          Accesos Rápidos al Sistema
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Casa */}
          <button
            onClick={() => onNavigate('devices')}
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all text-left group space-y-2 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/60 text-cyan-400 group-hover:scale-110 transition-transform">
                🏛️
              </span>
              <span className="text-xs text-cyan-400 font-mono font-bold group-hover:translate-x-1 transition-transform">
                Entrar →
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                Mi Casa (Digital Twin)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Plano 2D interactivo con telemetría de sensores, iluminación y cámaras.
              </p>
            </div>
          </button>

          {/* 2. Diagnóstico */}
          <button
            onClick={() => onNavigate('diagnostics')}
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-blue-500/50 transition-all text-left group space-y-2 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl p-2 rounded-xl bg-blue-950/60 border border-blue-800/60 text-blue-400 group-hover:scale-110 transition-transform">
                ⚡
              </span>
              <span className="text-xs text-blue-400 font-mono font-bold group-hover:translate-x-1 transition-transform">
                Entrar →
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                Diagnóstico & Fallos
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Fault Injection Engine con semillas deterministas y asistente de diagnóstico.
              </p>
            </div>
          </button>

          {/* 3. Benchmark */}
          <button
            onClick={() => onNavigate('benchmark')}
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-emerald-500/50 transition-all text-left group space-y-2 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl p-2 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 group-hover:scale-110 transition-transform">
                📊
              </span>
              <span className="text-xs text-emerald-400 font-mono font-bold group-hover:translate-x-1 transition-transform">
                Entrar →
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                Benchmark Center
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluación comparativa de algoritmos de memoria y CPU con métricas reales.
              </p>
            </div>
          </button>

          {/* 4. Auditoría */}
          <button
            onClick={() => onNavigate('user-audit')}
            className={`p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 transition-all text-left group space-y-2 shadow-lg ${
              role === 'ADMIN' ? 'hover:border-purple-500/50' : 'opacity-70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl p-2 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-400 group-hover:scale-110 transition-transform">
                🛡️
              </span>
              <span className="text-xs text-purple-400 font-mono font-bold group-hover:translate-x-1 transition-transform">
                {role === 'ADMIN' ? 'Entrar →' : '🔒 ADMIN'}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white group-hover:text-purple-400 transition-colors">
                Auditoría de Usuario
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Timeline visual de eventos de seguridad y acciones ejecutadas en la UI.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Resumen del Sistema y Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daemons Activos */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Daemons Críticos de Domótica</h3>
            <span className="text-[11px] font-mono text-cyan-400">Enlace con Gemelo Digital</span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-white font-semibold">surveillance_proc</span>
              </div>
              <span className="text-emerald-400 font-bold">RUNNING</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-white font-semibold">lighting_daemon</span>
              </div>
              <span className="text-emerald-400 font-bold">RUNNING</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-white font-semibold">sensor_telemetry_daemon</span>
              </div>
              <span className="text-emerald-400 font-bold">RUNNING</span>
            </div>
          </div>
        </div>

        {/* Resumen de Concurrencia e IPC */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Estado de Concurrencia & IPC</h3>
            <span className="text-[11px] font-mono text-indigo-400">Fase 07 RAG</span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Detección de Deadlocks (RAG):</span>
              <span className="text-emerald-400 font-bold">SIN CICLOS (0)</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Colas IPC Activas:</span>
              <span className="text-cyan-400 font-bold">5 Canales Listos</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Mecanismos de Exclusión:</span>
              <span className="text-purple-400 font-bold">Mutex + Semáforos</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
