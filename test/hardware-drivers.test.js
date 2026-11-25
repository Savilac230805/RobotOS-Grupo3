// test/hardware-drivers.test.js
// Pruebas obligatorias de la Fase 04: Hardware, Drivers y HAL
// Pipeline: Proceso -> Syscall -> Driver -> Dispositivo -> Event Engine -> Supabase / PersistenceAdapter

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SystemCalls,
  EventEngine,
  InMemoryPersistenceAdapter,
  MemoryManager,
  ProcessManager,
  Proceso,
  driverManager,
  LightDriver,
  CameraDriver,
  LockDriver,
  ClimateDriver,
  MotionSensorDriver,
  SmokeSensorDriver,
  GasSensorDriver,
  DoorbellDriver,
  GarbageCollectorDriver,
  IrrigationDriver,
  GarageDoorDriver,
} from '../src/core/index.js';

function setupEnvironment() {
  const events = new EventEngine();
  const persistence = new InMemoryPersistenceAdapter();
  persistence.setSandboxMode(false); // Guardar en sharedStorage para validar persistencia
  const memory = new MemoryManager();
  const procMgr = new ProcessManager();
  const sys = new SystemCalls(events, persistence, memory, procMgr, driverManager);

  // Procesos simulados
  const procLighting = new Proceso({ nombre: 'lighting_daemon', prioridad: 3, memoriaRequerida: 16, cpuRequerida: 5, tiempoTotal: 10 });
  procLighting.admitir(); // READY
  procLighting.ejecutar(); // RUNNING

  const procSurveillance = new Proceso({ nombre: 'surveillance_proc', prioridad: 1, memoriaRequerida: 16, cpuRequerida: 10, tiempoTotal: 10 });
  procSurveillance.admitir(); // READY

  const procTemp = new Proceso({ nombre: 'temp_manager', prioridad: 2, memoriaRequerida: 16, cpuRequerida: 4, tiempoTotal: 10 });
  procTemp.admitir(); // READY

  const procLock = new Proceso({ nombre: 'lock_guard', prioridad: 1, memoriaRequerida: 16, cpuRequerida: 2, tiempoTotal: 10 });
  procLock.admitir(); // READY

  const procGarbage = new Proceso({ nombre: 'garbage_collector_daemon', prioridad: 3, memoriaRequerida: 16, cpuRequerida: 5, tiempoTotal: 10 });
  procGarbage.admitir(); // READY

  const procIrrigation = new Proceso({ nombre: 'irrigation_daemon', prioridad: 4, memoriaRequerida: 16, cpuRequerida: 3, tiempoTotal: 10 });
  procIrrigation.admitir(); // READY

  const processes = [procLighting, procSurveillance, procTemp, procLock, procGarbage, procIrrigation];

  // Dispositivos simulados
  const devices = [
    { id: 'd1', name: 'Luces Salón', type: 'light', zone: 'Salón', status: 'OFF' },
    { id: 'd2', name: 'Luces Cocina', type: 'light', zone: 'Cocina', status: 'OFF' },
    { id: 'd4', name: 'Cámara Frontal', type: 'camera', zone: 'Exterior', status: 'ONLINE' },
    { id: 'd5', name: 'Cerradura Principal', type: 'lock', zone: 'Entrada', status: 'BLOQUEADA' },
    { id: 'd6', name: 'Termostato Salón', type: 'climate', zone: 'Salón', status: '22.0 °C', temperature: 22.0 },
    { id: 'd7', name: 'Timbre Inteligente', type: 'doorbell', zone: 'Entrada', status: 'IDLE' },
    { id: 'd8', name: 'Sensor de Humo', type: 'smoke', zone: 'Cocina', status: 'NORMAL' },
    { id: 'd9', name: 'Sensor de Gas', type: 'gas', zone: 'Cocina', status: 'NORMAL' },
    { id: 'd10', name: 'Robot Recolector', type: 'garbage_collector', zone: 'Salón', status: 'ESTACIONADO' },
    { id: 'd11', name: 'Sistema de Riego', type: 'irrigation', zone: 'Jardín', status: 'INACTIVO' },
    { id: 'd14', name: 'Puerta Garaje', type: 'garage_door', zone: 'Garaje', status: 'CERRADA' },
  ];

  return { sys, events, persistence, processes, devices, procLighting, procSurveillance };
}

// -------------------------------------------------------------
// PRUEBA 1: Encender luz mediante proceso + driver
// -------------------------------------------------------------
test('Fase 04 - 1: Encender luz mediante pipeline Proceso -> Syscall -> Driver', () => {
  const { sys, devices, processes } = setupEnvironment();
  const luz = devices.find((d) => d.id === 'd1');

  const res = sys.accessDevice({ deviceId: 'd1', action: 'TURN_ON' }, { role: 'USER' }, devices, processes);

  assert.equal(res.success, true);
  assert.equal(res.device.status, 'ON');
  assert.equal(res.driver, 'LightDriver');
  assert.equal(res.eventType, 'LIGHT_ON');
});

