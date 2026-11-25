/**
 * RobotOS - Benchmark Suite & Center (Fase 10)
 * Generación determinista de cargas de trabajo con seed y ejecución de comparativas
 * de rendimiento de Planificación de CPU (Priority vs RR q=2,4,8) y Memoria Virtual (FIFO vs LRU).
 * Todos los análisis textuales calculan porcentajes reales sobre datos de ejecución empíricos.
 */

import { Proceso, ESTADOS } from './proceso.js';
import { simular } from './cpu.js';
import { ALGORITMOS } from './scheduler.js';
import { MemoryManager } from './memoryManager.js';

// PRNG Mulberry32 para generación de workloads deterministas
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BenchmarkSuite {
  /**
   * Genera un lote de procesos de prueba determinista a partir de una semilla
   */
  static generateWorkload(seed = 42, count = 6) {
    const rng = mulberry32(seed);
    const names = ['worker_alpha', 'iot_telemetry', 'vision_ai', 'db_sync', 'crypto_miner', 'sound_analyzer', 'motion_track', 'backup_task'];
    const workload = [];

    for (let i = 0; i < count; i++) {
      const name = names[i % names.length];
      const priority = Math.floor(rng() * 4) + 1; // 1 (crítico) a 4 (bajo)
      const cpu = Math.floor(rng() * 30) + 10;    // 10 a 40%
      const duration = Math.floor(rng() * 6) + 2; // 2 a 8 ticks
      const memoryBlocks = Math.floor(rng() * 3) + 1; // 1 a 4 bloques

      workload.push({
        nombre: `${name}_${i + 1}`,
        prioridad: priority,
        cpuRequerida: cpu,
        tiempoTotal: duration,
        memoriaRequerida: memoryBlocks * 16,
        color: ['#06B6D4', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'][i % 6],
      });
    }

    return workload;
  }

  /**
   * Ejecuta el benchmark comparativo de CPU Scheduler
   */
  static runSchedulerBenchmark(workload) {
    const createProcessList = () =>
      workload.map((spec, idx) => {
        const p = new Proceso(spec);
        p.pid = idx + 1;
        p.id = `bench_${p.pid}`;
        p.tickLlegada = 0;
        return p;
      });

    // 1. Prioridad
    const resPriority = simular(createProcessList(), { algoritmo: ALGORITMOS.PRIORIDAD });

    // 2. Round Robin q=2
    const resRR2 = simular(createProcessList(), { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 2 });

    // 3. Round Robin q=4
    const resRR4 = simular(createProcessList(), { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 4 });

    // 4. Round Robin q=8
    const resRR8 = simular(createProcessList(), { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 8 });

    const extractMetrics = (name, res) => ({
      name,
      avgWait: res.resumenMetricas?.tiempoEsperaPromedio ?? 0,
      avgTurnaround: res.resumenMetricas?.tiempoRetornoPromedio ?? 0,
      avgResponse: res.resumenMetricas?.tiempoRespuestaPromedio ?? 0,
      throughput: res.resumenMetricas?.throughput ?? 0,
      contextSwitches: res.resumenMetricas?.cambiosContexto ?? 0,
      cpuUsage: res.usoCpuPromedio ?? 0,
      totalTicks: res.ticksTotales ?? 0,
    });

    const results = [
      extractMetrics('Priority Preemptive', resPriority),
      extractMetrics('Round Robin (q=2)', resRR2),
      extractMetrics('Round Robin (q=4)', resRR4),
      extractMetrics('Round Robin (q=8)', resRR8),
    ];

    // Análisis automático con cálculos reales
    const pWait = results[0].avgWait;
    const rr4Wait = results[2].avgWait;
    const waitDiffPct = pWait > 0 ? (((rr4Wait - pWait) / pWait) * 100).toFixed(1) : 0;

    const pCtx = results[0].contextSwitches;
    const rr4Ctx = results[2].contextSwitches;
    const ctxDiffPct = pCtx > 0 ? (((rr4Ctx - pCtx) / pCtx) * 100).toFixed(1) : 0;

    const autoAnalysis = `El algoritmo Priority Preemptive obtuvo un tiempo de espera promedio de ${pWait} ticks frente a ${rr4Wait} ticks en Round Robin (q=4) (${waitDiffPct > 0 ? '+' : ''}${waitDiffPct}%). En términos de sobrecarga de conmutación, Round Robin generó ${rr4Ctx} cambios de contexto frente a ${pCtx} en Prioridad (${ctxDiffPct > 0 ? '+' : ''}${ctxDiffPct}% de variación).`;

    return {
      results,
      analysis: autoAnalysis,
    };
  }

  /**
   * Ejecuta el benchmark de memoria virtual (FIFO vs LRU)
   */
  static runVirtualMemoryBenchmark(seed = 42, frameCount = 4) {
    const mem = new MemoryManager();

    const rng = mulberry32(seed);
    const references = [];
    for (let i = 0; i < 20; i++) {
      references.push(Math.floor(rng() * 8)); // Páginas 0 a 7
    }

    const comparison = mem.compareReferenceString(references, frameCount);
    const fifoRes = comparison.FIFO;
    const lruRes = comparison.LRU;

    const diffFaults = fifoRes.pageFaults - lruRes.pageFaults;
    const percentDiff = fifoRes.pageFaults > 0 ? ((diffFaults / fifoRes.pageFaults) * 100).toFixed(1) : 0;

    const analysis = `Bajo la secuencia determinista (seed #${seed}, ${frameCount} marcos físicos), LRU registró ${lruRes.pageFaults} fallos de página (${lruRes.faultRate.toFixed(1)}%) frente a ${fifoRes.pageFaults} en FIFO (${fifoRes.faultRate.toFixed(1)}%) (${percentDiff}% de reducción de fallos).`;

    return {
      references,
      fifo: fifoRes,
      lru: lruRes,
      analysis,
    };
  }

  /**
   * Exporta resultados en formato CSV
   */
  static exportToCSV(results) {
    if (!Array.isArray(results) || results.length === 0) return '';
    const headers = Object.keys(results[0]).join(',');
    const rows = results.map((r) => Object.values(r).join(','));
    return [headers, ...rows].join('\n');
  }

  /**
   * Exporta resultados en formato JSON estructurado
   */
  static exportToJSON(data) {
    return JSON.stringify(data, null, 2);
  }
}
