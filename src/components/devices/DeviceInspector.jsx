import React, { useState } from 'react';
import { driverManager } from '../../core';

export const DeviceInspector = ({
  device,
  processes = [],
  role = 'GUEST',
  onAction = () => {},
  onClose = () => {},
}) => {
  const [feedback, setFeedback] = useState(null);

  if (!device) return null;

  const driver = driverManager.getDriver(device.type);
  const procCheck = driver ? driver.checkProcessState(processes) : { ok: true, processState: 'SYSTEM' };
  const associatedProcess = driver?.associatedProcessName || 'Ninguno';
  const processInstance = processes.find(
    (p) => (p.nombre || p.name) === associatedProcess
  );
  const processState = processInstance ? (processInstance.estado || processInstance.state) : (procCheck.processState || 'N/A');

  const handleActionClick = async (action, payload = {}) => {
    setFeedback(null);
    const res = await onAction(device.id, action, payload);
    if (res && !res.success) {
      setFeedback({ type: 'error', message: res.reason });
    } else {
      setFeedback({ type: 'success', message: `Acción "${action}" ejecutada exitosamente vía ${driver?.name || 'Driver'}.` });
    }
  };

  // Botones de acción específicos según el tipo de dispositivo
  const renderActionButtons = () => {
    switch (device.type) {
      case 'light':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'ON' ? 'TURN_OFF' : 'TURN_ON')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'ON'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800 hover:bg-amber-900'
                  : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              {device.status === 'ON' ? '💡 Apagar Luz' : '💡 Encender Luz'}
            </button>
          </div>
        );

      case 'camera':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'ONLINE' ? 'DISCONNECT' : 'CONNECT')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'ONLINE'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'
                  : 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900'
              }`}
            >
              {device.status === 'ONLINE' ? '📹 Desconectar Stream' : '📹 Activar Stream'}
            </button>
          </div>
        );

      case 'lock':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'BLOQUEADA' ? 'UNLOCK' : 'LOCK')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'BLOQUEADA'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'
                  : 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900'
              }`}
            >
              {device.status === 'BLOQUEADA' ? '🔓 Desbloquear Cerrojo' : '🔒 Asegurar Cerrojo'}
            </button>
          </div>
        );

      case 'garage_door':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'CERRADA' ? 'OPEN' : 'CLOSE')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'CERRADA'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'
                  : 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900'
              }`}
            >
              {device.status === 'CERRADA' ? '🚪 Abrir Garaje' : '🚪 Cerrar Garaje'}
            </button>
          </div>
        );

      case 'climate':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick('CYCLE_TEMP')}
              className="flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 hover:bg-cyan-900 transition-all cursor-pointer"
            >
              🌡️ Ajustar Temperatura (+1.5 °C)
            </button>
          </div>
        );

      case 'motion':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'DETECTADO' ? 'CLEAR_MOTION' : 'SIMULATE_MOTION')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'DETECTADO'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800 hover:bg-amber-900 animate-pulse'
                  : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              {device.status === 'DETECTADO' ? '🚶 Despejar Presencia' : '🚶 Simular Movimiento'}
            </button>
          </div>
        );

      case 'doorbell':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick('PRESS')}
              className="flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-950 transition-all cursor-pointer"
            >
              🔔 Tocar Timbre (Ding Dong)
            </button>
          </div>
        );

      case 'smoke':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'HUMO DETECTADO' ? 'CLEAR_SMOKE' : 'TRIGGER_SMOKE')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'HUMO DETECTADO'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950'
              }`}
            >
              {device.status === 'HUMO DETECTADO' ? '🧯 Normalizar Sensor' : '🔥 Simular Alerta de Humo'}
            </button>
          </div>
        );

      case 'gas':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'FUGA DETECTADA' ? 'CLEAR_GAS' : 'TRIGGER_GAS')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'FUGA DETECTADA'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-950'
              }`}
            >
              {device.status === 'FUGA DETECTADA' ? '✅ Restablecer Válvula Gas' : '⚠️ Simular Fuga de Gas'}
            </button>
          </div>
        );

      case 'garbage_collector':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'LIMPIANDO' ? 'STOP_CLEANING' : 'START_CLEANING')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'LIMPIANDO'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-950'
              }`}
            >
              {device.status === 'LIMPIANDO' ? '🛑 Detener & Estacionar' : '🤖 Iniciar Ciclo de Limpieza'}
            </button>
          </div>
        );

      case 'irrigation':
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleActionClick(device.status === 'REGANDO' ? 'STOP_IRRIGATION' : 'START_IRRIGATION')}
              className={`flex-1 py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                device.status === 'REGANDO'
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950'
              }`}
            >
              {device.status === 'REGANDO' ? '🛑 Cerrar Electroválvula' : '💦 Iniciar Riego Jardín'}
            </button>
          </div>
        );

      default:
        return (
          <button
            onClick={() => handleActionClick('TOGGLE')}
            className="w-full py-2 px-3 rounded-xl font-mono text-xs font-bold bg-slate-800 text-white hover:bg-slate-700"
          >
            Conmutar Estado
          </button>
        );
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
      {/* Cabecera */}
      <div className="flex items-start justify-between border-b border-slate-800/80 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
              {device.zone}
            </span>
            <span className="text-[10px] font-mono text-slate-500">ID: {device.id}</span>
          </div>
          <h3 className="text-base font-bold text-white mt-1">{device.name}</h3>
        </div>

        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          title="Cerrar inspector"
        >
          ✕
        </button>
      </div>

      {/* Cadena Arquitectónica HAL */}
      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2 text-xs font-mono">
        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
          Canalización Hardware (HAL Pipeline)
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-slate-500">Driver Asignado:</span>
            <div className="font-bold text-cyan-400">{driver?.name || 'Genérico'}</div>
          </div>
          <div>
            <span className="text-slate-500">Proceso Controlador:</span>
            <div className="font-bold text-purple-400">{associatedProcess}</div>
          </div>
          <div>
            <span className="text-slate-500">Estado del Proceso:</span>
            <div className="font-bold">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  processState === 'RUNNING' || processState === 'READY'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                    : 'bg-red-950 text-red-400 border border-red-800/60 animate-pulse'
                }`}
              >
                {processState}
              </span>
            </div>
          </div>
          <div>
            <span className="text-slate-500">Estado Operativo:</span>
            <div className="font-bold">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  procCheck.ok
                    ? 'bg-emerald-950 text-emerald-400'
                    : 'bg-red-950 text-red-400'
                }`}
              >
                {procCheck.ok ? '✔ ACTIVO' : '✖ INHIBIDO'}
              </span>
            </div>
          </div>
        </div>

        {/* Advertencia si el proceso está bloqueado o terminado */}
        {!procCheck.ok && (
          <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/80 text-[11px] text-red-200 space-y-1">
            <strong className="font-bold">Inhibición por Regla Fundamental:</strong>
            <p>{procCheck.reason}</p>
          </div>
        )}
      </div>

      {/* Estado Actual */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
        <span className="text-xs font-mono text-slate-400 uppercase">Estado en Bus</span>
        <span className="text-sm font-bold font-mono text-white">{device.status}</span>
      </div>

      {/* Feedback de la acción */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-mono font-medium ${
            feedback.type === 'error'
              ? 'bg-red-950/60 border border-red-800 text-red-300'
              : 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Acciones */}
      <div className="space-y-1.5">
        <label className="block text-[10px] font-mono uppercase text-slate-400">
          Comandos Directos al Driver
        </label>
        {renderActionButtons()}
      </div>
    </div>
  );
};
