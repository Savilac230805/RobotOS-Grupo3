// src/core/scheduler.js
// El planificador de CPU (Scheduler) de RobotOS SmartHouse
// Decide a qué proceso le corresponde el turno de CPU.
// Algoritmos soportados: PRIORIDAD y ROUND_ROBIN.

export const ALGORITMOS = Object.freeze({
  PRIORIDAD: 'PRIORIDAD',
  ROUND_ROBIN: 'ROUND_ROBIN',
});

// Regla de PRIORIDAD: gana el número de prioridad MÁS BAJO (1 = más urgente).
// Si hay empate, gana el que se creó antes (pid menor).
export function elegirPorPrioridad(cola) {
  if (cola.length === 0) return null;
  let elegido = cola[0];
  for (const proceso of cola) {
    const masUrgente = proceso.prioridad < elegido.prioridad;
    const empateYLlegoAntes =
      proceso.prioridad === elegido.prioridad && proceso.pid < elegido.pid;
    if (masUrgente || empateYLlegoAntes) {
      elegido = proceso;
    }
  }
  return elegido;
}

// Saca de la cola (lista de procesos READY) al siguiente proceso a ejecutar.
export function sacarSiguiente(cola, algoritmo) {
  if (cola.length === 0) {
    return null;
  }
  if (algoritmo === ALGORITMOS.PRIORIDAD) {
    const elegido = elegirPorPrioridad(cola);
    cola.splice(cola.indexOf(elegido), 1);
    return elegido;
  }
  if (algoritmo === ALGORITMOS.ROUND_ROBIN) {
    return cola.shift(); // FIFO
  }
  throw new Error(`Algoritmo desconocido: ${algoritmo}`);
}
