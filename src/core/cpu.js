// src/core/cpu.js
// Simulación y ejecución de CPU mononúcleo para RobotOS SmartHouse.
// Soporta simulación batch (simular) y avance tick a tick en tiempo real (ejecutarTick).

import { ESTADOS } from './proceso.js';
import { ALGORITMOS, sacarSiguiente } from './scheduler.js';

export function simular(procesos, { algoritmo = ALGORITMOS.PRIORIDAD, quantum = 2 } = {}) {
  if (algoritmo === ALGORITMOS.ROUND_ROBIN) {
    if (!Number.isInteger(quantum) || quantum < 1) {
      throw new Error('El quantum debe ser un número entero mayor o igual a 1');
    }
  }

  // 1) Preparar la cola: solo entran procesos NEW (se admiten) o READY.
  const cola = [];
  const ejecutados = [];
  const omitidos = [];
  for (const p of procesos) {
    if (p.estado === ESTADOS.NEW) {
      p.admitir();
      cola.push(p);
      ejecutados.push(p);
    } else if (p.estado === ESTADOS.READY) {
      cola.push(p);
      ejecutados.push(p);
    } else {
      omitidos.push({ pid: p.pid, nombre: p.nombre, estado: p.estado });
    }
  }

  // 2) Ciclo principal
  const linea = [];
  const finPorPid = new Map();
  let reloj = 0;
  let sumaCpu = 0;

  while (cola.length > 0) {
    const proceso = sacarSiguiente(cola, algoritmo);
    proceso.ejecutar(); // READY -> RUNNING

    const ticks =
      algoritmo === ALGORITMOS.ROUND_ROBIN
        ? Math.min(quantum, proceso.tiempoRestante)
        : proceso.tiempoRestante;

    for (let i = 0; i < ticks; i++) {
      linea.push({ tick: reloj, pid: proceso.pid, nombre: proceso.nombre });
      reloj += 1;
      proceso.tiempoRestante -= 1;
      sumaCpu += proceso.cpuRequerida;
    }

    if (proceso.tiempoRestante === 0) {
      proceso.finalizar(); // RUNNING -> TERMINATED
      finPorPid.set(proceso.pid, reloj);
    } else {
      proceso.expropiar(); // RUNNING -> READY
      cola.push(proceso);
    }
  }

  // 3) Métricas
  const metricas = ejecutados.map((p) => ({
    pid: p.pid,
    nombre: p.nombre,
    prioridad: p.prioridad,
    tiempoTotal: p.tiempoTotal,
    retorno: finPorPid.get(p.pid),
    espera: finPorPid.get(p.pid) - p.tiempoTotal,
  }));

  const usoCpuPromedio = reloj === 0 ? 0 : Math.round((sumaCpu / reloj) * 100) / 100;

  return {
    algoritmo,
    quantum: algoritmo === ALGORITMOS.ROUND_ROBIN ? quantum : null,
    duracionTotal: reloj,
    linea,
    metricas,
    usoCpuPromedio,
    omitidos,
  };
}

export function dibujarLinea(linea) {
  const nombres = new Map();
  for (const t of linea) {
    nombres.set(t.pid, t.nombre);
  }
  const ancho = Math.max(0, ...[...nombres.values()].map((n) => n.length));
  const filas = [];
  for (const [pid, nombre] of nombres) {
    const celdas = linea.map((t) => (t.pid === pid ? '█' : '·')).join('');
    filas.push(`${nombre.padEnd(ancho)} | ${celdas}`);
  }
  return filas.join('\n');
}

/**
 * Ejecuta un único tick de CPU de forma interactiva (para SystemContext).
 * Recibe la lista de procesos actual, el proceso en ejecución, el algoritmo y el quantum restante.
 * Retorna el nuevo estado de los procesos, el proceso en ejecución actual y el uso de CPU instantáneo.
 */
export function ejecutarTickInteractivo({
  procesos,
  algoritmo = ALGORITMOS.PRIORIDAD,
  quantumMax = 2,
  quantumRestanteActual = 2,
  procesoRunningId = null,
  tickActual = 0,
}) {
  const lista = procesos.map((p) => p);
  let running = lista.find((p) => p.id === procesoRunningId || p.estado === ESTADOS.RUNNING);
  let nuevoQuantumRestante = quantumRestanteActual;

  // Si no hay proceso en RUNNING o el que estaba terminó/cambió, buscar el siguiente en READY
  if (!running || running.estado !== ESTADOS.RUNNING) {
    const colaReady = lista.filter((p) => p.estado === ESTADOS.READY);
    if (colaReady.length > 0) {
      running = sacarSiguiente(colaReady, algoritmo);
      if (running) {
        running.ejecutar();
        nuevoQuantumRestante = quantumMax;
      }
    }
  }

  let cpuInstatanea = 0;
  let eventoRegistro = null;

  if (running && running.estado === ESTADOS.RUNNING) {
    cpuInstatanea = running.cpuRequerida || 10;
    running.tiempoRestante = Math.max(0, (running.tiempoRestante ?? running.tiempoTotal) - 1);
    nuevoQuantumRestante -= 1;

    eventoRegistro = {
      tick: tickActual,
      pid: running.pid,
      nombre: running.nombre,
      cpu: cpuInstatanea,
    };

    // Si terminó
    if (running.tiempoRestante === 0) {
      running.finalizar();
      nuevoQuantumRestante = quantumMax;
      running = null; // liberado
    } else if (algoritmo === ALGORITMOS.ROUND_ROBIN && nuevoQuantumRestante <= 0) {
      // Expropiar por agotamiento de quantum
      running.expropiar();
      nuevoQuantumRestante = quantumMax;
      running = null;
    }
  }

  return {
    procesos: lista,
    procesoRunningId: running ? running.id : null,
    quantumRestante: nuevoQuantumRestante,
    cpuInstatanea,
    eventoRegistro,
  };
}
