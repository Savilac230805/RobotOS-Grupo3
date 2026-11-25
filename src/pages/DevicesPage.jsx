import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { SmartHouseView } from '../components/devices/SmartHouseView';
import { DeviceInspector } from '../components/devices/DeviceInspector';
import { driverManager } from '../core';

export const DevicesPage = () => {
  const { devices, processes, executeDeviceAction, addLog, driversTelemetry } = useSystem();
  const { role, checkPermission } = useAuth();

  // Pestañas obligatorias: Vista Casa Interactiva vs Vista Lista
  const [activeTab, setActiveTab] = useState('blueprint'); // 'blueprint' | 'list'
  const [selectedDeviceId, setSelectedDeviceId] = useState('d1');

  const isGuest = role === 'GUEST';
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || null;

  const handleDeviceAction = async (deviceId, action, payload = {}) => {
    const dev = devices.find((d) => d.id === deviceId);
    if (!dev) return { success: false, reason: 'Dispositivo no encontrado' };

    // Si es GUEST y el dispositivo es perimetral/seguridad, interceptar con checkPermission
    if (
      isGuest &&
      (!dev.isCommonArea || dev.type === 'lock' || dev.type === 'camera' || dev.type === 'garage_door')
    ) {
      let allowed = false;
      checkPermission(
        'USER',
        `Operación en periférico de seguridad/restringido "${dev.name}" (${dev.zone})`,
        addLog
      );
      return { success: false, reason: 'Acceso denegado: requiere rol USER o ADMIN' };
    }

    return executeDeviceAction(deviceId, action, payload);
  };

  const getDeviceIcon = (type) => {
    switch (type) {
      case 'light': return '💡';
      case 'motion': return '🚶';
      case 'camera': return '📹';
      case 'lock': return '🔒';
      case 'climate': return '🌡️';
      case 'smoke': return '🔥';
      case 'gas': return '⚠️';
      case 'doorbell': return '🔔';
      case 'garbage_collector': return '🤖';
      case 'irrigation': return '💦';
      case 'garage_door': return '🚪';
      default: return '🔌';
    }
  };

  const getButtonLabel = (dev) => {
    if (dev.type === 'motion') return dev.status === 'DETECTADO' ? 'Despejar' : 'Simular Movimiento';
    if (dev.type === 'climate') return 'Ajustar °C';
    if (dev.type === 'lock') return dev.status === 'BLOQUEADA' ? 'Desbloquear' : 'Bloquear';
    if (dev.type === 'garage_door') return dev.status === 'CERRADA' ? 'Abrir Portón' : 'Cerrar Portón';
    if (dev.type === 'camera') return dev.status === 'ONLINE' ? 'Desconectar' : 'Conectar';
    if (dev.type === 'doorbell') return 'Tocar Timbre';
    if (dev.type === 'smoke') return dev.status === 'HUMO DETECTADO' ? 'Normalizar' : 'Alerta Humo';
    if (dev.type === 'gas') return dev.status === 'FUGA DETECTADA' ? 'Normalizar' : 'Alerta Gas';
    if (dev.type === 'garbage_collector') return dev.status === 'LIMPIANDO' ? 'Estacionar' : 'Iniciar Limpieza';
    if (dev.type === 'irrigation') return dev.status === 'REGANDO' ? 'Cerrar Riego' : 'Iniciar Riego';
    return dev.status === 'ON' ? 'Apagar' : 'Encender';
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y Selector de Vistas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Dispositivos & Hardware Drivers (HAL)</h2>
          <p className="text-xs text-slate-400">
            Control interactivo de actuadores y sensores a través del pipeline formal: <code className="text-cyan-400">Proceso → Syscall → Driver → Dispositivo → Event Engine → Supabase</code>.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Pestañas: Casa Interactiva vs Vista Lista */}
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('blueprint')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'blueprint'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🏛️ Vista Casa Interactiva
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📋 Vista Lista (Tarjetas)
            </button>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
            Rol: <span className="font-bold uppercase text-white">{role}</span>
          </div>
        </div>
      </div>

      {isGuest && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 text-xs text-amber-200">
          <strong>Aviso de seguridad para Invitados:</strong> Tienes acceso a interactuar con los dispositivos de área común. Los periféricos de seguridad (Cerraduras, Garaje y Cámaras) o fuera de Salón y Cocina están protegidos por políticas RBAC y registrarán cualquier intento de activación no autorizado.
        </div>
      )}

      {/* CONTENIDO PRINCIPAL: CASA INTERACTIVA O LISTA DE TARJETAS */}
      {activeTab === 'blueprint' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plano 2D SVG Interactivo */}
          <div className="lg:col-span-2">
            <SmartHouseView
              devices={devices}
              processes={processes}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={(dev) => setSelectedDeviceId(dev?.id || null)}
              onAction={handleDeviceAction}
            />
          </div>

          {/* Inspector Lateral de Dispositivo & Driver */}
          <div className="lg:col-span-1 space-y-4">
            {selectedDevice ? (
              <DeviceInspector
                device={selectedDevice}
                processes={processes}
                role={role}
                onAction={handleDeviceAction}
                onClose={() => setSelectedDeviceId(null)}
              />
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs font-mono space-y-2">
                <div className="text-3xl">🔍</div>
                <div className="font-bold text-white">Ningún dispositivo seleccionado</div>
                <p>Haz clic sobre cualquier actuador o sensor en el plano 2D para ver su telemetría y driver.</p>
              </div>
            )}

            {/* Resumen rápido de drivers cargados */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs font-mono space-y-2">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Módulos de Driver Registrados (HAL)
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {driverManager.getAllDrivers().map((drv) => {
                  const check = drv.checkProcessState(processes);
                  return (
                    <div
                      key={drv.id}
                      className={`p-1.5 rounded-lg border ${
                        check.ok
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-red-950/40 border-red-800/80 text-red-300 animate-pulse'
                      }`}
                      title={check.ok ? `Controlador: ${drv.associatedProcessName}` : check.reason}
                    >
                      <div className="font-bold truncate">{drv.name}</div>
                      <div className="text-[9px] text-slate-500 truncate">{drv.associatedProcessName}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* VISTA LISTA (TARJETAS TRADICIONALES AMPLIADAS) */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((dev) => {
              const driver = driverManager.getDriver(dev.type);
              const procCheck = driver ? driver.checkProcessState(processes) : { ok: true };
              const isSelected = selectedDeviceId === dev.id;

              return (
                <div
                  key={dev.id}
                  onClick={() => setSelectedDeviceId(dev.id)}
                  className={`p-5 rounded-2xl bg-slate-900 border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-cyan-500 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500'
                      : 'border-slate-800 hover:border-slate-700 shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {dev.zone}
                        </span>
                        {dev.isCommonArea && (
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                            Área común
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white mt-2">{dev.name}</h3>
                      <div className="flex items-center space-x-2 mt-0.5 text-xs text-slate-400">
                        <span>Driver: <strong className="text-cyan-400 font-mono">{driver?.name || 'N/A'}</strong></span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-lg">
                      {getDeviceIcon(dev.type)}
                    </div>
                  </div>

                  {/* Estado del proceso asociado */}
                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-500">Proceso: {driver?.associatedProcessName}</span>
                    <span
                      className={`font-bold ${
                        procCheck.ok ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {procCheck.ok ? '✔ ACTIVO' : '✖ INHIBIDO'}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase">Estado Actual</div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {dev.status}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeviceAction(dev.id, 'TOGGLE');
                      }}
                      className={`text-xs font-mono font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                        dev.status === 'ON' || dev.status === 'BLOQUEADA' || dev.status === 'ONLINE' || dev.status === 'REGANDO' || dev.status === 'LIMPIANDO'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800/80 hover:bg-emerald-900/60 shadow-lg shadow-emerald-950/40'
                          : dev.status === 'DETECTADO' || dev.status === 'TIMBRANDO'
                          ? 'bg-amber-950 text-amber-400 border-amber-800/80 hover:bg-amber-900/60 animate-pulse'
                          : dev.status === 'OFFLINE' || dev.status === 'HUMO DETECTADO' || dev.status === 'FUGA DETECTADA'
                          ? 'bg-red-950 text-red-400 border-red-800/80 hover:bg-red-900/60 animate-pulse'
                          : dev.type === 'climate'
                          ? 'bg-cyan-950 text-cyan-400 border-cyan-800/80 hover:bg-cyan-900/60'
                          : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                      }`}
                      title={
                        isGuest && (!dev.isCommonArea || dev.type === 'lock' || dev.type === 'camera')
                          ? 'Acción restringida: requiere autorización'
                          : 'Ejecutar comando en driver'
                      }
                    >
                      {getButtonLabel(dev)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CONSOLA DE HARDWARE Y TELEMETRÍA DE DRIVERS (HAL) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Consola del Hardware Abstraction Layer (HAL)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Auditoría en tiempo real de la correspondencia entre Procesos, Drivers y Actuadores físicos.
            </p>
          </div>
          <span className="text-[11px] font-mono text-cyan-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
            11 Drivers Cargados en Memoria
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase text-[10px]">
                <th className="py-2 px-3">Driver</th>
                <th className="py-2 px-3">Tipo Dispositivo</th>
                <th className="py-2 px-3">Proceso Controlador</th>
                <th className="py-2 px-3">Estado Proceso</th>
                <th className="py-2 px-3">Estado HAL</th>
                <th className="py-2 px-3">Dispositivos Vinculados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {driverManager.getAllDrivers().map((drv) => {
                const check = drv.checkProcessState(processes);
                const linked = devices.filter((d) => d.type === drv.type);

                return (
                  <tr key={drv.id} className="hover:bg-slate-950/40">
                    <td className="py-2 px-3 font-bold text-white">{drv.name}</td>
                    <td className="py-2 px-3 text-cyan-400">{drv.type}</td>
                    <td className="py-2 px-3 text-purple-400">{drv.associatedProcessName}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          check.ok
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-red-950 text-red-400 border border-red-800/60'
                        }`}
                      >
                        {check.processState}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`font-bold ${
                          check.ok ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {check.ok ? '✔ OPERATIVO' : '✖ INHIBIDO'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      {linked.map((d) => `${d.id} (${d.zone})`).join(', ') || 'Ninguno'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
