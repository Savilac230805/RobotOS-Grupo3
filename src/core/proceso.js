// src/core/proceso.js
// Define la clase Proceso de RobotOS SmartHome, sus estados y transiciones permitidas.
// Módulo JavaScript puro sin dependencias de React.

export const ESTADOS = Object.freeze({
  NEW: 'NEW', // recién creado, todavía no entra al sistema
  READY: 'READY', // listo, esperando su turno en la CPU
  RUNNING: 'RUNNING', // usando la CPU en este momento
  BLOCKED: 'BLOCKED', // esperando un recurso o evento externo
  WAITING: 'WAITING', // pausado o esperando algo
  TERMINATED: 'TERMINATED', // terminó, no puede volver a empezar
});

export const TRANSICIONES_PERMITIDAS = Object.freeze({
  NEW: ['READY', 'TERMINATED'],
  READY: ['RUNNING', 'BLOCKED', 'WAITING', 'TERMINATED'],
  RUNNING: ['READY', 'BLOCKED', 'WAITING', 'TERMINATED'],
  BLOCKED: ['READY', 'TERMINATED'],
  WAITING: ['READY', 'BLOCKED', 'TERMINATED'],
  TERMINATED: [],
});

let contadorPid = 0;

export function reiniciarContadorPid() {
  contadorPid = 0;
}

function validarNumero(valor, campo, { min, max, entero = false }) {
  if (typeof valor !== 'number' || Number.isNaN(valor)) {
    throw new Error(`${campo} debe ser un número`);
  }
  if (entero && !Number.isInteger(valor)) {
    throw new Error(`${campo} debe ser un número entero`);
  }
  if (valor < min) {
    throw new Error(`${campo} debe ser mayor o igual a ${min}`);
  }
  if (max !== undefined && valor > max) {
    throw new Error(`${campo} debe ser menor o igual a ${max}`);
  }
}

export class Proceso {
  constructor({
    nombre,
    prioridad,
    memoriaRequerida,
    cpuRequerida,
    tiempoTotal,
    color = null,
    isSystem = false,
    description = '',
    deviceIds = [],
    tickLlegada = null,
  }) {
    if (typeof nombre !== 'string' || nombre.trim() === '') {
      throw new Error('El nombre es obligatorio');
    }
    validarNumero(prioridad, 'La prioridad', { min: 1, entero: true });
    validarNumero(memoriaRequerida, 'La memoria requerida', { min: 0 });
    validarNumero(cpuRequerida, 'La CPU requerida', { min: 0, max: 100 });
    validarNumero(tiempoTotal, 'El tiempo total', { min: 1, entero: true });

    contadorPid += 1;
    this.pid = contadorPid;
    this.id = `p_${this.pid}`;
    this.nombre = nombre.trim();
    this.name = this.nombre; // compatibilidad UI
    this.prioridad = prioridad; // 1 = más urgente
    this.priority = prioridad === 1 ? 'Crítica' : prioridad === 2 ? 'Alta' : prioridad === 3 ? 'Media' : 'Baja';
    this.memoriaRequerida = memoriaRequerida; // en MB
    this.memory = memoriaRequerida;
    this.memoryBlocks = Math.ceil(memoriaRequerida / 16) || 1; // 16MB por bloque
    this.cpuRequerida = cpuRequerida; // porcentaje de CPU
    this.cpu = cpuRequerida;
    this.tiempoTotal = tiempoTotal;
    this.tiempoRestante = tiempoTotal;
    this.estado = ESTADOS.NEW;
    this.state = ESTADOS.NEW; // compatibilidad UI
    this.color = color || '#06B6D4';
    this.isSystem = Boolean(isSystem);
    this.description = description || `Proceso ${this.nombre} (PID ${this.pid})`;
    this.creadoEn = new Date();
    this.deviceIds = [...new Set(deviceIds)];
    this.tickLlegada = Number.isFinite(tickLlegada) ? tickLlegada : null;
  }

  cambiarEstado(nuevoEstado) {
    const permitidos = TRANSICIONES_PERMITIDAS[this.estado];
    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(
        `Transición no permitida: ${this.estado} -> ${nuevoEstado} (proceso ${this.pid} "${this.nombre}")`
      );
    }
    this.estado = nuevoEstado;
    this.state = nuevoEstado; // mantener sincronizado
  }

  admitir() {
    this.cambiarEstado(ESTADOS.READY);
  }

  ejecutar() {
    this.cambiarEstado(ESTADOS.RUNNING);
  }

  expropiar() {
    this.cambiarEstado(ESTADOS.READY);
  }

  pausar() {
    this.cambiarEstado(ESTADOS.WAITING);
  }

  bloquear() {
    this.cambiarEstado(ESTADOS.BLOCKED);
  }

  reanudar() {
    this.cambiarEstado(ESTADOS.READY);
  }

  finalizar() {
    this.cambiarEstado(ESTADOS.TERMINATED);
  }

  // Serialización a objeto puro para persistencia y telemetría
  toJSON() {
    return {
      id: this.id,
      pid: this.pid,
      nombre: this.nombre,
      name: this.nombre,
      prioridad: this.prioridad,
      priority: this.priority,
      memoriaRequerida: this.memoriaRequerida,
      memory: this.memory,
      memoryBlocks: this.memoryBlocks,
      cpuRequerida: this.cpuRequerida,
      cpu: this.cpu,
      tiempoTotal: this.tiempoTotal,
      tiempoRestante: this.tiempoRestante,
      estado: this.estado,
      state: this.estado,
      color: this.color,
      isSystem: this.isSystem,
      description: this.description,
      deviceIds: [...this.deviceIds],
      tickLlegada: this.tickLlegada,
      creadoEn: this.creadoEn.toISOString(),
    };
  }
}
