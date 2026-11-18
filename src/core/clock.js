// src/core/clock.js
// Reloj único del Kernel de RobotOS SmartHouse
// Genera marcas de tiempo deterministas, ticks de ejecución monótonos y medición de latencias.

export class KernelClock {
  constructor() {
    this.ticks = 0;
    this.startTime = Date.now();
  }

  // Avanza un tick de reloj del sistema
  tick() {
    this.ticks += 1;
    return this.ticks;
  }

  getTicks() {
    return this.ticks;
  }

  // Genera timestamp legible HH:MM:SS sincronizado con el reloj
  getTimestamp() {
    const now = new Date(this.startTime + this.ticks * 1000);
    return now.toTimeString().split(' ')[0];
  }

  // Genera timestamp ISO formal
  getISOTimestamp() {
    return new Date(this.startTime + this.ticks * 1000).toISOString();
  }

  // Calcula latencia local entre un timestamp de evento y el tiempo actual
  calculateLatencyMs(eventTimestamp) {
    const eventTime = new Date(eventTimestamp).getTime();
    const current = Date.now();
    return Math.max(0, current - eventTime);
  }

  reset() {
    this.ticks = 0;
    this.startTime = Date.now();
  }
}

// Instancia singleton para garantizar un único reloj en todo el sistema
export const kernelClock = new KernelClock();
