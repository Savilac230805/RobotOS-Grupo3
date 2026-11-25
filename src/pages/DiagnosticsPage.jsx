import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import {
  faultEngine,
  FAULT_CATEGORIES,
  FAULT_MODES,
  DiagnosticAssistant,
} from '../core';

export const DiagnosticsPage = () => {
  const {
    events = [],
    logs = [],
    alerts = [],
    processes = [],
    devices = [],
    executionMetrics = {},
    addLog,
  } = useSystem();

  // Estados de Fault Engine
  const [seed, setSeed] = useState(4242);
  const [category, setCategory] = useState(FAULT_CATEGORIES.SENSOR);
  const [mode, setMode] = useState(FAULT_MODES.ISOLATED);
  const [faultHistory, setFaultHistory] = useState(faultEngine.getHistory());
  const [lastInjected, setLastInjected] = useState(null);

  // Estados de Diagnostic Assistant
  const [diagnosticReport, setDiagnosticReport] = useState(null);

  const handleInjectFault = async () => {
    const plan = faultEngine.generatePlan({ seed: Number(seed), category, mode, count: mode === FAULT_MODES.COMBINED ? 2 : 1 });
    const executed = [];

    for (const item of plan) {
      const res = await faultEngine.inject(item, { role: 'ADMIN' });
      executed.push(res);
      addLog({
        level: 'WARN',
        source: 'FAULT_ENGINE',
        message: `[FALLO INYECTADO] Seed #${seed} | ${item.category} -> ${item.component}: ${item.detail}`,
      });
    }

    setLastInjected(executed[0]);
    setFaultHistory(faultEngine.getHistory());
  };

  const handleRunDiagnosis = () => {
    // Recopilar estado real del sistema
    const report = DiagnosticAssistant.analyze({
      events,
      logs,
      alerts,
      metrics: executionMetrics,
      processes,
      devices,
    });

    setDiagnosticReport(report);

    addLog({
      level: 'INFO',
      source: 'DIAGNOSTIC_ASSISTANT',
      message: `Análisis diagnóstico completado: ${report.headline} (Confianza: ${(report.confidence * 100).toFixed(0)}%)`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span className="text-rose-400">🔬</span>
          Motor de Inyección de Fallos y Asistente de Diagnóstico (Fase 09)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Validación de resiliencia con semillas reproducibles y auditoría causal basada en evidencia estricta de eventos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Fault Injection Engine */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              1. Fault Injection Engine (Determinista con Seed)
            </h2>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Seed (PRNG):</label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 font-mono outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Categoría:</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 font-mono outline-none"
                  >
                    {Object.values(FAULT_CATEGORIES).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Modo:</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 font-mono outline-none"
                  >
                    {Object.values(FAULT_MODES).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300">
                <span className="text-slate-400 block mb-1 font-semibold">Garantía de Reproducibilidad:</span>
                La semilla #{seed} en modo {mode} generará exactamente los mismos vectores de fallo, componentes afectados y códigos de evento.
              </div>

              <button
                onClick={handleInjectFault}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <span>⚡</span> Inyectar Fallo Controlado en Kernel
              </button>

              {lastInjected && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-[11px] font-mono text-rose-300">
                  <div className="font-bold">Fallo #{lastInjected.id} inyectado:</div>
                  <div>Componente: {lastInjected.component} ({lastInjected.category})</div>
                  <div>Detalle: {lastInjected.detail}</div>
                </div>
              )}
            </div>
          </div>

          {/* Historial de Fallos */}
          <div className="border-t border-slate-800 pt-3">
            <span className="text-[11px] text-slate-400 block mb-1">
              Registro de Fallos Inyectados ({faultHistory.length}):
            </span>
            <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px]">
              {faultHistory.length === 0 ? (
                <span className="text-slate-500 italic">No se han inyectado fallos en esta sesión.</span>
              ) : (
                faultHistory.map((f) => (
                  <div key={f.id} className="p-1.5 bg-slate-950 rounded border border-slate-800 flex justify-between text-slate-300">
                    <span className="text-rose-400">{f.category}</span>
                    <span className="truncate ml-2">{f.component}: {f.type}</span>
                    <span className="text-slate-500">Seed:{f.seed}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Panel 2: Intelligent Diagnostic Assistant */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                2. Intelligent Diagnostic Assistant
              </h2>
              <button
                onClick={handleRunDiagnosis}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
              >
                Analizar Telemetría
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Diagnóstico causal respaldado exclusivamente en evidencia real de eventos, métricas y estados de procesos.
            </p>

            {/* Diagnostic Report Display */}
            {!diagnosticReport ? (
              <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-500 italic">
                Presione "Analizar Telemetría" para que el asistente audite los eventos y logs del Kernel.
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className={`p-3 rounded-lg border font-mono text-xs ${
                    diagnosticReport.status === 'INSUFFICIENT_DATA'
                      ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                      : diagnosticReport.status === 'ISSUES_DETECTED'
                      ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                      : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  }`}
                >
                  <div className="font-bold uppercase tracking-wider mb-1">
                    {diagnosticReport.headline}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-200">
                    {diagnosticReport.summary}
                  </p>
                  <div className="text-[10px] text-slate-400 mt-2">
                    Nivel de Certeza Empírica: {(diagnosticReport.confidence * 100).toFixed(0)}%
                  </div>
                </div>

                {/* Evidence Citing Box */}
                {diagnosticReport.evidence && diagnosticReport.evidence.length > 0 && (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block">
                      Evidencia Concreta Citada ({diagnosticReport.evidence.length}):
                    </span>
                    <div className="max-h-32 overflow-y-auto space-y-1 text-[10px] font-mono">
                      {diagnosticReport.evidence.map((ev, i) => (
                        <div key={i} className="p-1.5 bg-slate-900 rounded border border-slate-800 text-slate-300 flex justify-between">
                          <span className="text-cyan-400 font-bold">[{ev.type}]</span>
                          <span className="truncate ml-2">{ev.source || ev.component || ev.name || ev.detail}</span>
                          <span className="text-slate-500 ml-2">{ev.id ? String(ev.id).slice(0, 12) : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {diagnosticReport.recommendations && diagnosticReport.recommendations.length > 0 && (
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                    <span className="font-semibold text-slate-300 block mb-1">Recomendación del Asistente:</span>
                    <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                      {diagnosticReport.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500">
            Regla de Integridad: Si no hay evidencia fehaciente en el Kernel, el asistente responde "DATOS INSUFICIENTES".
          </div>
        </div>
      </div>
    </div>
  );
};
