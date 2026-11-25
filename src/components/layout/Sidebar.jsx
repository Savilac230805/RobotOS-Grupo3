import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSystem } from '../../context/SystemContext';

export const Sidebar = ({ currentScreen, onNavigate }) => {
  const { role, checkPermission } = useAuth();
  const { activeAlertsCount, addLog } = useSystem();

  // Secciones requeridas por Fase 11C
  const sections = [
    {
      title: 'SECCIÓN USUARIO',
      items: [
        {
          id: 'dashboard',
          name: '📈 Estado General',
          subtitle: 'KPIs y Métricas SaaS',
          minRole: 'GUEST',
        },
        {
          id: 'devices',
          name: '🏠 Mi Casa',
          subtitle: 'Digital Twin 2D',
          minRole: 'GUEST',
        },
        {
          id: 'overview',
          name: '💡 Dispositivos',
          subtitle: 'Sensores & Actuadores',
          minRole: 'GUEST',
        },
        {
          id: 'desktop',
          name: '🖥️ Escritorio RobotOS',
          subtitle: 'Entorno de Ventanas',
          minRole: 'GUEST',
        },
        {
          id: 'settings',
          name: '⚙ Automatizaciones',
          subtitle: 'Reglas y Políticas',
          minRole: 'USER',
        },
        {
          id: 'login',
          name: '👤 Perfil & Sesión',
          subtitle: 'Control de Roles RBAC',
          minRole: 'GUEST',
        },
      ],
    },
    {
      title: 'SECCIÓN SISTEMA',
      items: [
        {
          id: 'processes',
          name: 'Procesos',
          subtitle: 'Gantt & Estados PCB',
          minRole: 'USER',
        },
        {
          id: 'resource-monitor',
          name: 'Scheduler & CPU',
          subtitle: 'Planificador y Ticks',
          minRole: 'USER',
        },
        {
          id: 'memory',
          name: 'Memoria & Paginación',
          subtitle: 'Física y Virtual',
          minRole: 'USER',
        },
        {
          id: 'concurrency-lab',
          name: 'IPC & Concurrencia',
          subtitle: 'Mutex, Semáforos & RAG',
          minRole: 'USER',
        },
        {
          id: 'terminal',
          name: 'Terminal RobotOS',
          subtitle: 'Shell & Syscalls',
          minRole: 'USER',
        },
      ],
    },
    {
      title: 'SECCIÓN DIAGNÓSTICO',
      items: [
        {
          id: 'diagnostics',
          name: 'Diagnóstico & Faults',
          subtitle: 'Fault Engine & Asistente',
          minRole: 'USER',
        },
        {
          id: 'benchmark',
          name: 'Benchmark Center',
          subtitle: 'Evaluación Comparativa',
          minRole: 'USER',
        },
      ],
    },
    {
      title: 'SECCIÓN ADMINISTRACIÓN',
      items: [
        {
          id: 'user-audit',
          name: 'Auditoría de Usuario',
          subtitle: 'Timeline de Interfaz',
          minRole: 'ADMIN', // Exclusivo ADMIN
        },
        {
          id: 'observability',
          name: 'Observabilidad',
          subtitle: 'Live Stream de Eventos',
          minRole: 'USER',
        },
        {
          id: 'logs-alerts',
          name: 'Logs & Alertas',
          subtitle: 'Diagnóstico y Sandbox',
          minRole: 'USER',
          badge: role !== 'GUEST' && activeAlertsCount > 0 ? activeAlertsCount : null,
        },
        {
          id: 'file-explorer',
          name: 'Explorador de Archivos',
          subtitle: 'Virtual File System',
          minRole: 'USER',
        },
      ],
    },
  ];

  const handleItemClick = (item) => {
    if (item.minRole !== 'GUEST') {
      const allowed = checkPermission(item.minRole, `Navegación al módulo "${item.name}"`, addLog);
      if (!allowed) return;
    }
    onNavigate(item.id);
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
      <div className="overflow-y-auto flex-1">
        {/* Brand Header */}
        <div
          onClick={() => onNavigate('welcome')}
          className="h-16 px-5 flex items-center space-x-3 border-b border-slate-800 bg-slate-950/60 cursor-pointer hover:bg-slate-900 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-cyan-500/20">
            R
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center space-x-1.5">
              <span>RobotOS</span>
              <span className="text-[10px] font-mono uppercase bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-800/60">
                v2.4
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">SmartHome OS</p>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="p-3 space-y-4">
          {sections.map((sec) => (
            <div key={sec.title} className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                <span>{sec.title}</span>
                {sec.title === 'SECCIÓN ADMINISTRACIÓN' && role !== 'ADMIN' && (
                  <span className="text-[9px] text-purple-400 font-mono">ADMIN</span>
                )}
              </div>

              {sec.items.map((item) => {
                const isActive = currentScreen === item.id;
                const isBlocked = (item.minRole === 'ADMIN' && role !== 'ADMIN') ||
                                  (item.minRole === 'USER' && role === 'GUEST');

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all group ${
                      isActive
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : isBlocked
                        ? 'text-slate-600 hover:text-slate-400 hover:bg-slate-800/30 border border-transparent opacity-75'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="truncate">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-semibold truncate">{item.name}</span>
                          {isBlocked && <span className="text-[10px]">🔒</span>}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
                      </div>
                    </div>

                    {item.badge && (
                      <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer / User Profile & Role Indicator */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 shrink-0 space-y-2">
        <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 font-mono">Rol Activo:</span>
          <span className={`font-mono font-bold ${
            role === 'ADMIN' ? 'text-purple-400' : role === 'USER' ? 'text-cyan-400' : 'text-amber-400'
          }`}>
            {role}
          </span>
        </div>

        <button
          onClick={() => onNavigate('welcome')}
          className="w-full text-center py-1.5 text-[11px] font-mono text-slate-400 hover:text-cyan-400 transition-colors"
        >
          ℹ️ Ver Pantalla de Bienvenida
        </button>
      </div>
    </aside>
  );
};
