import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGORITMOS,
  EventEngine,
  MemoryManager,
  ProcessManager,
  Proceso,
  SystemCalls,
  VirtualFileSystem,
  calcularMetricas,
  createEventId,
  ejecutarTickInteractivo,
  simular,
} from '../src/core/index.js';
import { InMemoryPersistenceAdapter } from '../src/core/persistence/InMemoryPersistenceAdapter.js';

function createProcess(nombre, prioridad, tiempoTotal) {
  return new Proceso({
    nombre,
    prioridad,
    memoriaRequerida: 32,
    cpuRequerida: 20,
    tiempoTotal,
  });
}

test('ProcessManager registra relaciones entre procesos y dispositivos', () => {
  const manager = new ProcessManager();
  const lighting = createProcess('lighting_daemon', 2, 4);
  manager.register(lighting);
  manager.associateDevice(lighting.pid, 'd-extra');

  assert.deepEqual(manager.getDeviceRelations(lighting.pid), [
    { pid: lighting.pid, deviceId: 'd1' },
    { pid: lighting.pid, deviceId: 'd2' },
    { pid: lighting.pid, deviceId: 'd-extra' },
  ]);
});

test('Proceso admite y valida el estado BLOCKED', () => {
  const process = createProcess('blocked_task', 2, 2);
  process.admitir();
  process.bloquear();
  assert.equal(process.estado, 'BLOCKED');
  assert.throws(() => process.ejecutar(), /Transición no permitida/);
  process.reanudar();
  assert.equal(process.estado, 'READY');
});

test('EventEngine genera IDs UUID y preserva correlationId', () => {
  const event = new EventEngine().emit({
    type: 'CPU_EXECUTION',
    correlationId: createEventId(),
  });
  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(Number.isFinite(Date.parse(event.timestamp)));
  assert.ok(event.correlationId);
});

test('MemoryManager libera por PID exactamente los bloques asignados', () => {
  const memory = new MemoryManager();
  const initialFree = memory.getFreeBlocksCount();
  const process = createProcess('temporary_job', 2, 2);
  memory.allocate(process.nombre, process.memoryBlocks, process.color, process.pid);
  assert.equal(memory.getFreeBlocksCount(), initialFree - process.memoryBlocks);

  assert.equal(memory.freeProcessMemory(process.pid), process.memoryBlocks);
  assert.equal(memory.getFreeBlocksCount(), initialFree);
  assert.equal(memory.getBlocks().some((block) => block.ownerPid === process.pid), false);
});

test('CPU compara prioridad y Round Robin, calcula métricas y acepta quantum 2, 4 y 8', () => {
  const workload = () => [
    createProcess('low_priority', 3, 10),
    createProcess('high_priority', 1, 6),
  ];
  const priority = simular(workload(), { algoritmo: ALGORITMOS.PRIORIDAD });

  for (const quantum of [2, 4, 8]) {
    const roundRobin = simular(workload(), { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum });
    assert.equal(roundRobin.quantum, quantum);
    assert.notDeepEqual(
      roundRobin.linea.map((entry) => entry.nombre),
      priority.linea.map((entry) => entry.nombre)
    );
    assert.ok(roundRobin.resumenMetricas.cambiosContexto > priority.resumenMetricas.cambiosContexto);
    assert.equal(roundRobin.resumenMetricas.utilizacionCpu, 100);
    assert.notEqual(roundRobin.resumenMetricas.respuestaPromedio, priority.resumenMetricas.respuestaPromedio);
    assert.ok(roundRobin.metricasDetalladas.every((row) => row.completado));
  }

  const metricas = calcularMetricas({
    procesos: workload(),
    linea: [{ tick: 0, pid: 1 }, { tick: 1, pid: 1 }, { tick: 2, pid: 2 }],
    ticksTotales: 4,
  });
  assert.equal(metricas.resumen.ticksOcupados, 3);
  assert.equal(metricas.resumen.utilizacionCpu, 75);
});

