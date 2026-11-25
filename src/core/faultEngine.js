/**
 * RobotOS - Fault Injection Engine (Fase 09)
 * Motor determinista de inyección de fallos para auditoría y validación de resiliencia del Kernel.
 * Utiliza un generador pseudoaleatorio basado en seed (PRNG Mulberry32) para garantizar
 * reproducibilidad exacta de experimentos y pruebas de estrés.
 */

import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from './eventEngine.js';

// PRNG determinista basado en Mulberry32
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FAULT_CATEGORIES = Object.freeze({
  SENSOR: 'SENSOR',
  DRIVER: 'DRIVER',
  PROCESS: 'PROCESS',
  MEMORY: 'MEMORY',
  COMMUNICATION: 'COMMUNICATION',
});

export const FAULT_MODES = Object.freeze({
  ISOLATED: 'ISOLATED',     // Fallo en un único componente
  COMBINED: 'COMBINED',     // Cascada sincronizada en 2 o más subsistemas
  PROGRESSIVE: 'PROGRESSIVE', // Degradación paulatina con cada tick
});

export class FaultInjectionEngine {
  constructor(persistenceAdapter = null) {
    this.persistence = persistenceAdapter;
    this.injectedHistory = [];
  }

  setPersistence(adapter) {
    this.persistence = adapter;
  }

  /**
   * Genera un plan de fallos determinista a partir de una seed y configuración
   */
  generatePlan({ seed = 12345, category = FAULT_CATEGORIES.SENSOR, mode = FAULT_MODES.ISOLATED, count = 1 }) {
    const rng = mulberry32(seed);
    const plan = [];

    const scenarios = {
      [FAULT_CATEGORIES.SENSOR]: [
        { type: 'SENSOR_DRIFT', component: 'sensor_temp_01', detail: 'Desviación térmica anómala (+15°C)' },
        { type: 'I2C_TIMEOUT', component: 'sensor_smoke_01', detail: 'Fallo de sondeo en bus I2C (Ack missing)' },
        { type: 'SENSOR_SATURATION', component: 'sensor_motion_01', detail: 'Señal saturada en nivel alto continuo' },
      ],
      [FAULT_CATEGORIES.DRIVER]: [
        { type: 'DRIVER_CRASH', component: 'CameraDriver', detail: 'Puntero nulo en buffer de frames de streaming' },
        { type: 'IO_STALL', component: 'ClimateDriver', detail: 'Comando PWM retenido sin respuesta de actuador' },
      ],
      [FAULT_CATEGORIES.PROCESS]: [
        { type: 'SEGFAULT_SIM', component: 'surveillance_proc', detail: 'Intento de lectura fuera del límite de dirección virtual' },
        { type: 'RESOURCE_LEAK', component: 'lighting_daemon', detail: 'Bloques de memoria retenidos sin desasignación' },
      ],
      [FAULT_CATEGORIES.MEMORY]: [
        { type: 'BIT_FLIP', component: 'PhysicalBlock_12', detail: 'Corrupción por bit-flip en marco de memoria de usuario' },
        { type: 'PAGE_FAULT_STORM', component: 'VirtualMemory_P1', detail: 'Tasa de page faults superior al umbral crítico (>80%)' },
      ],
      [FAULT_CATEGORIES.COMMUNICATION]: [
        { type: 'ZIGBEE_PACKET_LOSS', component: 'LockDriver_d5', detail: 'Pérdida de 4 paquetes consecutivos en enlace inalámbrico' },
        { type: 'SOCKET_TIMEOUT', component: 'CloudSyncAdapter', detail: 'Timeout de conexión TCP/TLS con endpoint Supabase' },
      ],
    };

    const pool = scenarios[category] || scenarios[FAULT_CATEGORIES.SENSOR];

    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rng() * pool.length);
      const item = pool[idx];
      plan.push({
        faultId: `flt_${seed}_${i}_${Math.floor(rng() * 10000)}`,
        seed,
        category,
        mode,
        step: i + 1,
        ...item,
      });
    }

    return plan;
  }

  /**
   * Ejecuta la inyección del fallo emitiendo eventos al Kernel y guardando en Supabase
   */
  async inject(faultSpec, context = {}) {
    const faultRecord = {
      id: faultSpec.faultId || `flt_${Date.now()}`,
      category: faultSpec.category,
      mode: faultSpec.mode || FAULT_MODES.ISOLATED,
      component: faultSpec.component,
      type: faultSpec.type,
      detail: faultSpec.detail,
      seed: faultSpec.seed || 12345,
      timestamp: new Date().toISOString(),
      role: context.role || 'ADMIN',
    };

    this.injectedHistory.unshift(faultRecord);

    // 1. Emitir evento auditable al EventEngine del Kernel
    eventEngine.emit({
      type: 'FAULT_INJECTED',
      source: 'FAULT_ENGINE',
      severity: EVENT_SEVERITY.WARN,
      payload: faultRecord,
    });

    // 2. Persistir en la tabla especializada injected_faults si existe el adaptador
    if (this.persistence && typeof this.persistence.saveInjectedFault === 'function') {
      try {
        await this.persistence.saveInjectedFault(faultRecord);
      } catch (err) {
        console.warn('[FaultEngine] Error persistiendo fallo en Supabase:', err.message);
      }
    }

    return faultRecord;
  }

  getHistory() {
    return [...this.injectedHistory];
  }
}

export const faultEngine = new FaultInjectionEngine();
