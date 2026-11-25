// src/components/overview/SyncDashboard.jsx
// Panel de Sincronización en Tiempo Real — Fase 05 (Supabase Completo)
// Muestra SYNCED / PENDING / ERROR, cola local, latencia y botón de prueba de estrés.

import React, { useState, useCallback } from 'react';
import { useSystem } from '../../context/SystemContext';

const STATUS_STYLES = {
  IDLE:    { label: 'SYNCED',      dot: 'bg-emerald-400 animate-pulse', bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-800/60', bg: 'bg-emerald-950/30' },
  SYNCING: { label: 'PENDING…',    dot: 'bg-cyan-400 animate-ping',    bar: 'bg-cyan-500',    text: 'text-cyan-300',   border: 'border-cyan-800/60',   bg: 'bg-cyan-950/30' },
  ERROR:   { label: 'ERROR',       dot: 'bg-red-400 animate-pulse',    bar: 'bg-red-500',     text: 'text-red-400',    border: 'border-red-800/60',    bg: 'bg-red-950/30' },
  OFFLINE: { label: 'LOCAL / SANDBOX', dot: 'bg-slate-500',           bar: 'bg-slate-600',   text: 'text-slate-400',  border: 'border-slate-700',     bg: 'bg-slate-900' },
};

function Metric({ label, value, unit = '', highlight = false }) {
  return (
    <div className="flex flex-col items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 min-w-[100px]">
      <span className={`text-lg font-black font-mono tracking-tight ${highlight ? 'text-cyan-300' : 'text-white'}`}>
        {value}<span className="text-xs font-normal text-slate-400 ml-0.5">{unit}</span>
      </span>
      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  );
}

function EventPill({ event }) {
  if (!event) return <span className="text-slate-600 italic text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-cyan-300 bg-cyan-950/40 border border-cyan-900/50 rounded-lg px-2 py-0.5 max-w-full truncate">
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
      <span className="truncate">{event.type || 'EVENT'}</span>
      {event.timestamp && (
        <span className="text-slate-500 shrink-0">{String(event.timestamp).slice(11, 19)}</span>
      )}
    </span>
  );
}

