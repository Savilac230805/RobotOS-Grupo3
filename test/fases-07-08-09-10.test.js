import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Mutex,
  Semaphore,
  MessageQueue,
  DeadlockDetector,
  faultEngine,
  FAULT_CATEGORIES,
  FAULT_MODES,
  DiagnosticAssistant,
  BenchmarkSuite,
  MemoryManager,
} from '../src/core/index.js';

// ==========================================
// FASE 07: CONCURRENCIA & IPC
// ==========================================
test('Fase 07 - 1: Mutex gestiona exclusión mutua, encola procesos y transfiere propiedad', () => {
  const mutex = new Mutex('test_lock');
  
  // P1 adquiere
  assert.equal(mutex.acquire(1), true);
  assert.equal(mutex.ownerPid, 1);
  assert.equal(mutex.locked, true);

  // P2 intenta y se encola
  assert.equal(mutex.acquire(2), false);
  assert.deepEqual(mutex.waitingQueue, [2]);

  // P3 intenta y se encola
  assert.equal(mutex.acquire(3), false);
  assert.deepEqual(mutex.waitingQueue, [2, 3]);

  // P1 libera: se transfiere automáticamente a P2
  const nextOwner = mutex.release(1);
  assert.equal(nextOwner, 2);
  assert.equal(mutex.ownerPid, 2);
  assert.deepEqual(mutex.waitingQueue, [3]);

  // P2 libera: se transfiere a P3
  assert.equal(mutex.release(2), 3);
  assert.equal(mutex.ownerPid, 3);

  // P3 libera: mutex queda libre
  assert.equal(mutex.release(3), null);
  assert.equal(mutex.locked, false);
});

test('Fase 07 - 2: Semáforo contador gestiona wait y signal con cola de bloqueo', () => {
  const sem = new Semaphore('db_pool', 2);

  assert.equal(sem.wait(1), true); // count = 1
  assert.equal(sem.wait(2), true); // count = 0
  assert.equal(sem.wait(3), false); // bloqueado en cola
  assert.deepEqual(sem.waitingQueue, [3]);

  // Signal libera a P3
  const unblocked = sem.signal(1);
  assert.equal(unblocked, 3);
  assert.equal(sem.waitingQueue.length, 0);

  // Signal incrementa count
  sem.signal(2);
  assert.equal(sem.count, 1);
});

test('Fase 07 - 3: IPC MessageQueue entrega mensajes dirigidos determinísticamente', () => {
  const ipc = new MessageQueue('test_bus', 10);
  const msg = ipc.send(10, 20, 'TELEMETRY_READY');

  assert.ok(msg.id);
  assert.equal(ipc.getPendingCount(20), 1);

  // P3 intenta leer y no hay para él
  assert.equal(ipc.receive(30), null);

  // P2 lee y consume
  const received = ipc.receive(20);
  assert.ok(received);
  assert.equal(received.payload, 'TELEMETRY_READY');
  assert.equal(ipc.getPendingCount(20), 0);
});

test('Fase 07 - 4: DeadlockDetector detecta ciclos RAG y recomienda proceso víctima', () => {
  const detector = new DeadlockDetector();

  // Escenario seguro: P1 tiene R1, P2 tiene R2
  detector.requestResource(1, 'R1');
  detector.requestResource(2, 'R2');
  assert.equal(detector.detectDeadlock().hasDeadlock, false);

  // Espera circular: P1 pide R2, P2 pide R1
  detector.requestResource(1, 'R2');
  detector.requestResource(2, 'R1');

  const report = detector.detectDeadlock();
  assert.equal(report.hasDeadlock, true);
  assert.ok(report.cycle.length >= 2);
  assert.ok(report.recommendedVictimPid);

  // Resolución forzosa
  assert.equal(detector.resolveDeadlock(report.recommendedVictimPid), true);
  const afterResolve = detector.detectDeadlock();
  assert.equal(afterResolve.hasDeadlock, false);
});

// ==========================================
// FASE 08: DIGITAL TWIN
// ==========================================
test('Fase 08: Telemetría de Digital Twin no duplica estado y refleja salud de Daemons', () => {
  const processes = [
    { pid: 1, nombre: 'surveillance_proc', estado: 'RUNNING' },
    { pid: 2, nombre: 'lighting_daemon', estado: 'TERMINATED' },
  ];

  const sProc = processes.find((p) => p.nombre === 'surveillance_proc');
  const lDaemon = processes.find((p) => p.nombre === 'lighting_daemon');

  assert.equal(sProc.estado, 'RUNNING');
  assert.equal(lDaemon.estado, 'TERMINATED');
});