// -------------------------------------------------------------
// PRUEBA 2: Intentar encender luz con proceso terminado (debe rechazar)
// -------------------------------------------------------------
test('Fase 04 - 2: Rechazar encendido de luz si lighting_daemon está TERMINATED', () => {
  const { sys, devices, processes, procLighting, events } = setupEnvironment();
  procLighting.finalizar(); // Cambia a TERMINATED
  assert.equal(procLighting.estado, 'TERMINATED');

  const eventos = [];
  events.subscribe('DEVICE_OPERATION_REJECTED', (e) => eventos.push(e));

  assert.throws(
    () => sys.accessDevice({ deviceId: 'd1', action: 'TURN_ON' }, { role: 'USER' }, devices, processes),
    /TERMINATED/
  );

  // Verifica que se emitió el evento de rechazo en el bus
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].type, 'DEVICE_OPERATION_REJECTED');
  assert.equal(eventos[0].payload.associatedProcess, 'lighting_daemon');
  assert.equal(eventos[0].payload.processState, 'TERMINATED');
});

// -------------------------------------------------------------
// PRUEBA 3: Timbre genera evento DOORBELL_PRESSED
// -------------------------------------------------------------
test('Fase 04 - 3: Timbre inteligente emite evento DOORBELL_PRESSED', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const eventos = [];
  events.subscribe('DOORBELL_PRESSED', (e) => eventos.push(e));

  const res = sys.accessDevice({ deviceId: 'd7', action: 'PRESS' }, { role: 'GUEST' }, devices, processes);

  assert.equal(res.success, true);
  assert.equal(res.eventType, 'DOORBELL_PRESSED');
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].payload.chimeTone, 'DING_DONG_HARMONIC');
});

// -------------------------------------------------------------
// PRUEBA 4: Sensor de humo genera alerta SMOKE_DETECTED
// -------------------------------------------------------------
test('Fase 04 - 4: Sensor de humo emite evento crítico SMOKE_DETECTED', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const alertas = [];
  events.subscribe('SMOKE_DETECTED', (e) => alertas.push(e));

  const res = sys.accessDevice({ deviceId: 'd8', action: 'TRIGGER_SMOKE', payload: { ppm: 550 } }, { role: 'USER' }, devices, processes);

  assert.equal(res.success, true);
  assert.equal(res.device.status, 'HUMO DETECTADO');
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].severity, 'CRITICAL');
  assert.equal(alertas[0].payload.ppm, 550);
});

// -------------------------------------------------------------
// PRUEBA 5: Sensor de gas genera alerta GAS_DETECTED
// -------------------------------------------------------------
test('Fase 04 - 5: Sensor de gas emite evento crítico GAS_DETECTED', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const alertas = [];
  events.subscribe('GAS_DETECTED', (e) => alertas.push(e));

  const res = sys.accessDevice({ deviceId: 'd9', action: 'TRIGGER_GAS', payload: { ppm: 750 } }, { role: 'USER' }, devices, processes);

  assert.equal(res.success, true);
  assert.equal(res.device.status, 'FUGA DETECTADA');
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].severity, 'CRITICAL');
  assert.equal(alertas[0].payload.cutoffValveEngaged, true);
});

// -------------------------------------------------------------
// PRUEBA 6: Robot recolector inicia y detiene limpieza
// -------------------------------------------------------------
test('Fase 04 - 6: Robot recolector inicia y detiene ciclo de limpieza', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const eventosInicio = [];
  const eventosParada = [];
  events.subscribe('GARBAGE_COLLECTION_STARTED', (e) => eventosInicio.push(e));
  events.subscribe('GARBAGE_COLLECTION_STOPPED', (e) => eventosParada.push(e));

  // Iniciar
  const resInicio = sys.accessDevice({ deviceId: 'd10', action: 'START_CLEANING' }, { role: 'USER' }, devices, processes);
  assert.equal(resInicio.device.status, 'LIMPIANDO');
  assert.equal(eventosInicio.length, 1);

  // Detener
  const resParada = sys.accessDevice({ deviceId: 'd10', action: 'STOP_CLEANING' }, { role: 'USER' }, devices, processes);
  assert.equal(resParada.device.status, 'ESTACIONADO');
  assert.equal(eventosParada.length, 1);
});

