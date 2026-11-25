import React, { useState, useEffect, useMemo } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from '../core';

export const ObservabilityCenter = ({ onNavigate }) => {
  const { logs, alerts, activeAlertsCount, metrics } = useSystem();
  const { role } = useAuth();

  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [liveEvents, setLiveEvents] = useState(() => eventEngine.getHistory(200));
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Suscribirse a eventos en tiempo real emitidos por el Kernel
  useEffect(() => {
    const unsubscribe = eventEngine.subscribeAll((newEvent) => {
      setLiveEvents((prev) => [newEvent, ...prev.slice(0, 249)]);
    });

    return () => unsubscribe();
  }, []);

  // Categorizar eventos reales
  const classifiedEvents = useMemo(() => {
    return liveEvents.map((evt) => {
      let category = 'KERNEL';

      const type = evt.type || '';
      const source = evt.source || '';

      if (source === EVENT_SOURCES.SECURITY_GUARD || type.includes('LOGIN') || type.includes('LOGOUT') || type.includes('ACCESS_DENIED') || type.includes('ROLE_SWITCHED')) {
        category = 'SECURITY';
      } else if (type.includes('FAULT') || type.includes('INJECT') || source.includes('FAULT')) {
        category = 'FAULT';
      } else if (type.includes('DEADLOCK') || type.includes('CYCLE')) {
        category = 'DEADLOCK';
      } else if (type.includes('MUTEX') || type.includes('SEMAPHORE') || type.includes('IPC') || type.includes('MSG_') || type.includes('LOCK')) {
        category = 'CONCURRENCY';
      } else if (source === 'ALERT_DAEMON' || evt.severity === 'ERROR' || evt.severity === 'CRITICAL') {
        category = 'ALERT';
      }

      return {
        ...evt,
        category,
      };
    });
  }, [liveEvents]);

  // Filtrado compuesto
  const filteredEvents = useMemo(() => {
    return classifiedEvents.filter((evt) => {
      // Filtro por Tab
      if (activeTab === 'SECURITY' && evt.category !== 'SECURITY') return false;
      if (activeTab === 'FAULT' && evt.category !== 'FAULT') return false;
      if (activeTab === 'CONCURRENCY' && evt.category !== 'CONCURRENCY') return false;
      if (activeTab === 'DEADLOCK' && evt.category !== 'DEADLOCK') return false;
      if (activeTab === 'ALERT' && evt.category !== 'ALERT') return false;
      if (activeTab === 'KERNEL' && evt.category !== 'KERNEL') return false;

      // Filtro por Severidad
      if (selectedSeverity !== 'ALL' && evt.severity !== selectedSeverity) return false;

      // Filtro por Búsqueda de Texto
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const typeMatch = evt.type?.toLowerCase().includes(query);
        const sourceMatch = evt.source?.toLowerCase().includes(query);
        const payloadMatch = JSON.stringify(evt.payload || {}).toLowerCase().includes(query);
        if (!typeMatch && !sourceMatch && !payloadMatch) return false;
      }

      return true;
    });
  }, [classifiedEvents, activeTab, selectedSeverity, searchQuery]);

  const counts = useMemo(() => {
    return {
      total: classifiedEvents.length,
      security: classifiedEvents.filter((e) => e.category === 'SECURITY').length,
      fault: classifiedEvents.filter((e) => e.category === 'FAULT').length,
      concurrency: classifiedEvents.filter((e) => e.category === 'CONCURRENCY').length,
      deadlock: classifiedEvents.filter((e) => e.category === 'DEADLOCK').length,
      alert: classifiedEvents.filter((e) => e.category === 'ALERT').length,
      kernel: classifiedEvents.filter((e) => e.category === 'KERNEL').length,
    };
  }, [classifiedEvents]);

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
      case 'ERROR':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'WARN':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'INFO':
      default:
        return 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60';
    }
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'SECURITY':
        return 'text-purple-400';
      case 'FAULT':
        return 'text-rose-400';
      case 'DEADLOCK':
        return 'text-red-400';
      case 'CONCURRENCY':
        return 'text-indigo-400';
      case 'ALERT':
        return 'text-amber-400';
      case 'KERNEL':
      default:
        return 'text-cyan-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Centro de Observabilidad</h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 uppercase">
              Live Stream
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Telemetría unificada y registro en tiempo real de logs, kernel, seguridad, fallos, concurrencia y deadlocks
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
            <span>Buffer: </span>
            <span className="text-white font-bold">{liveEvents.length} eventos</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
            <span>Alertas activas: </span>
            <span className={`font-bold ${activeAlertsCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {activeAlertsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs por Dominio de Observabilidad */}
      <div className="flex flex-wrap gap-2 pt-1 border-b border-slate-800 pb-3">
        {[
          { id: 'ALL', label: 'Todos los Eventos', count: counts.total },
          { id: 'KERNEL', label: 'Kernel & Syscalls', count: counts.kernel },
          { id: 'SECURITY', label: 'Seguridad', count: counts.security },
          { id: 'FAULT', label: 'Fault Injection', count: counts.fault },
          { id: 'CONCURRENCY', label: 'Concurrencia & IPC', count: counts.concurrency },
          { id: 'DEADLOCK', label: 'Deadlocks', count: counts.deadlock },
          { id: 'ALERT', label: 'Alertas', count: counts.alert },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center space-x-2 ${
              activeTab === tab.id
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
              activeTab === tab.id ? 'bg-cyan-950 text-cyan-400' : 'bg-slate-950 text-slate-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Controles de Búsqueda y Severidad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por tipo de evento, origen, PID o payload..."
            className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white placeholder-slate-500 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={selectedSeverity}
          onChange={(e) => setSelectedSeverity(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
        >
          <option value="ALL">Todas las Severidades</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
      </div>

      {/* Vista Principal: Lista de Eventos en Tiempo Real */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>EVENTOS EN VIVO ({filteredEvents.length})</span>
          <span className="text-[11px] text-slate-500">Haz clic en un evento para ver detalles del payload</span>
        </div>

        <div className="divide-y divide-slate-800/80 max-h-[550px] overflow-y-auto font-mono text-xs">
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No se encontraron eventos para los filtros seleccionados.
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                onClick={() => setSelectedEvent(evt)}
                className={`p-3.5 px-5 hover:bg-slate-800/40 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                  selectedEvent?.id === evt.id ? 'bg-cyan-950/30 border-l-2 border-cyan-400' : ''
                }`}
              >
                <div className="flex items-start md:items-center space-x-3 min-w-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${getSeverityBadge(evt.severity)}`}>
                    {evt.severity}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-white font-bold truncate">{evt.type}</span>
                      <span className={`text-[10px] uppercase font-bold ${getCategoryColor(evt.category)}`}>
                        [{evt.category}]
                      </span>
                      {evt.pid !== null && (
                        <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                          PID {evt.pid}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      Origen: <span className="text-slate-300">{evt.source}</span> — {JSON.stringify(evt.payload)}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 shrink-0 font-mono">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal / Detalle de Evento */}
      {selectedEvent && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-cyan-500/40 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-3">
              <span className={`px-2.5 py-1 rounded text-xs font-bold border ${getSeverityBadge(selectedEvent.severity)}`}>
                {selectedEvent.severity}
              </span>
              <div>
                <h3 className="text-base font-bold text-white font-mono">{selectedEvent.type}</h3>
                <span className="text-xs text-slate-400 font-mono">ID: {selectedEvent.id}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 font-mono"
            >
              Cerrar Detalle ✕
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-500">ORIGEN</div>
              <div className="text-white font-bold mt-1">{selectedEvent.source}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-500">PID ASOCIADO</div>
              <div className="text-cyan-400 font-bold mt-1">{selectedEvent.pid ?? 'N/A'}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-500">TIMESTAMP</div>
              <div className="text-white font-bold mt-1">{selectedEvent.timestamp}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-500">CATEGORÍA</div>
              <div className={`font-bold mt-1 ${getCategoryColor(selectedEvent.category)}`}>
                {selectedEvent.category}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-mono text-slate-400 mb-1.5 uppercase font-semibold">
              Payload Completo (JSON)
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto">
              {JSON.stringify(selectedEvent.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