test('Round Robin interactivo reubica la READY al final y detecta cambios de contexto', () => {
  const first = createProcess('first', 2, 4);
  const second = createProcess('second', 1, 4);
  first.admitir();
  second.admitir();
  let result = ejecutarTickInteractivo({
    procesos: [first, second],
    algoritmo: ALGORITMOS.ROUND_ROBIN,
    quantumMax: 2,
    tickActual: 1,
  });
  assert.equal(result.eventoRegistro.nombre, 'first');

  result = ejecutarTickInteractivo({
    procesos: result.procesos,
    algoritmo: ALGORITMOS.ROUND_ROBIN,
    quantumMax: 2,
    quantumRestanteActual: result.quantumRestante,
    procesoRunningId: result.procesoRunningId,
    tickActual: 2,
    ultimoPid: first.pid,
  });
  assert.equal(result.procesoRunningId, null);
  assert.equal(first.estado, 'READY');

  result = ejecutarTickInteractivo({
    procesos: result.procesos,
    algoritmo: ALGORITMOS.ROUND_ROBIN,
    quantumMax: 2,
    quantumRestanteActual: result.quantumRestante,
    tickActual: 3,
    ultimoPid: first.pid,
  });
  assert.equal(result.eventoRegistro.nombre, 'second');
  assert.deepEqual(result.cambioContexto, { desde: first.pid, hacia: second.pid });
});

test('VFS crea, consulta, escribe y elimina archivos y emite eventos del esquema requerido', () => {
  const events = [];
  const vfs = new VirtualFileSystem({ '/home': [] }, (event) => events.push(event));
  vfs.createDirectory('/home/logs', {}, { role: 'ADMIN' });
  const created = vfs.createFile('/home/logs/run.log', 'start', {}, { role: 'ADMIN' });
  assert.equal(vfs.readFile('/home/logs/run.log', { role: 'ADMIN' }).content, 'start');
  vfs.writeFile('/home/logs/run.log', 'complete', { role: 'ADMIN' });
  assert.equal(vfs.readFile('/home/logs/run.log', { role: 'ADMIN' }).content, 'complete');
  assert.equal(vfs.listDirectory('/home/logs', { role: 'ADMIN' }).files[0].id, created.id);
  vfs.deleteFile('/home/logs/run.log', { role: 'ADMIN' });
  assert.deepEqual(events.map((event) => event.type), [
    'FILE_CREATED',
    'FILE_CREATED',
    'FILE_READ',
    'FILE_WRITTEN',
    'FILE_READ',
    'FILE_DELETED',
  ]);
  assert.throws(() => vfs.createFile('/home/logs/../escape.txt', 'x', {}, { role: 'ADMIN' }), /Ruta no permitida/);
});

test('syscalls persiste eventos de creación, asignación, terminación y liberación', async () => {
  const memory = new MemoryManager();
  const persistence = new InMemoryPersistenceAdapter();
  const syscalls = new SystemCalls(new EventEngine(), persistence, memory);
  const initialFree = memory.getFreeBlocksCount();
  const processes = [1, 2, 3, 4].map((index) =>
    syscalls.createProcess(
      { name: `resource_probe_${index}`, memoryBlocksCount: index, tiempoTotal: 2 },
      { role: 'USER' }
    ).process
  );
  processes.forEach((process) => syscalls.terminateProcess(process.pid, { role: 'USER' }, processes));
  await new Promise((resolve) => setImmediate(resolve));

  const events = await persistence.loadHistory();
  const types = events.map((event) => event.type);
  assert.ok(types.includes('PROCESS_CREATED'));
  assert.ok(types.includes('MEMORY_ALLOCATED'));
  assert.ok(types.includes('PROCESS_STATE_CHANGED'));
  assert.ok(types.includes('PROCESS_TERMINATED'));
  assert.ok(types.includes('MEMORY_RELEASED'));
  assert.equal(memory.getFreeBlocksCount(), initialFree);
});

test('las operaciones VFS llamadas por syscalls persisten eventos en el adaptador actual', async () => {
  const persistence = new InMemoryPersistenceAdapter();
  const syscalls = new SystemCalls(new EventEngine(), persistence, new MemoryManager());
  syscalls.attachVirtualFileSystem(new VirtualFileSystem({ '/home': [] }));
  syscalls.createVirtualFile('/home/persisted.txt', 'payload', {}, { role: 'ADMIN' });
  await new Promise((resolve) => setImmediate(resolve));

  const events = await persistence.loadHistory();
  assert.equal(events[0].type, 'FILE_CREATED');
  assert.equal(events[0].source, 'VFS');
});