export function SyncDashboard() {
  const { syncStatus, syncMetrics, supabaseAdapter } = useSystem();
  const style = STATUS_STYLES[syncStatus] || STATUS_STYLES.OFFLINE;

  const [stressRunning, setStressRunning] = useState(false);
  const [stressResult, setStressResult] = useState(null);
  const [stressProgress, setStressProgress] = useState(0);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const queueSize = syncMetrics?.queueSize ?? 0;
  const failedCount = syncMetrics?.failedCount ?? 0;
  const totalSynced = syncMetrics?.totalSynced ?? 0;
  const avgLatency = syncMetrics?.avgLatencyMs ?? 0;
  const lastLatency = syncMetrics?.lastLatencyMs ?? 0;
  const lastEvent = syncMetrics?.lastSyncedEvent ?? null;
  const origin = syncMetrics?.origin ?? 'sandbox';

  const handleStressTest = useCallback(async () => {
    if (!supabaseAdapter || stressRunning) return;
    setStressRunning(true);
    setStressProgress(0);
    setStressResult(null);
    try {
      const result = await supabaseAdapter.runStressTest(500, (done, total) => {
        setStressProgress(Math.round((done / total) * 100));
      });
      setStressResult(result);
    } catch (e) {
      setStressResult({ error: e.message });
    } finally {
      setStressRunning(false);
      setStressProgress(0);
    }
  }, [supabaseAdapter, stressRunning]);

  const handleLoadHistory = useCallback(async () => {
    if (!supabaseAdapter || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const events = await supabaseAdapter.loadHistory({ limit: 10 });
      setHistoryEvents(events);
    } catch {
      setHistoryEvents([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [supabaseAdapter, loadingHistory]);

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-black tracking-wide text-white">
            📡 Sincronización Supabase
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Telemetría en tiempo real · Fase 05 · Adaptador: <span className="text-slate-300 font-mono">SupabasePersistenceAdapter</span>
          </p>
        </div>

        {/* Badge de estado principal */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${style.bg} ${style.border} ${style.text}`}>
          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
          <span>{style.label}</span>
        </div>
      </div>

      {/* Barra de progreso de cola */}
      {queueSize > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>COLA LOCAL</span>
            <span>{queueSize} evento(s) pendientes</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
              style={{ width: `${Math.min(100, (queueSize / 500) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Métricas */}
      <div className="flex flex-wrap gap-2">
        <Metric label="Cola" value={queueSize} />
        <Metric label="Fallidos" value={failedCount} highlight={failedCount > 0} />
        <Metric label="Sincronizados" value={totalSynced} />
        <Metric label="Lat. Prom." value={avgLatency} unit="ms" />
        <Metric label="Última Lat." value={lastLatency} unit="ms" />
        <div className="flex flex-col items-center bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 min-w-[100px]">
          <span className="text-lg font-black font-mono tracking-tight text-amber-300">
            {origin}
          </span>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">Origen</span>
        </div>
      </div>

      {/* Último evento sincronizado */}
      <div className="space-y-1">
        <span className="text-[10px] font-mono text-slate-500 uppercase">Último Evento Sincronizado</span>
        <EventPill event={lastEvent} />
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
        {/* Prueba de estrés */}
        {supabaseAdapter ? (
          <button
            onClick={handleStressTest}
            disabled={stressRunning}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer
              ${stressRunning
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
          >
            {stressRunning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                Ejecutando… {stressProgress}%
              </>
            ) : (
              <>⚡ Prueba de Estrés (500 Eventos)</>
            )}
          </button>
        ) : (
          <span className="text-xs text-slate-500 italic">Supabase no configurado — Prueba de estrés no disponible</span>
        )}

        {/* Cargar historial desde Supabase */}
        {supabaseAdapter && (
          <button
            onClick={handleLoadHistory}
            disabled={loadingHistory}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            {loadingHistory ? '⏳ Cargando…' : '🔄 Leer desde Supabase'}
          </button>
        )}
      </div>

      {/* Resultado de prueba de estrés */}
      {stressResult && (
        <div className={`rounded-xl border p-4 text-xs font-mono space-y-2 ${
          stressResult.error
            ? 'bg-red-950/30 border-red-800/60 text-red-300'
            : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
        }`}>
          {stressResult.error ? (
            <div className="text-red-400">❌ Error: {stressResult.error}</div>
          ) : (
            <>
              <div className="font-bold text-emerald-400 text-sm">✅ Prueba de Estrés Completada</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-300">
                <span>Generados:</span><span className="text-white font-bold">{stressResult.totalGenerated}</span>
                <span>Persistidos:</span><span className="text-white font-bold">{stressResult.totalPersisted}</span>
                <span>Pérdidas:</span><span className={stressResult.lossCount > 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{stressResult.lossCount}</span>
                <span>Duplicados:</span><span className={stressResult.duplicatesDetected > 0 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>{stressResult.duplicatesDetected}</span>
                <span>Duración:</span><span className="text-white font-bold">{stressResult.durationMs} ms</span>
                <span>Lat. Prom.:</span><span className="text-white font-bold">{stressResult.avgLatencyMs} ms</span>
                <span>Orden Temporal:</span><span className="text-emerald-400 font-bold">{stressResult.temporalOrderCoherent ? '✓ COHERENTE' : '✗ INCOHERENTE'}</span>
                <span>Estado Final:</span><span className="text-white font-bold">{stressResult.status}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Historial leído desde Supabase */}
      {historyEvents.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-slate-500 uppercase flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Lectura real desde Supabase — últimos {historyEvents.length} eventos
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {historyEvents.map((evt, i) => (
              <div
                key={evt.id || i}
                className="flex items-center gap-2 text-[10px] font-mono bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                <span className="text-slate-500 shrink-0">{String(evt.timestamp || '').slice(11, 19)}</span>
                <span className="text-cyan-300 font-bold truncate">{evt.type}</span>
                <span className="text-slate-500 shrink-0">{evt.source}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] font-mono text-slate-600 border-t border-slate-800/60 pt-2">
        Tablas activas: kernel_events · boot_history · processes · cpu_history · memory_allocations · page_faults · devices · sensor_readings · logs · alerts · filesystem_nodes · benchmark_runs · benchmark_results
      </div>
    </div>
  );
}
