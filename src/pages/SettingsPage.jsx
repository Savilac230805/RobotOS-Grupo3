import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { ALGORITMOS, eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from '../core';
import { isSupabaseConfigured } from '../lib/supabase';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

const INITIAL_AUTOMATION_RULES = [
  {
    id: 'rule_presence_light',
    title: 'Iluminación Inteligente por Detección',
    description: 'Enciende automáticamente las luces del Salón (d1) al detectar movimiento en el sensor frontal (d3).',
    trigger: 'Sensor Movimiento == DETECTADO',
    action: 'Encender d1 (Luces Salón)',
    enabled: true,
    executionsCount: 42,
    badge: 'Confort',
  },
  {
    id: 'rule_night_security',
    title: 'Protocolo de Seguridad Nocturna',
    description: 'Asegura la cerradura principal (d5) y mantiene la cámara frontal (d4) en vigilancia continua.',
    trigger: 'Horario Nocturno (22:00 - 06:00)',
    action: 'Bloquear d5 + Stream d4',
    enabled: true,
    executionsCount: 18,
    badge: 'Seguridad',
  },
  {
    id: 'rule_smart_irrigation',
    title: 'Riego Adaptativo de Jardín',
    description: 'Activa aspersores de jardín (d11) durante 15 minutos en intervalos matutinos.',
    trigger: 'Sensor Clima Jardín == 07:00 AM',
    action: 'Ciclo de riego d11 (15m)',
    enabled: false,
    executionsCount: 7,
    badge: 'Jardín',
  },
  {
    id: 'rule_emergency_ventilation',
    title: 'Ventilación de Emergencia por Humo/Gas',
    description: 'En caso de alerta crítica en cocina (d8 o d9), abre la puerta del garaje (d14) para ventilar.',
    trigger: 'Sensor Humo/Gas == ALERTA',
    action: 'Apertura de emergencia d14',
    enabled: true,
    executionsCount: 0,
    badge: 'Emergencia',
  },
  {
    id: 'rule_vacuum_cleaning',
    title: 'Limpieza Autónoma con Robot Recolector',
    description: 'Inicia rutina de aspirado con d10 cuando todos los sensores de habitación reporten inactividad.',
    trigger: 'Ausencia en Suite (d10)',
    action: 'Ruta de limpieza d10',
    enabled: true,
    executionsCount: 29,
    badge: 'Mantenimiento',
  },
];

const SettingsPageContent = ({ onNavigate }) => {
  // Consumo seguro y defensivo del contexto del sistema
  const systemContext = useSystem() || {};
  const {
    algorithm = ALGORITMOS?.ROUND_ROBIN || 'ROUND_ROBIN',
    setAlgorithm = () => {},
    quantum = 4,
    setQuantum = () => {},
    syncMetrics = { synced: 0, pending: 0, lastLatencyMs: 0 },
    supabaseAdapter = null,
    addLog = () => {},
  } = systemContext;

  const authContext = useAuth() || {};
  const { role = 'GUEST', user = null, logout = () => {} } = authContext;

  // Pestaña activa: Automatizaciones o Kernel/Nube
  const [activeTab, setActiveTab] = useState('AUTOMATIONS');
  const [rules, setRules] = useState(INITIAL_AUTOMATION_RULES);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushMessage, setFlushMessage] = useState(null);

  // Verificación segura de configuración Supabase
  let isConfigured = false;
  try {
    isConfigured = Boolean(isSupabaseConfigured());
  } catch (e) {
    isConfigured = false;
  }

  const handleToggleRule = (ruleId) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id === ruleId) {
          const nextState = !r.enabled;
          try {
            eventEngine.emit({
              type: 'AUTOMATION_RULE_TOGGLED',
              source: EVENT_SOURCES.IOT_MANAGER || 'IOT_MANAGER',
              severity: EVENT_SEVERITY.INFO,
              payload: {
                ruleId: r.id,
                ruleTitle: r.title,
                enabled: nextState,
                user: user?.email || 'Operador',
              },
            });
          } catch (e) {}

          addLog({
            level: 'INFO',
            source: 'AUTOMATIONS',
            message: `Regla "${r.title}" ${nextState ? 'ACTIVADA' : 'PAUSADA'} por el usuario.`,
          });

          return { ...r, enabled: nextState };
        }
        return r;
      })
    );
  };

  const handleSetAlgorithm = (newAlgo) => {
    setAlgorithm(newAlgo);
    addLog({
      level: 'INFO',
      source: 'SETTINGS',
      message: `Configuración actualizada: Algoritmo Scheduler cambiado a ${newAlgo}`,
    });
  };

  const handleQuantumChange = (newQ) => {
    const val = Number(newQ);
    if (!isNaN(val) && val >= 1 && val <= 16) {
      setQuantum(val);
      addLog({
        level: 'INFO',
        source: 'SETTINGS',
        message: `Configuración actualizada: Quantum establecido en ${val} ticks`,
      });
    }
  };

  const handleForceSync = async () => {
    if (!supabaseAdapter) {
      setFlushMessage('No hay adaptador Supabase activo.');
      return;
    }
    setIsFlushing(true);
    setFlushMessage(null);
    try {
      await supabaseAdapter.flush();
      setFlushMessage('✅ Sincronización con Supabase forzada y completada exitosamente.');
      addLog({
        level: 'INFO',
        source: 'SETTINGS',
        message: 'Flush forzado de eventos hacia Supabase ejecutado desde Configuración.',
      });
    } catch (err) {
      setFlushMessage(`❌ Error en sincronización: ${err.message}`);
    } finally {
      setIsFlushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>⚙️</span>
              <span>Automatizaciones & Políticas del Sistema</span>
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase">
              v2.4
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Motor de reglas domóticas, políticas de CPU Scheduler, sincronización Supabase y permisos RBAC
          </p>
        </div>

        {/* Selector de Pestañas */}
        <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs font-mono">
          <button
            onClick={() => setActiveTab('AUTOMATIONS')}
            className={`px-3 py-1.5 rounded-lg transition-all font-semibold ${
              activeTab === 'AUTOMATIONS'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🤖 Reglas Domóticas ({rules.filter((r) => r.enabled).length}/{rules.length})
          </button>
          <button
            onClick={() => setActiveTab('KERNEL')}
            className={`px-3 py-1.5 rounded-lg transition-all font-semibold ${
              activeTab === 'KERNEL'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Kernel & Nube
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: REGLAS DOMÓTICAS (Automatizaciones) */}
      {activeTab === 'AUTOMATIONS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>REGLAS CONFIGURADAS ({rules.length})</span>
            <span className="text-[11px] text-slate-500">
              Las reglas se ejecutan de forma reactiva al emitirse eventos de sensores en el bus
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  rule.enabled
                    ? 'bg-slate-900 border-slate-800 hover:border-cyan-500/40'
                    : 'bg-slate-950/60 border-slate-900 opacity-70'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white">{rule.title}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-cyan-400 border border-slate-800">
                      {rule.badge}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                      rule.enabled
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {rule.enabled ? 'ACTIVA' : 'PAUSADA'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 max-w-2xl">
                    {rule.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-1">
                    <span className="flex items-center space-x-1">
                      <span className="text-slate-500">Disparador:</span>
                      <span className="text-amber-400">{rule.trigger}</span>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center space-x-1">
                      <span className="text-slate-500">Acción:</span>
                      <span className="text-emerald-400">{rule.action}</span>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-500">
                      Ejecuciones: <span className="text-white font-bold">{rule.executionsCount}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <button
                    onClick={() => handleToggleRule(rule.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold font-mono transition-all ${
                      rule.enabled
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900'
                        : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {rule.enabled ? '✓ Activada' : '⏵ Activar Regla'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: CONFIGURACIÓN DE KERNEL & NUBE */}
      {activeTab === 'KERNEL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Scheduler Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                Planificador de Procesos (CPU Scheduler)
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Seleccione el algoritmo de despacho para el CPU virtual de RobotOS
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-2">Algoritmo Activo</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSetAlgorithm(ALGORITMOS?.PRIORIDAD || 'PRIORIDAD')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                        algorithm === (ALGORITMOS?.PRIORIDAD || 'PRIORIDAD') || algorithm === 'PRIORITY'
                          ? 'bg-cyan-950/70 border-cyan-500 text-cyan-300 shadow-sm'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Priority Preemptive
                    </button>
                    <button
                      onClick={() => handleSetAlgorithm(ALGORITMOS?.ROUND_ROBIN || 'ROUND_ROBIN')}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                        algorithm === (ALGORITMOS?.ROUND_ROBIN || 'ROUND_ROBIN')
                          ? 'bg-indigo-950/70 border-indigo-500 text-indigo-300 shadow-sm'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Round Robin
                    </button>
                  </div>
                </div>

                <div className={`transition-opacity ${algorithm === (ALGORITMOS?.ROUND_ROBIN || 'ROUND_ROBIN') ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-300 font-medium">Quantum de Tiempo</label>
                    <span className="text-xs font-mono font-bold text-indigo-400">{quantum} ticks</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    value={quantum}
                    onChange={(e) => handleQuantumChange(e.target.value)}
                    className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                    <span>1 tick</span>
                    <span>4 ticks (default)</span>
                    <span>8 ticks</span>
                    <span>16 ticks</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
              Cambio en caliente sin interrumpir la cola de ejecución.
            </div>
          </div>

          {/* Card 2: Supabase Telemetry & Persistence */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                Persistencia en Supabase
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Estado de sincronización y métricas de telemetría en tiempo real
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <span className="text-xs text-slate-300">Estado de Conexión</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
                    isConfigured
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                      : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                  }`}>
                    {isConfigured ? 'CONECTADO' : 'NO CONFIGURADO (MODO LOCAL)'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Sincronizados</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {syncMetrics?.synced ?? 0}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Pendientes</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">
                      {syncMetrics?.pending ?? 0}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                    <span className="text-[10px] text-slate-400 block">Latencia</span>
                    <span className="text-sm font-bold text-cyan-400 font-mono">
                      {syncMetrics?.lastLatencyMs ?? 0}ms
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleForceSync}
                  disabled={isFlushing || !isConfigured}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {isFlushing ? 'Sincronizando...' : 'Forzar Sincronización (Flush)'}
                </button>

                {flushMessage && (
                  <p className="text-[11px] text-slate-300 bg-slate-800 p-2 rounded border border-slate-700 font-mono">
                    {flushMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
              Tablas destino: 15 tablas activas con políticas RLS origin='sandbox'.
            </div>
          </div>

          {/* Card 3: Security & Session Role */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Seguridad y Control de Acceso (RBAC)
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Contexto del usuario actual y permisos de Syscalls
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div>
                  <span className="text-xs text-slate-300 block font-medium">Rol de Ejecución</span>
                  <span className="text-[11px] text-slate-500">Nivel de privilegios del sistema</span>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded font-bold font-mono ${
                  role === 'ADMIN'
                    ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                    : role === 'USER'
                    ? 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/60'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {role}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 text-xs space-y-1.5 text-slate-300">
                <div className="flex justify-between">
                  <span>Acceso a Hardware Drivers:</span>
                  <span className="text-emerald-400 font-semibold">{role === 'GUEST' ? 'Limitado (Read-Only)' : 'Completo'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Modificación VFS (/system):</span>
                  <span className={role === 'ADMIN' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {role === 'ADMIN' ? 'Permitido' : 'Bloqueado (Exige ADMIN)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Terminar procesos del sistema:</span>
                  <span className={role === 'ADMIN' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {role === 'ADMIN' ? 'Permitido' : 'Bloqueado'}
                  </span>
                </div>
              </div>

              {user && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">Sesión: {user.email || 'Usuario local'}</span>
                  <button
                    onClick={logout}
                    className="text-xs text-rose-400 hover:text-rose-300 underline"
                  >
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: System Information */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Acerca de RobotOS
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Sistema Operativo Simulado para Casas Inteligentes
              </p>

              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Versión:</span>
                  <span className="font-mono text-slate-200 font-semibold">RobotOS 2.4.0 (Fase 11)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Arquitectura:</span>
                  <span className="text-slate-200">Microkernel Domótico Simulado</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Interacción con Hardware:</span>
                  <span className="text-slate-200">Drivers + Syscalls + Event Engine</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Memoria Física:</span>
                  <span className="text-slate-200">1024 MB (64 bloques × 16 MB)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Desarrollo:</span>
                  <span className="text-slate-200">RobotOS Grupo 3</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
              Validado con tests automatizados y persistencia Supabase RLS.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsPage = (props) => {
  return (
    <ErrorBoundary componentName="Automatizaciones & Configuración" onNavigate={props.onNavigate}>
      <SettingsPageContent {...props} />
    </ErrorBoundary>
  );
};
