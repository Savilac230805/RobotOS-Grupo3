// src/core/cpu.js
// Simulación y ejecución de CPU mononúcleo para RobotOS SmartHouse.
//  - simular(): simulación por lotes (todos los procesos llegan en el tick 0).
//  - ejecutarTickInteractivo(): avance tick a tick en vivo, con cola READY real,
//    eventos de cambio de estado y detección de cambios de contexto.
//  - calcularMetricas(): espera, retorno, respuesta, utilización y cambios de contexto
//    a partir del registro REAL de ejecución (nada se escribe a mano).
//
// Convención de ticks: el tick N ocupa el intervalo [N, N+1). El primer tick es el 0.

import { ESTADOS } from './proceso.js';
import { ALGORITMOS, sacarSiguiente } from './scheduler.js';

const redondear = (n, decimales = 2) => {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};

// ==========================================
// SIMULACIÓN POR LOTES (sin cambios de comportamiento)
// ==========================================
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
  const metricasDetalladas = calcularMetricas({
    procesos: ejecutados,
    linea,
    ticksTotales: reloj,
  });

  return {
    algoritmo,
    quantum: algoritmo === ALGORITMOS.ROUND_ROBIN ? quantum : null,
    duracionTotal: reloj,
    linea,
    metricas,
    usoCpuPromedio,
    metricasDetalladas: metricasDetalladas.filas,
    resumenMetricas: metricasDetalladas.resumen,
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

// ==========================================
// CUENTA DE CAMBIOS DE CONTEXTO
// Un cambio de contexto ocurre cuando el proceso que usa la CPU es distinto
// del que la usó en el tick anterior.
// ==========================================
function contarCambiosContexto(linea) {
  const ordenada = [...linea].sort((a, b) => a.tick - b.tick);
  let cambios = 0;
  for (let i = 1; i < ordenada.length; i++) {
    if (ordenada[i].pid !== ordenada[i - 1].pid) cambios += 1;
  }
  return cambios;
}

// ==========================================
// MÉTRICAS CALCULADAS A PARTIR DEL REGISTRO DE EJECUCIÓN
//  linea: [{ tick, pid }]   (un elemento por tick en que la CPU estuvo ocupada)
//  procesos: instancias de Proceso (se lee tickLlegada si existe; si no, 0)
//  ticksTotales: ticks transcurridos en total (incluye ticks ociosos)
//
//  retorno   = tick en que termina - tick de llegada
//  espera    = retorno - ticks que usó la CPU
//  respuesta = tick de su primera ejecución - tick de llegada
// ==========================================
export function calcularMetricas({ procesos = [], linea = [], ticksTotales = 0 } = {}) {
  const porPid = new Map();
  for (const t of linea) {
    const reg = porPid.get(t.pid) || { usados: 0, primero: t.tick, ultimo: t.tick };
    reg.usados += 1;
    reg.primero = Math.min(reg.primero, t.tick);
    reg.ultimo = Math.max(reg.ultimo, t.tick);
    porPid.set(t.pid, reg);
  }

  const cpuPorPid = new Map(procesos.map((p) => [p.pid, p.cpuRequerida || 0]));
  let sumaCarga = 0;
  for (const t of linea) sumaCarga += cpuPorPid.get(t.pid) ?? 0;

  const participantes = procesos.filter((p) => porPid.has(p.pid) || Number.isFinite(p.tickLlegada));

  const filas = participantes.map((p) => {
    const llegada = Number.isFinite(p.tickLlegada) ? p.tickLlegada : 0;
    const reg = porPid.get(p.pid) || null;
    const usados = reg ? reg.usados : 0;
    const completado = !!reg && p.estado === ESTADOS.TERMINATED && p.tiempoRestante === 0;

    const retorno = completado ? reg.ultimo + 1 - llegada : null;
    // Si aún no termina, se informa la espera acumulada hasta ahora
    const espera = completado ? retorno - usados : Math.max(0, ticksTotales - llegada - usados);
    const respuesta = reg ? reg.primero - llegada : null;

    return {
      pid: p.pid,
      nombre: p.nombre,
      prioridad: p.prioridad,
      estado: p.estado,
      llegada,
      tiempoTotal: p.tiempoTotal,
      usados,
      primeraEjecucion: reg ? reg.primero : null,
      respuesta,
      retorno,
      espera,
      completado,
    };
  });

  const promedio = (valores) =>
    valores.length === 0 ? null : redondear(valores.reduce((a, b) => a + b, 0) / valores.length);

  const completados = filas.filter((f) => f.completado);

  const resumen = {
    ticksTotales,
    ticksOcupados: linea.length,
    utilizacionCpu: ticksTotales > 0 ? redondear((linea.length / ticksTotales) * 100) : 0,
    cargaPromedio: ticksTotales > 0 ? redondear(sumaCarga / ticksTotales) : 0,
    cambiosContexto: contarCambiosContexto(linea),
    procesosCompletados: completados.length,
    throughput: ticksTotales > 0 ? redondear(completados.length / ticksTotales, 3) : 0,
    esperaPromedio: promedio(completados.map((f) => f.espera)),
    retornoPromedio: promedio(completados.map((f) => f.retorno)),
    respuestaPromedio: promedio(filas.filter((f) => f.respuesta !== null).map((f) => f.respuesta)),
  };

  return { filas, resumen };
}

// ==========================================
// TICK INTERACTIVO (SystemContext)
//
// Recibe el estado actual y avanza EXACTAMENTE un tick. Devuelve:
//   procesos, procesoRunningId, quantumRestante, cpuInstatanea,
//   eventoRegistro  -> { tick, pid, nombre, cpu } o null si la CPU estuvo ociosa
//   cambios         -> cambios de estado ocurridos en este tick
//                      [{ pid, nombre, de, a, motivo: 'DESPACHO' | 'TERMINO' | 'QUANTUM' }]
//   cambioContexto  -> { desde, hacia } o null
//   colaListos      -> procesos READY en el orden en que serán atendidos
//
// Round Robin usa una cola READY real: al agotar su quantum, el proceso pasa al
// FINAL de la cola (propiedad ordenListo) y no vuelve a ser elegido antes que los demás.
// Los procesos NEW deben admitirse ANTES de llamar (lo hace SystemContext).
// ==========================================
function siguienteOrden(lista) {
  return lista.reduce((m, p) => (Number.isFinite(p.ordenListo) ? Math.max(m, p.ordenListo) : m), 0) + 1;
}

function ordenarCola(listos, algoritmo) {
  const copia = [...listos];
  if (algoritmo === ALGORITMOS.ROUND_ROBIN) {
    copia.sort((a, b) => {
      const oa = Number.isFinite(a.ordenListo) ? a.ordenListo : Infinity;
      const ob = Number.isFinite(b.ordenListo) ? b.ordenListo : Infinity;
      return oa === ob ? a.pid - b.pid : oa - ob;
    });
  } else {
    copia.sort((a, b) => (a.prioridad === b.prioridad ? a.pid - b.pid : a.prioridad - b.prioridad));
  }
  return copia;
}

export function ejecutarTickInteractivo({
  procesos,
  algoritmo = ALGORITMOS.PRIORIDAD,
  quantumMax = 2,
  quantumRestanteActual = 2,
  procesoRunningId = null,
  tickActual = 0,
  ultimoPid = null,
}) {
  const lista = procesos.map((p) => p);
  const cambios = [];
  const inicioTick = Math.max(0, tickActual - 1); // este tick ocupa [inicioTick, tickActual)

  // 1) Llegada y posición en la cola READY (en orden de pid para que sea determinista)
  let orden = siguienteOrden(lista);
  for (const p of [...lista].sort((a, b) => a.pid - b.pid)) {
    if (p.estado !== ESTADOS.NEW && p.estado !== ESTADOS.TERMINATED && !Number.isFinite(p.tickLlegada)) {
      p.tickLlegada = inicioTick;
    }
    if (p.estado === ESTADOS.READY) {
      if (!Number.isFinite(p.ordenListo)) {
        p.ordenListo = orden;
        orden += 1;
      }
    } else {
      p.ordenListo = null;
    }
  }

  // 2) Proceso que ya está en RUNNING (por el tick anterior o por una acción manual)
  let running =
    lista.find((p) => p.id === procesoRunningId && p.estado === ESTADOS.RUNNING) ||
    lista.find((p) => p.estado === ESTADOS.RUNNING) ||
    null;
  let quantumRestante = quantumRestanteActual;

  // 3) Si la CPU está libre, el planificador elige de la cola READY
  if (!running) {
    const listos = lista.filter((p) => p.estado === ESTADOS.READY);
    if (listos.length > 0) {
      const elegido =
        algoritmo === ALGORITMOS.ROUND_ROBIN
          ? ordenarCola(listos, algoritmo)[0]
          : sacarSiguiente([...listos], algoritmo);

      if (elegido) {
        elegido.ejecutar(); // READY -> RUNNING
        elegido.ordenListo = null;
        quantumRestante = quantumMax;
        cambios.push({
          pid: elegido.pid,
          nombre: elegido.nombre,
          de: ESTADOS.READY,
          a: ESTADOS.RUNNING,
          motivo: 'DESPACHO',
        });
        running = elegido;
      }
    }
  }

  // 4) La CPU ejecuta un tick
  let cpuInstatanea = 0;
  let eventoRegistro = null;
  let pidEnCpu = null;

  if (running) {
    cpuInstatanea = running.cpuRequerida || 10;
    const restanteAntes = Number.isFinite(running.tiempoRestante) ? running.tiempoRestante : running.tiempoTotal;
    running.tiempoRestante = Math.max(0, restanteAntes - 1);
    quantumRestante -= 1;
    pidEnCpu = running.pid;

    eventoRegistro = {
      tick: inicioTick,
      pid: running.pid,
      nombre: running.nombre,
      cpu: cpuInstatanea,
    };

    if (running.tiempoRestante === 0) {
      // Terminó su trabajo
      running.finalizar(); // RUNNING -> TERMINATED
      cambios.push({
        pid: running.pid,
        nombre: running.nombre,
        de: ESTADOS.RUNNING,
        a: ESTADOS.TERMINATED,
        motivo: 'TERMINO',
      });
      quantumRestante = quantumMax;
      running = null;
    } else if (algoritmo === ALGORITMOS.ROUND_ROBIN && quantumRestante <= 0) {
      // Agotó su quantum: vuelve al FINAL de la cola READY
      running.expropiar(); // RUNNING -> READY
      running.ordenListo = siguienteOrden(lista);
      cambios.push({
        pid: running.pid,
        nombre: running.nombre,
        de: ESTADOS.RUNNING,
        a: ESTADOS.READY,
        motivo: 'QUANTUM',
      });
      quantumRestante = quantumMax;
      running = null;
    }
  }

  // 5) Cambio de contexto: otro proceso usa la CPU respecto al tick anterior
  const cambioContexto =
    pidEnCpu !== null && ultimoPid !== null && pidEnCpu !== ultimoPid
      ? { desde: ultimoPid, hacia: pidEnCpu }
      : null;

  const colaListos = ordenarCola(
    lista.filter((p) => p.estado === ESTADOS.READY),
    algoritmo
  ).map((p) => ({ pid: p.pid, nombre: p.nombre }));

  return {
    procesos: lista,
    procesoRunningId: running ? running.id : null,
    quantumRestante,
    cpuInstatanea,
    eventoRegistro,
    cambios,
    cambioContexto,
    colaListos,
  };
}