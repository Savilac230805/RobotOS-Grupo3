import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { eventEngine, EVENT_SOURCES } from '../core';

export const UserAuditPage = ({ onNavigate }) => {
  const { user, role } = useAuth();
  const [auditEvents, setAuditEvents] = useState(() => eventEngine.getHistory(300));
  const [selectedFilter, setSelectedFilter] = useState('ALL');

  // Suscribirse a eventos en tiempo real
  useEffect(() => {
    const unsub = eventEngine.subscribeAll((evt) => {
      setAuditEvents((prev) => [evt, ...prev.slice(0, 299)]);
    });
    return () => unsub();
  }, []);

  // Mapear eventos a acciones legibles para auditoría humana
  const timelineItems = useMemo(() => {
    return auditEvents
      .map((evt) => {
        let title = evt.type;
        let actor = evt.payload?.user || evt.payload?.attemptedUser || 'Sistema / Kernel';
        let actionClass = 'DEFAULT';
        let icon = '📌';
        let description = '';

        if (evt.type === 'LOGIN_SUCCESS') {
          title = 'Inicio de Sesión Exitoso';
          actor = evt.payload?.user || 'Usuario';
          description = `Autenticado con rol ${evt.payload?.role || 'USER'} (${evt.payload?.authMethod || 'Local'})`;
          icon = '🔑';
          actionClass = 'AUTH';
        } else if (evt.type === 'LOGIN_FAILED') {
          title = 'Intento de Inicio de Sesión Fallido';
          actor = evt.payload?.attemptedUser || 'Desconocido';
          description = `Intento ${evt.payload?.attemptNumber || 1} de ${evt.payload?.maxAttempts || 3}. Credenciales rechazadas.`;
          icon = '🚫';
          actionClass = 'SECURITY';
        } else if (evt.type === 'LOGOUT') {
          title = 'Cierre de Sesión';
          actor = evt.payload?.user || 'Usuario';
          description = `Sesión finalizada formalmente.`;
          icon = '👋';
          actionClass = 'AUTH';
        } else if (evt.type === 'ACCESS_DENIED') {
          title = 'Acceso Denegado por RBAC';
          actor = evt.payload?.user || 'Anónimo';
          description = evt.payload?.reason || `Intento no autorizado: ${evt.payload?.action}`;
          icon = '⛔';
          actionClass = 'SECURITY';
        } else if (evt.type.includes('DEVICE') || evt.type.includes('LIGHT') || evt.type.includes('DOOR') || evt.type.includes('DRIVER')) {
          title = `Acción de Dispositivo (${evt.type})`;
          actor = evt.payload?.user || 'Operador Domótico';
          description = `Mutación en actuador/sensor: ${JSON.stringify(evt.payload || {})}`;
          icon = '💡';
          actionClass = 'HARDWARE';
        } else if (evt.type.includes('BENCHMARK')) {
          title = 'Ejecución de Benchmark de Sistema';
          actor = 'Administrador';
          description = `Evaluación de rendimiento ejecutada: ${JSON.stringify(evt.payload || {})}`;
          icon = '📊';
          actionClass = 'BENCHMARK';
        } else if (evt.type.includes('FAULT')) {
          title = 'Inyección de Fallo en Kernel';
          actor = 'Administrador';
          description = `Fallo provocado: ${JSON.stringify(evt.payload || {})}`;
          icon = '⚡';
          actionClass = 'FAULT';
        } else if (evt.type.includes('DEADLOCK')) {
          title = 'Detección / Resolución de Deadlock';
          actor = 'Kernel RTOS';
          description = `Ciclo RAG evaluado: ${JSON.stringify(evt.payload || {})}`;
          icon = '⚠️';
          actionClass = 'DEADLOCK';
        } else if (evt.type === 'PROCESS_TERMINATED' || evt.type.includes('KILL')) {
          title = `Proceso Terminado (PID ${evt.pid || 'N/A'})`;
          actor = 'Process Manager';
          description = `Liberación de memoria y recursos: ${JSON.stringify(evt.payload || {})}`;
          icon = '🛑';
          actionClass = 'PROCESS';
        } else {
          description = JSON.stringify(evt.payload || {});
        }

        return {
          id: evt.id,
          timestamp: evt.timestamp,
          rawType: evt.type,
          title,
          actor,
          description,
          icon,
          actionClass,
          severity: evt.severity,
        };
      })
      .filter((item) => {
        if (selectedFilter === 'ALL') return true;
        return item.actionClass === selectedFilter;
      });
  }, [auditEvents, selectedFilter]);

  // Protección exclusiva para Administrador
  if (role !== 'ADMIN') {
    return (
      <div className="max-w-2xl mx-auto my-16 p-8 rounded-3xl bg-slate-900 border border-red-800/80 shadow-2xl text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-950/80 border border-red-700 flex items-center justify-center text-3xl">
          🔒
        </div>
        <h2 className="text-xl font-bold text-white">Módulo Exclusivo para Administrador</h2>
        <p className="text-sm text-slate-400">
          La Auditoría de Usuario y Trazabilidad de Interfaz requiere privilegios de <span className="font-mono text-purple-400 font-bold">ADMIN</span>.
        </p>
        <p className="text-xs text-slate-500 font-mono">
          Tu rol actual es: <span className="text-amber-400 font-bold">{role}</span>
        </p>
        <div className="pt-4">
          <button
            onClick={() => onNavigate('dashboard')}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all"
          >
            ← Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Auditoría de Acciones de Usuario</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-purple-950 text-purple-300 border border-purple-800/60 uppercase">
              Exclusivo Admin
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Línea de tiempo cronológica de inicios de sesión, manipulación de dispositivos, procesos, fallos y benchmarks
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-400">Filtrar por:</span>
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400 focus:outline-none"
          >
            <option value="ALL">Todas las Acciones</option>
            <option value="AUTH">Sesiones (Login/Logout)</option>
            <option value="SECURITY">Seguridad & RBAC</option>
            <option value="HARDWARE">Dispositivos Domóticos</option>
            <option value="FAULT">Fault Injection</option>
            <option value="BENCHMARK">Benchmarks</option>
            <option value="PROCESS">Procesos & CPU</option>
          </select>
        </div>
      </div>

      {/* Timeline Visual de Auditoría */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
          {timelineItems.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 font-mono">
              No hay acciones registradas en este filtro.
            </div>
          ) : (
            timelineItems.map((item) => (
              <div key={item.id} className="relative group">
                {/* Punto del Timeline */}
                <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center text-[10px] shadow">
                  {item.icon}
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 group-hover:border-cyan-500/40 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">{item.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-cyan-400 border border-slate-800 uppercase">
                        {item.actionClass}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs font-mono">
                    <span className="text-slate-500">Actor / Origen:</span>
                    <span className="text-purple-300 font-bold">{item.actor}</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-500">Tipo:</span>
                    <span className="text-slate-400">{item.rawType}</span>
                  </div>

                  <p className="text-xs text-slate-400 font-mono bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/50 break-all">
                    {item.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