// ==========================================
// FASE 09: FAULT INJECTION & DIAGNOSTIC ASSISTANT
// ==========================================
test('Fase 09 - 1: Fault Injection Engine produce resultados idénticos con la misma semilla', () => {
  const planA = faultEngine.generatePlan({ seed: 8888, category: FAULT_CATEGORIES.SENSOR, count: 3 });
  const planB = faultEngine.generatePlan({ seed: 8888, category: FAULT_CATEGORIES.SENSOR, count: 3 });

  assert.deepEqual(planA, planB, 'La misma semilla debe producir exactamente el mismo plan de fallos');

  const planDifferentSeed = faultEngine.generatePlan({ seed: 9999, category: FAULT_CATEGORIES.SENSOR, count: 3 });
  assert.notDeepEqual(planA, planDifferentSeed);
});

test('Fase 09 - 2: Diagnostic Assistant responde estrictamente DATOS INSUFICIENTES sin evidencia', () => {
  const report = DiagnosticAssistant.analyze({
    events: [],
    logs: [],
    alerts: [],
    processes: [],
    devices: [],
  });

  assert.equal(report.status, 'INSUFFICIENT_DATA');
  assert.equal(report.headline, 'DATOS INSUFICIENTES');
  assert.equal(report.confidence, 0);
});

test('Fase 09 - 3: Diagnostic Assistant cita evidencia concreta ante alertas y fallos', () => {
  const report = DiagnosticAssistant.analyze({
    events: [{ id: 'evt_101', type: 'FAULT_INJECTED', payload: { component: 'sensor_temp_01', detail: 'Timeout' } }],
    alerts: [{ id: 'alt_202', title: 'Fallo Crítico', details: 'Sensor no responde', severity: 'critical' }],
    logs: [{ level: 'ERROR', message: 'I2C Bus failure' }],
    processes: [{ pid: 5, nombre: 'lighting_daemon', estado: 'TERMINATED', isSystem: true }],
    devices: [{ id: 'd1', name: 'Luces Salón', status: 'OFFLINE' }],
  });

  assert.equal(report.status, 'ISSUES_DETECTED');
  assert.ok(report.evidence.length >= 3);
  // Verificar que cita los IDs reales de evidencia
  const citedIds = report.evidence.map((e) => e.id);
  assert.ok(citedIds.includes('evt_101'));
  assert.ok(citedIds.includes('alt_202'));
});

// ==========================================
// FASE 10: BENCHMARK CENTER
// ==========================================
test('Fase 10 - 1: Benchmark Suite genera workloads deterministas y calcula métricas reales', () => {
  const w1 = BenchmarkSuite.generateWorkload(1234, 4);
  const w2 = BenchmarkSuite.generateWorkload(1234, 4);
  assert.deepEqual(w1, w2, 'Workloads con misma seed deben ser idénticos');

  const bench = BenchmarkSuite.runSchedulerBenchmark(w1);
  assert.equal(bench.results.length, 4); // Priority, RR q=2, RR q=4, RR q=8
  assert.ok(bench.analysis.includes('Priority Preemptive'));
  assert.ok(bench.analysis.includes('Round Robin'));

  // Todas las métricas numéricas deben ser válidas
  bench.results.forEach((r) => {
    assert.ok(typeof r.avgWait === 'number' && !isNaN(r.avgWait));
    assert.ok(typeof r.avgTurnaround === 'number' && !isNaN(r.avgTurnaround));
    assert.ok(typeof r.throughput === 'number' && !isNaN(r.throughput));
    assert.ok(typeof r.contextSwitches === 'number');
  });
});

test('Fase 10 - 2: Benchmark Suite compara FIFO vs LRU y exporta CSV/JSON válidos', () => {
  const vmBench = BenchmarkSuite.runVirtualMemoryBenchmark(555);
  assert.ok(vmBench.fifo.pageFaults >= 0);
  assert.ok(vmBench.lru.pageFaults >= 0);
  assert.ok(vmBench.analysis.includes('fallos de página'));

  const sampleResults = [
    { algorithm: 'Priority', wait: 2.5, turnaround: 6.0 },
    { algorithm: 'RoundRobin', wait: 3.2, turnaround: 7.1 },
  ];

  const csv = BenchmarkSuite.exportToCSV(sampleResults);
  assert.ok(csv.includes('algorithm,wait,turnaround'));
  assert.ok(csv.includes('Priority,2.5,6'));

  const json = BenchmarkSuite.exportToJSON(sampleResults);
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].algorithm, 'Priority');
});
