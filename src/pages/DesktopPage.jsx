import React, { useState, useEffect } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

export const DesktopPage = ({ onNavigate }) => {
  const {
    processes,
    memoryStats,
    devices,
    tickCount,
    activeAlertsCount,
    syncStatus,
    syncMetrics,
    logs,
  } = useSystem();

  const { role } = useAuth();

  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const runningCount = processes.filter((p) => p.estado === 'RUNNING').length;
  const readyCount = processes.filter((p) => p.estado === 'READY').length;

  const appLaunchers = [
    {
      id: 'terminal',
      title: 'Terminal Shell',
      desc: 'Línea de comandos & Syscalls',
      icon: '📟',
      color: 'from-emerald-600 to-teal-700',
      screen: 'terminal',
    },
    {
      id: 'processes',
      title: 'Procesos & Scheduler',
      desc: 'Gestor de PCBs y Algoritmos',
      icon: '⚙️',
      color: 'from-blue-600 to-indigo-700',
      screen: 'processes',
    },
    {
      id: 'resource-monitor',
      title: 'Monitor de Recursos',
      desc: 'Gráficas CPU y Memoria',
      icon: '📊',
      color: 'from-cyan-600 to-blue-700',
      screen: 'resource-monitor',
    },
    {
      id: 'devices',
      title: 'Smart House 2D',
      desc: 'Digital Twin & Drivers',
      icon: '🏛️',
      color: 'from-amber-600 to-orange-700',
      screen: 'devices',
    },
    {
      id: 'file-explorer',
      title: 'Explorador VFS',
      desc: 'Archivos y Directorios',
      icon: '🗂️',
      color: 'from-violet-600 to-purple-700',
      screen: 'file-explorer',
    },
    {
      id: 'concurrency-lab',
      title: 'Concurrencia & IPC',
      desc: 'Mutex, Semáforos & RAG',
      icon: '⚡',
      color: 'from-amber-600 to-yellow-700',
      screen: 'concurrency-lab',
    },
    {
      id: 'diagnostics',
      title: 'Diagnóstico & Fallos',
      desc: 'Fault Engine & Asistente',
      icon: '🔬',
      color: 'from-rose-600 to-red-700',
      screen: 'diagnostics',
    },
    {
      id: 'benchmark',
      title: 'Benchmark Center',
      desc: 'Evaluación Comparativa',
      icon: '📊',
      color: 'from-indigo-600 to-blue-700',
      screen: 'benchmark',
    },
    {
      id: 'settings',
      title: 'Configuración',
      desc: 'Scheduler, Nube y Perfil',
      icon: '🛠️',
      color: 'from-slate-600 to-slate-800',
      screen: 'settings',
    },
    {
      id: 'logs-alerts',
      title: 'Logs & Diagnóstico',
      desc: 'Auditoría y Sandbox',
      icon: '🛡️',
      color: 'from-rose-600 to-pink-700',
      screen: 'logs-alerts',
      badge: activeAlertsCount > 0 ? `${activeAlertsCount} Alertas` : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Desktop Wallpaper / Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                RobotOS Desktop Environment
              </span>
              <span className="text-xs text-slate-400 font-mono">Kernel v1.0.0</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Bienvenido al Escritorio RobotOS
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Plataforma unificada de control domótico y simulación de sistemas operativos.
              Navegue entre aplicaciones conectadas directamente al núcleo del sistema.
            </p>
          </div>

          {/* Quick System Badge */}
          <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur border border-slate-700/60 rounded-xl p-3 shadow-inner">
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Hora del Sistema</span>
              <span className="text-sm font-bold text-white font-mono">{time}</span>
            </div>
            <div className="h-8 w-px bg-slate-700"></div>
            <div>
              <span className="text-xs text-slate-400 block">Kernel Clock</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">{tickCount} ticks</span>
            </div>
          </div>
        </div>

        {/* Ambient Glow */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Grid of Launchers / App Icons */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">
          Aplicaciones del Sistema
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {appLaunchers.map((app) => (
            <div
              key={app.id}
              onClick={() => onNavigate(app.screen)}
              className="group relative bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center text-2xl shadow-md group-hover:scale-105 transition-transform`}
                  >
                    {app.icon}
                  </div>
                  {app.badge && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                      {app.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                  {app.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {app.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 group-hover:text-slate-300">
                <span>Abrir módulo</span>
                <span>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Status Widgets Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Widget 1: CPU & Memory Overview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Rendimiento de Recursos</span>
            <span className="text-[11px] font-mono text-emerald-400">
              {runningCount} RUNNING | {readyCount} READY
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                <span>Memoria Utilizada</span>
                <span className="font-mono text-slate-200">{memoryStats?.usedBlocks ?? 0} / 64 blk</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${memoryStats?.usagePercent ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Widget 2: Smart House Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Dispositivos Domóticos</span>
            <span className="text-[11px] font-mono text-slate-400">{devices.length} conectados</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 bg-slate-800/50 rounded border border-slate-700/50 flex items-center justify-between">
              <span className="text-slate-400">Luces:</span>
              <span className="text-emerald-400 font-semibold font-mono">
                {devices.filter((d) => d.type === 'light' && d.status === 'ON').length} ON
              </span>
            </div>
            <div className="p-2 bg-slate-800/50 rounded border border-slate-700/50 flex items-center justify-between">
              <span className="text-slate-400">Cerradura:</span>
              <span className="text-indigo-400 font-semibold font-mono">
                {devices.find((d) => d.type === 'lock')?.status || 'SEGURA'}
              </span>
            </div>
          </div>
        </div>

        {/* Widget 3: Cloud Telemetry & Security */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Nube & Seguridad</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
              Rol: {role}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Sincronización Supabase:</span>
            <span className={`font-mono font-semibold ${syncStatus === 'SYNCED' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {syncStatus} ({syncMetrics?.synced ?? 0} envíos)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 truncate">
            Último log: {logs[0]?.message || 'Sistema iniciado correctamente.'}
          </div>
        </div>
      </div>
    </div>
  );
};
