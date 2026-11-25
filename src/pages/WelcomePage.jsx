import React from 'react';
import { useAuth } from '../context/AuthContext';

export const WelcomePage = ({ onNavigate }) => {
  const { user, role } = useAuth();

  const capabilities = [
    {
      title: 'Gestión de Procesos',
      desc: 'Planificación de CPU por Prioridad y Round Robin con cola multinivel y quantum configurable.',
      icon: '⚙️',
      badge: 'Fase 02',
    },
    {
      title: 'Administración de Memoria',
      desc: 'Memoria física paginada, paginación virtual con FIFO y LRU, detección y resolución de Page Faults.',
      icon: '🧠',
      badge: 'Fase 03',
    },
    {
      title: 'Concurrencia & IPC',
      desc: 'Sincronización por Mutex y Semáforos contadores, colas de mensajes IPC deterministas y detección RAG de deadlocks.',
      icon: '🔄',
      badge: 'Fase 07',
    },
    {
      title: 'Digital Twin Domótico',
      desc: 'Gemelo digital 2D en tiempo real sincronizado con daemons de iluminación, vigilancia y sensores.',
      icon: '🏛️',
      badge: 'Fase 08',
    },
    {
      title: 'Fault Injection Engine',
      desc: 'Inyección reproducible con semilla pseudoaleatoria de fallos en procesos, memoria, red y hardware.',
      icon: '⚡',
      badge: 'Fase 09',
    },
    {
      title: 'Benchmark Center',
      desc: 'Evaluación comparativa rigurosa con métricas deterministas de latencia, throughput y page fault ratio.',
      icon: '📊',
      badge: 'Fase 10',
    },
  ];

  const getRoleBadge = () => {
    switch (role) {
      case 'ADMIN':
        return {
          label: 'ROL: ADMINISTRADOR (Acceso Total)',
          style: 'bg-purple-950/80 text-purple-300 border-purple-700',
          desc: 'Tienes control absoluto sobre procesos, configuración, auditoría avanzada, fallos y benchmarks.',
        };
      case 'USER':
        return {
          label: 'ROL: USUARIO / RESIDENTE (Operativo)',
          style: 'bg-cyan-950/80 text-cyan-300 border-cyan-700',
          desc: 'Tienes acceso a la operación de dispositivos, terminal, monitor de recursos y diagnóstico.',
        };
      case 'GUEST':
      default:
        return {
          label: 'ROL: INVITADO (Solo Lectura)',
          style: 'bg-amber-950/80 text-amber-300 border-amber-700',
          desc: 'Acceso de visualización a telemetría y gemelo digital. Las acciones de modificación están protegidas.',
        };
    }
  };

  const roleInfo = getRoleBadge();

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-10">
      {/* Banner Principal / Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 p-8 md:p-12 shadow-2xl">
        <div className="relative z-10 space-y-6 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/80 text-cyan-400 text-xs font-mono">
            <span>✨</span>
            <span>RobotOS SmartHouse Platform v2.4</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
              RobotOS
            </h1>
            <p className="text-lg md:text-xl font-medium text-cyan-400">
              Sistema Operativo para Hogares Inteligentes
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              Plataforma integral de simulación de sistemas operativos aplicada a la domótica.
              Combina un microkernel en tiempo real, gestión avanzada de memoria, concurrencia,
              gemelo digital interactivo y persistencia híbrida.
            </p>
          </div>

          {/* Saludo por Rol */}
          <div className={`p-4 rounded-2xl border ${roleInfo.style} space-y-1`}>
            <div className="text-xs font-bold font-mono tracking-wider">{roleInfo.label}</div>
            <p className="text-xs opacity-90">
              Hola, <span className="font-semibold text-white">{user?.name || 'Usuario'}</span>. {roleInfo.desc}
            </p>
          </div>

          {/* CTA Principal */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-2"
            >
              <span>Entrar al Sistema</span>
              <span>→</span>
            </button>

            <button
              onClick={() => onNavigate('devices')}
              className="px-6 py-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white font-medium text-sm transition-all flex items-center space-x-2"
            >
              <span>🏛️ Ver Gemelo Digital</span>
            </button>
          </div>
        </div>

        {/* Decoración de fondo */}
        <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Capacidades del Sistema */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Capacidades Validadas del Kernel</h2>
            <p className="text-xs text-slate-400">Arquitectura de microkernel con módulos auditados e integrados</p>
          </div>
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2.5 py-1 rounded-lg border border-cyan-800/60">
            6/6 Módulos Activos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl p-2 rounded-xl bg-slate-950 border border-slate-800 group-hover:border-cyan-500/40 transition-all">
                  {cap.icon}
                </span>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {cap.badge}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                  {cap.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {cap.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tarjeta de Inicio Rápido */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h4 className="text-sm font-bold text-white">¿Listo para comenzar a operar?</h4>
          <p className="text-xs text-slate-400">
            Navega directamente al Dashboard para supervisar telemetría en tiempo real o explora el menú lateral.
          </p>
        </div>
        <button
          onClick={() => onNavigate('dashboard')}
          className="shrink-0 px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition-all"
        >
          Ir al Dashboard →
        </button>
      </div>
    </div>
  );
};