// -------------------------------------------------------------
// PRUEBA 7: Sistema de riego inicia y detiene ciclo
// -------------------------------------------------------------
test('Fase 04 - 7: Sistema de riego inicia y detiene aspersores en jardín', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const eventosRiego = [];
  events.subscribe('IRRIGATION_STARTED', (e) => eventosRiego.push(e));
  events.subscribe('IRRIGATION_STOPPED', (e) => eventosRiego.push(e));

  // Activar
  const resInicio = sys.accessDevice({ deviceId: 'd11', action: 'START_IRRIGATION' }, { role: 'USER' }, devices, processes);
  assert.equal(resInicio.device.status, 'REGANDO');
  assert.equal(eventosRiego[0].type, 'IRRIGATION_STARTED');

  // Desactivar
  const resParada = sys.accessDevice({ deviceId: 'd11', action: 'STOP_IRRIGATION' }, { role: 'USER' }, devices, processes);
  assert.equal(resParada.device.status, 'INACTIVO');
  assert.equal(eventosRiego[1].type, 'IRRIGATION_STOPPED');
});

// -------------------------------------------------------------
// PRUEBA 8: Cámara pasa ONLINE / OFFLINE
// -------------------------------------------------------------
test('Fase 04 - 8: Cámara de seguridad conmuta entre ONLINE y OFFLINE', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const eventos = [];
  events.subscribe('CAMERA_OFFLINE', (e) => eventos.push(e));
  events.subscribe('CAMERA_ONLINE', (e) => eventos.push(e));

  // Desconectar
  const resOff = sys.accessDevice({ deviceId: 'd4', action: 'DISCONNECT' }, { role: 'ADMIN' }, devices, processes);
  assert.equal(resOff.device.status, 'OFFLINE');
  assert.equal(eventos[0].type, 'CAMERA_OFFLINE');

  // Conectar
  const resOn = sys.accessDevice({ deviceId: 'd4', action: 'CONNECT' }, { role: 'ADMIN' }, devices, processes);
  assert.equal(resOn.device.status, 'ONLINE');
  assert.equal(eventos[1].type, 'CAMERA_ONLINE');
});

// -------------------------------------------------------------
// PRUEBA 9: Puerta garaje abre y cierra
// -------------------------------------------------------------
test('Fase 04 - 9: Puerta de garaje abre y cierra con eventos GARAGE_OPENED/CLOSED', () => {
  const { sys, devices, processes, events } = setupEnvironment();
  const eventos = [];
  events.subscribe('GARAGE_OPENED', (e) => eventos.push(e));
  events.subscribe('GARAGE_CLOSED', (e) => eventos.push(e));

  // Abrir
  const resAbrir = sys.accessDevice({ deviceId: 'd14', action: 'OPEN' }, { role: 'ADMIN' }, devices, processes);
  assert.equal(resAbrir.device.status, 'ABIERTA');
  assert.equal(eventos[0].type, 'GARAGE_OPENED');

  // Cerrar
  const resCerrar = sys.accessDevice({ deviceId: 'd14', action: 'CLOSE' }, { role: 'ADMIN' }, devices, processes);
  assert.equal(resCerrar.device.status, 'CERRADA');
  assert.equal(eventos[1].type, 'GARAGE_CLOSED');
});

// -------------------------------------------------------------
// PRUEBA 10: Todos los eventos persisten en el PersistenceAdapter
// -------------------------------------------------------------
test('Fase 04 - 10: Todos los eventos de hardware persisten estructurados en el Adaptador', async () => {
  const { sys, devices, processes, persistence } = setupEnvironment();

  // Ejecutar diversas acciones de hardware
  sys.accessDevice({ deviceId: 'd1', action: 'TURN_ON' }, { role: 'USER' }, devices, processes);
  sys.accessDevice({ deviceId: 'd7', action: 'PRESS' }, { role: 'GUEST' }, devices, processes);
  sys.accessDevice({ deviceId: 'd10', action: 'START_CLEANING' }, { role: 'USER' }, devices, processes);

  const history = await persistence.loadHistory();
  const eventTypes = history.map((e) => e.type);

  assert.ok(eventTypes.includes('LIGHT_ON'), 'Debe incluir LIGHT_ON');
  assert.ok(eventTypes.includes('DOORBELL_PRESSED'), 'Debe incluir DOORBELL_PRESSED');
  assert.ok(eventTypes.includes('GARBAGE_COLLECTION_STARTED'), 'Debe incluir GARBAGE_COLLECTION_STARTED');

  // Validar esquema JSON estricto
  for (const event of history) {
    assert.ok(event.id, 'Debe tener id');
    assert.ok(event.timestamp, 'Debe tener timestamp');
    assert.ok(event.source, 'Debe tener source');
    assert.ok(event.type, 'Debe tener type');
    assert.ok(event.severity, 'Debe tener severity');
    assert.ok(event.payload, 'Debe tener payload');
  }
});
