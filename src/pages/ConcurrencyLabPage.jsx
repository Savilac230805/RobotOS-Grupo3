import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { systemMutex, systemSemaphore, systemIPC, deadlockDetector } from '../core/concurrency';

export const ConcurrencyLabPage = () => {
  const { processes, addLog } = useSystem();

  // Estados de Mutex y Semáforo
  const [mutexState, setMutexState] = useState(systemMutex.getState());
  const [semState, setSemState] = useState(systemSemaphore.getState());
  const [selectedPid, setSelectedPid] = useState(processes[0]?.pid || 1);

  // Estados de IPC
  const [ipcMessages, setIpcMessages] = useState(systemIPC.getSnapshot());
  const [senderPid, setSenderPid] = useState(processes[0]?.pid || 1);
  const [receiverPid, setReceiverPid] = useState(processes[1]?.pid || 2);
  const [msgPayload, setMsgPayload] = useState('');

  // Estados de Deadlock Lab
  const [deadlockReport, setDeadlockReport] = useState(deadlockDetector.detectDeadlock());
  const [ragSnapshot, setRagSnapshot] = useState(deadlockDetector.getSnapshot());

  const refreshAll = () => {
    setMutexState(systemMutex.getState());
    setSemState(systemSemaphore.getState());
    setIpcMessages(systemIPC.getSnapshot());
    setDeadlockReport(deadlockDetector.detectDeadlock());
    setRagSnapshot(deadlockDetector.getSnapshot());
  };

  // Acciones Mutex
  const handleAcquireMutex = (pid) => {
    const granted = systemMutex.acquire(pid);
    addLog({
      level: 'INFO',
      source: 'MUTEX',
      message: granted
        ? `PID ${pid} adquirió con éxito el Mutex "${systemMutex.name}".`
        : `PID ${pid} no pudo adquirir el Mutex "${systemMutex.name}" (en cola de espera).`,
    });
    refreshAll();
  };

  const handleReleaseMutex = (pid) => {
    try {
      const nextPid = systemMutex.release(pid);
      addLog({
        level: 'INFO',
        source: 'MUTEX',
        message: nextPid
          ? `PID ${pid} liberó el Mutex. Concedido al siguiente en espera: PID ${nextPid}.`
          : `PID ${pid} liberó el Mutex (ahora libre).`,
      });
      refreshAll();
    } catch (err) {
      addLog({ level: 'ERROR', source: 'MUTEX', message: err.message });
      alert(err.message);
    }
  };

  // Acciones Semáforo
  const handleSemWait = (pid) => {
    const granted = systemSemaphore.wait(pid);
    addLog({
      level: 'INFO',
      source: 'SEMAPHORE',
      message: granted
        ? `PID ${pid} decrementó Semáforo "${systemSemaphore.name}" (Count: ${systemSemaphore.count}).`
        : `PID ${pid} bloqueado en Semáforo "${systemSemaphore.name}" (en cola).`,
    });
    refreshAll();
  };

  const handleSemSignal = (pid) => {
    const unblocked = systemSemaphore.signal(pid);
    addLog({
      level: 'INFO',
      source: 'SEMAPHORE',
      message: unblocked
        ? `Signal emitido: Proceso PID ${unblocked} desbloqueado de la cola.`
        : `Signal emitido: Contador incrementado a ${systemSemaphore.count}.`,
    });
    refreshAll();
  };

  // Acciones IPC
  const handleSendIPC = (e) => {
    e.preventDefault();
    if (!msgPayload.trim()) return;
    try {
      systemIPC.send(Number(senderPid), Number(receiverPid), msgPayload.trim());
      addLog({
        level: 'INFO',
        source: 'IPC',
        message: `Mensaje enviado de PID ${senderPid} a PID ${receiverPid}: "${msgPayload.trim()}"`,
      });
      setMsgPayload('');
      refreshAll();
    } catch (err) {
      addLog({ level: 'ERROR', source: 'IPC', message: err.message });
      alert(err.message);
    }
  };

  const handleReceiveIPC = (recvPid) => {
    const msg = systemIPC.receive(Number(recvPid));
    if (msg) {
      addLog({
        level: 'INFO',
        source: 'IPC',
        message: `PID ${recvPid} consumió mensaje de PID ${msg.senderPid}: "${msg.payload}"`,
      });
    } else {
      alert(`No hay mensajes pendientes en la cola para PID ${recvPid}.`);
    }
    refreshAll();
  };

  // Simulación de Deadlock
  const handleSimulateDeadlock = () => {
    deadlockDetector.clear();
    // P1 (1) tiene R1 y pide R2
    // P2 (2) tiene R2 y pide R1 -> Espera circular
    deadlockDetector.requestResource(1, 'R1_Bus_I2C');
    deadlockDetector.requestResource(2, 'R2_DMA_Buffer');
    deadlockDetector.requestResource(1, 'R2_DMA_Buffer'); // P1 se bloquea esperando R2
    deadlockDetector.requestResource(2, 'R1_Bus_I2C');   // P2 se bloquea esperando R1 (DEADLOCK!)

    addLog({
      level: 'CRITICAL',
      source: 'DEADLOCK_SIM',
      message: 'Simulación de interbloqueo circular generada: P1 retiene R1 y espera R2; P2 retiene R2 y espera R1.',
    });
    refreshAll();
  };

  const handleResetDeadlock = () => {
    deadlockDetector.clear();
    addLog({
      level: 'INFO',
      source: 'DEADLOCK_SIM',
      message: 'Grafo de asignación de recursos limpiado.',
    });
    refreshAll();
  };

  const handleResolveDeadlock = () => {
    if (!deadlockReport.recommendedVictimPid) return;
    const victim = deadlockReport.recommendedVictimPid;
    deadlockDetector.resolveDeadlock(victim);
    addLog({
      level: 'INFO',
      source: 'DEADLOCK_RESOLVER',
      message: `Interbloqueo resuelto: Proceso víctima PID ${victim} abortado/recursos liberados.`,
    });
    refreshAll();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span className="text-amber-400">⚡</span>
          Laboratorio de Concurrencia, IPC y Detección de Deadlocks
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Primitivas reales de sincronización de procesos: Mutex, Semáforos contadores, Mensajería IPC y Grafo RAG de Interbloqueos
        </p>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Mutex & Semaphores */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            1. Exclusión Mutua (Mutex) y Semáforo
          </h2>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Proceso Actuante:</span>
            <select
              value={selectedPid}
              onChange={(e) => setSelectedPid(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 outline-none font-mono"
            >
              {processes.map((p) => (
                <option key={p.pid} value={p.pid}>
                  PID {p.pid} — {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Mutex Card */}
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Mutex: {mutexState.name}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  mutexState.locked
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {mutexState.locked ? `BLOQUEADO (Dueño: PID ${mutexState.ownerPid})` : 'LIBRE'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Cola de Espera: {mutexState.waitingQueue.length > 0 ? mutexState.waitingQueue.join(', ') : 'Vacía'}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleAcquireMutex(selectedPid)}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold"
              >
                Acquire (PID {selectedPid})
              </button>
              <button
                onClick={() => handleReleaseMutex(selectedPid)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-semibold"
              >
                Release (PID {selectedPid})
              </button>
            </div>
          </div>

          {/* Semaphore Card */}
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Semáforo: {semState.name}</span>
              <span className="text-xs font-mono font-bold text-indigo-400">
                Disponibles: {semState.count} / {semState.initialCount}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Procesos Bloqueados en Cola: {semState.waitingQueue.length > 0 ? semState.waitingQueue.join(', ') : 'Ninguno'}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleSemWait(selectedPid)}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
              >
                Wait / P() (PID {selectedPid})
              </button>
              <button
                onClick={() => handleSemSignal(selectedPid)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-semibold"
              >
                Signal / V()
              </button>
            </div>
          </div>
        </div>

        {/* Panel 2: IPC Message Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              2. Comunicación Entre Procesos (IPC Message Queue)
            </h2>

            <form onSubmit={handleSendIPC} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Emisor (PID):</label>
                  <select
                    value={senderPid}
                    onChange={(e) => setSenderPid(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded p-1.5 font-mono"
                  >
                    {processes.map((p) => (
                      <option key={p.pid} value={p.pid}>PID {p.pid} ({p.nombre})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Receptor (PID):</label>
                  <select
                    value={receiverPid}
                    onChange={(e) => setReceiverPid(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded p-1.5 font-mono"
                  >
                    {processes.map((p) => (
                      <option key={p.pid} value={p.pid}>PID {p.pid} ({p.nombre})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Mensaje IPC (ej: START_CLEANING_CYCLE)..."
                  value={msgPayload}
                  onChange={(e) => setMsgPayload(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                >
                  Enviar Mensaje IPC
                </button>
                <button
                  type="button"
                  onClick={() => handleReceiveIPC(receiverPid)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded text-xs font-semibold"
                >
                  Consumir (PID {receiverPid})
                </button>
              </div>
            </form>
          </div>

          {/* Pending Messages List */}
          <div className="border-t border-slate-800 pt-3">
            <span className="text-[11px] text-slate-400 block mb-1">
              Buzón de Mensajes en Tránsito ({ipcMessages.length}):
            </span>
            <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px]">
              {ipcMessages.length === 0 ? (
                <span className="text-slate-500 italic">No hay mensajes en el bus IPC.</span>
              ) : (
                ipcMessages.map((m) => (
                  <div key={m.id} className="p-1.5 bg-slate-950 rounded border border-slate-800/80 flex justify-between">
                    <span className="text-cyan-400">P{m.senderPid} → P{m.receiverPid}:</span>
                    <span className="text-slate-200 truncate ml-2">"{m.payload}"</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Panel 3: Deadlock Detection & Resource Allocation Graph (RAG) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${deadlockReport.hasDeadlock ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`}></span>
              3. Laboratorio y Detección Automática de Deadlocks (RAG)
            </h2>
            <p className="text-xs text-slate-400">
              Análisis determinista de ciclos de espera circular de Coffman en el grafo de recursos
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSimulateDeadlock}
              className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold"
            >
              Simular Deadlock (Coffman)
            </button>
            <button
              onClick={handleResetDeadlock}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold"
            >
              Limpiar RAG
            </button>
          </div>
        </div>

        {/* Diagnosis Status Box */}
        <div
          className={`p-4 rounded-xl border ${
            deadlockReport.hasDeadlock
              ? 'bg-rose-950/40 border-rose-800/70 text-rose-200'
              : 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between font-bold text-xs uppercase mb-1">
            <span>Diagnóstico del Kernel:</span>
            <span>{deadlockReport.hasDeadlock ? 'CRÍTICO: INTERBLOQUEO DETECTADO' : 'SISTEMA SEGURO (SIN CICLOS)'}</span>
          </div>
          <p className="text-xs">{deadlockReport.recommendation}</p>

          {deadlockReport.hasDeadlock && (
            <div className="mt-3 pt-3 border-t border-rose-800/40 flex items-center justify-between">
              <span className="text-xs font-mono text-rose-300">
                Ciclo: {deadlockReport.cycle.join(' ➔ ')}
              </span>
              <button
                onClick={handleResolveDeadlock}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow"
              >
                Resolver Interbloqueo (Abortar Víctima PID {deadlockReport.recommendedVictimPid})
              </button>
            </div>
          )}
        </div>

        {/* Resource Allocation Graph (RAG) State */}
        <div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Estado de Recursos del Grafo (RAG):
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ragSnapshot.length === 0 ? (
              <div className="col-span-3 text-center py-6 text-slate-500 text-xs italic">
                El grafo está libre de solicitudes activas.
              </div>
            ) : (
              ragSnapshot.map((res) => (
                <div key={res.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="text-indigo-300">📦 {res.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{res.id}</span>
                  </div>
                  <div className="text-slate-300">
                    Retenido por: <span className="font-mono text-cyan-400 font-bold">{res.heldBy ? `PID ${res.heldBy}` : 'Nadie (Libre)'}</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    En espera: {res.waitingPids.length > 0 ? res.waitingPids.map((p) => `PID ${p}`).join(', ') : 'Ninguno'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
