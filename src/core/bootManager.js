// src/core/bootManager.js
// Secuencia canónica de arranque de 8 etapas de RobotOS SmartHouse
// Incluye etapas explícitas de inicialización del Memory Manager y Process Manager.

import { kernelClock } from './clock.js';
import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from './eventEngine.js';

export const BOOT_STAGES = Object.freeze([
  {
    stage: 1,
    id: 'POWER_ON',
    name: 'Energización y Verificación de Voltaje',
    description: 'Comprobación de bus de alimentación AC/Batería y rieles de tensión.',
  },
  {
    stage: 2,
    id: 'POST',
    name: 'Power-On Self Test (POST)',
    description: 'Diagnóstico de registros CPU, integridad de microcódigo y temporizadores.',
  },
  {
    stage: 3,
    id: 'MEM_INIT',
    name: 'Inicialización de Memory Manager',
    description: 'Configuración de 64 bloques (1024 MB) y reserva de los 8 bloques protegidos del Kernel (128 MB).',
  },
  {
    stage: 4,
    id: 'PROCESS_MGR_INIT',
    name: 'Inicialización de Process Manager & Scheduler',
    description: 'Puesta en marcha de la tabla de PCB, algoritmos de planificación y reloj del Kernel.',
  },
  {
    stage: 5,
    id: 'VFS_MOUNT',
    name: 'Montaje del Sistema de Archivos Virtual (VFS)',
    description: 'Montaje de las 6 carpetas raíz: /system, /apps, /users, /drivers, /config, /logs.',
  },
  {
    stage: 6,
    id: 'DRIVERS_LOAD',
    name: 'Carga de Controladores de Hardware (HAL)',
    description: 'Carga de drivers de periféricos: bus I2C (sensores), Zigbee (cerradura) y GPIO (luces).',
  },
  {
    stage: 7,
    id: 'DAEMONS_START',
    name: 'Arranque de Demonios y Servicios Base',
    description: 'Lanzamiento de lighting_daemon, temp_manager, surveillance_proc, lock_guard.',
  },
  {
    stage: 8,
    id: 'SYSTEM_READY',
    name: 'Sistema Operativo Listo (System Ready)',
    description: 'RobotOS completamente operativo, enlazado al bus domótico y listo para interacción.',
  },
]);

export class BootManager {
  constructor(clock = kernelClock, events = eventEngine) {
    this.clock = clock;
    this.events = events;
    this.bootLog = [];
    this.isBooted = false;
    this.inSafeMode = false;
  }

  /**
   * Ejecuta la secuencia de arranque completa de las 8 etapas.
   * Permite programar un fallo simulado en una etapa específica.
   */
  async executeBoot({ failAtStage = null, onStageComplete = null } = {}) {
    this.bootLog = [];
    this.isBooted = false;
    this.inSafeMode = false;

    this.events.emit({
      type: 'BOOT_SEQUENCE_STARTED',
      source: EVENT_SOURCES.BOOT_MANAGER,
      severity: EVENT_SEVERITY.INFO,
      payload: { totalStages: BOOT_STAGES.length },
    });

    for (const def of BOOT_STAGES) {
      const stageRecord = {
        stage: def.stage,
        id: def.id,
        name: def.name,
        description: def.description,
        status: 'RUNNING',
        timestamp: this.clock.getISOTimestamp(),
        result: null,
        error: null,
      };

      // Si se programó fallo simulado en esta etapa
      if (failAtStage === def.stage || failAtStage === def.id) {
        stageRecord.status = 'FAILED';
        stageRecord.result = 'Fallo crítico de diagnóstico en microcódigo o hardware';
        stageRecord.error = `Fallo intencional en etapa ${def.stage}: ${def.name}`;

        this.bootLog.push(stageRecord);

        this.events.emit({
          type: 'BOOT_STAGE_FAILED',
          source: EVENT_SOURCES.BOOT_MANAGER,
          severity: EVENT_SEVERITY.CRITICAL,
          payload: stageRecord,
        });

        // Activación de Modo Seguro
        this.inSafeMode = true;
        this.events.emit({
          type: 'BOOT_SAFE_MODE_TRIGGERED',
          source: EVENT_SOURCES.BOOT_MANAGER,
          severity: EVENT_SEVERITY.WARN,
          payload: { reason: stageRecord.error, failedStage: def.stage },
        });

        if (onStageComplete) onStageComplete(stageRecord);
        return { success: false, safeMode: true, failedStage: stageRecord, bootLog: this.bootLog };
      }

      // Éxito de la etapa
      stageRecord.status = 'COMPLETED';
      stageRecord.result = `OK: ${def.name} inicializado correctamente.`;
      this.bootLog.push(stageRecord);

      this.events.emit({
        type: 'BOOT_STAGE_COMPLETED',
        source: EVENT_SOURCES.BOOT_MANAGER,
        severity: EVENT_SEVERITY.INFO,
        payload: { stage: def.stage, id: def.id },
      });

      if (onStageComplete) {
        onStageComplete(stageRecord);
      }
    }

    this.isBooted = true;
    this.events.emit({
      type: 'BOOT_COMPLETED',
      source: EVENT_SOURCES.BOOT_MANAGER,
      severity: EVENT_SEVERITY.INFO,
      payload: { totalStages: BOOT_STAGES.length, durationTicks: this.clock.getTicks() },
    });

    return { success: true, safeMode: false, bootLog: this.bootLog };
  }

  getBootLog() {
    return this.bootLog;
  }

  isSystemReady() {
    return this.isBooted;
  }
}

export const bootManager = new BootManager();
