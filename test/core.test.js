// test/core.test.js
// Suite integral de pruebas unitarias para RobotOS Core
// Cubre: Proceso, CPU, Scheduler, MemoryManager, BootManager, EventEngine, Syscalls e IPersistenceAdapter

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Proceso,
  ESTADOS,
  reiniciarContadorPid,
  simular,
  dibujarLinea,
  ALGORITMOS,
  MemoryManager,
  TOTAL_BLOCKS,
  KERNEL_BLOCKS_COUNT,
  BootManager,
  BOOT_STAGES,
  EventEngine,
  EVENT_SOURCES,
  EVENT_SEVERITY,
  SystemCalls,
  InMemoryPersistenceAdapter,
  SYNC_STATUS,
} from '../src/core/index.js';

function crear(nombre, prioridad, tiempoTotal, cpuRequerida = 10) {
  return new Proceso({ nombre, prioridad, memoriaRequerida: 10, cpuRequerida, tiempoTotal });
}

function metricaDe(resultado, nombre) {
  return resultado.metricas.find((m) => m.nombre === nombre);
}

// Crea un SystemCalls con su propia memoria para que las pruebas no se contaminen entre sí
function crearSyscalls(opciones = {}) {
  const mem = opciones.mem || new MemoryManager();
  const engine = opciones.engine || undefined;
  return { sys: new SystemCalls(engine, undefined, mem), mem };
}

const datosBase = {
  nombre: 'Control de iluminación',
  prioridad: 3,
  memoriaRequerida: 64,
  cpuRequerida: 10,
  tiempoTotal: 3,
};

// ==========================================
// 1. CLASE PROCESO (8 Tests)
// ==========================================
test('Proceso: un proceso nuevo empieza en NEW con pid 1 y tiempo restante completo', () => {
  reiniciarContadorPid();
  const p = new Proceso(datosBase);
  assert.equal(p.estado, ESTADOS.NEW);
  assert.equal(p.pid, 1);
  assert.equal(p.tiempoRestante, 3);
});

test('Proceso: cada proceso nuevo recibe un pid distinto y creciente', () => {
  reiniciarContadorPid();
  const a = new Proceso(datosBase);
  const b = new Proceso(datosBase);
  assert.equal(a.pid, 1);
  assert.equal(b.pid, 2);
});

test('Proceso: rechaza datos inválidos al crear un proceso', () => {
  assert.throws(() => new Proceso({ ...datosBase, nombre: '' }), /nombre/i);
  assert.throws(() => new Proceso({ ...datosBase, prioridad: 0 }), /prioridad/i);
  assert.throws(() => new Proceso({ ...datosBase, memoriaRequerida: -1 }), /memoria/i);
  assert.throws(() => new Proceso({ ...datosBase, cpuRequerida: 150 }), /CPU/);
  assert.throws(() => new Proceso({ ...datosBase, tiempoTotal: 1.5 }), /entero/);
});

test('Proceso: ciclo de vida completo: NEW, READY, RUNNING, WAITING, READY, RUNNING, TERMINATED', () => {
  const p = new Proceso(datosBase);
  p.admitir();
  assert.equal(p.estado, ESTADOS.READY);
  p.ejecutar();
  assert.equal(p.estado, ESTADOS.RUNNING);
  p.pausar();
  assert.equal(p.estado, ESTADOS.WAITING);
  p.reanudar();
  assert.equal(p.estado, ESTADOS.READY);
  p.ejecutar();
  p.finalizar();
  assert.equal(p.estado, ESTADOS.TERMINATED);
});

test('Proceso: un proceso READY también puede pausarse', () => {
  const p = new Proceso(datosBase);
  p.admitir();
  p.pausar();
  assert.equal(p.estado, ESTADOS.WAITING);
});

test('Proceso: una transición inválida lanza error y no cambia el estado', () => {
  const p = new Proceso(datosBase);
  assert.throws(() => p.ejecutar(), /Transición no permitida/);
  assert.equal(p.estado, ESTADOS.NEW);
  assert.throws(() => p.pausar(), /Transición no permitida/);
  assert.equal(p.estado, ESTADOS.NEW);
});

test('Proceso: un proceso TERMINATED no puede volver a ningún estado', () => {
  const p = new Proceso(datosBase);
  p.finalizar();
  assert.equal(p.estado, ESTADOS.TERMINATED);
  assert.throws(() => p.admitir(), /Transición no permitida/);
  assert.throws(() => p.ejecutar(), /Transición no permitida/);
  assert.throws(() => p.finalizar(), /Transición no permitida/);
});

test('Proceso: serializa a JSON correctamente para persistencia y telemetría', () => {
  reiniciarContadorPid();
  const p = new Proceso(datosBase);
  const json = p.toJSON();
  assert.equal(json.pid, 1);
  assert.equal(json.nombre, 'Control de iluminación');
  assert.equal(json.estado, 'NEW');
  assert.equal(json.memoryBlocks, 4);
});

// ==========================================
// 2. CPU Y SCHEDULER (9 Tests)
// ==========================================
test('Scheduler: PRIORIDAD ejecuta primero el proceso con número de prioridad más bajo', () => {
  reiniciarContadorPid();
  const a = crear('A', 3, 2);
  const b = crear('B', 1, 2);
  const c = crear('C', 2, 1);
  const r = simular([a, b, c], { algoritmo: ALGORITMOS.PRIORIDAD });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ['B', 'B', 'C', 'A', 'A']
  );
});

test('Scheduler: PRIORIDAD en caso de empate gana el que se creó primero', () => {
  reiniciarContadorPid();
  const a = crear('A', 2, 1);
  const b = crear('B', 2, 1);
  const r = simular([b, a], { algoritmo: ALGORITMOS.PRIORIDAD });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ['A', 'B']
  );
});

test('Scheduler: PRIORIDAD calcula correctamente los tiempos de espera', () => {
  reiniciarContadorPid();
  const r = simular([crear('A', 3, 2), crear('B', 1, 2), crear('C', 2, 1)], {
    algoritmo: ALGORITMOS.PRIORIDAD,
  });
  assert.equal(metricaDe(r, 'B').espera, 0);
  assert.equal(metricaDe(r, 'C').espera, 2);
  assert.equal(metricaDe(r, 'A').espera, 3);
});

test('Scheduler: ROUND ROBIN alterna los procesos según el quantum', () => {
  reiniciarContadorPid();
  const r = simular([crear('A', 1, 3), crear('B', 1, 2)], {
    algoritmo: ALGORITMOS.ROUND_ROBIN,
    quantum: 2,
  });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ['A', 'A', 'B', 'B', 'A']
  );
  assert.equal(metricaDe(r, 'A').espera, 2);
  assert.equal(metricaDe(r, 'B').espera, 2);
});

test('Scheduler: ROUND ROBIN rechaza un quantum inválido', () => {
  const p = crear('A', 1, 2);
  assert.throws(
    () => simular([p], { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 0 }),
    /quantum/
  );
});

test('CPU: al terminar la simulación todos los procesos quedan TERMINATED sin tiempo restante', () => {
  const procesos = [crear('A', 1, 3), crear('B', 2, 2)];
  simular(procesos, { algoritmo: ALGORITMOS.ROUND_ROBIN, quantum: 1 });
  for (const p of procesos) {
    assert.equal(p.estado, ESTADOS.TERMINATED);
    assert.equal(p.tiempoRestante, 0);
  }
});

test('CPU: un proceso pausado (WAITING) no entra al planificador y se informa como omitido', () => {
  reiniciarContadorPid();
  const a = crear('A', 1, 2);
  const b = crear('B', 2, 2);
  b.admitir();
  b.pausar();
  const r = simular([a, b], { algoritmo: ALGORITMOS.PRIORIDAD });
  assert.deepEqual(
    r.linea.map((t) => t.nombre),
    ['A', 'A']
  );
  assert.equal(r.omitidos.length, 1);
  assert.equal(r.omitidos[0].nombre, 'B');
  assert.equal(b.estado, ESTADOS.WAITING);
});

test('CPU: el uso de CPU promedio se calcula con la CPU requerida de cada tick', () => {
  const r = simular([crear('A', 1, 2, 40), crear('B', 2, 2, 20)], {
    algoritmo: ALGORITMOS.PRIORIDAD,
  });
  assert.equal(r.usoCpuPromedio, 30);
  assert.equal(r.duracionTotal, 4);
});

test('CPU: dibujarLinea muestra una fila por proceso', () => {
  const r = simular([crear('A', 1, 2), crear('B', 2, 1)], { algoritmo: ALGORITMOS.PRIORIDAD });
  const dibujo = dibujarLinea(r.linea);
  assert.equal(dibujo, 'A | ██·\nB | ··█');
});

// ==========================================
// 3. MEMORY MANAGER (5 Tests)
// ==========================================
test('MemoryManager: inicializa 64 bloques de 16MB con 8 bloques reservados para Kernel', () => {
  const mem = new MemoryManager();
  const blocks = mem.getBlocks();
  assert.equal(blocks.length, TOTAL_BLOCKS);
  assert.equal(mem.getKernelBlocksCount(), KERNEL_BLOCKS_COUNT);
  assert.equal(mem.getFreeBlocksCount(), 56);
  assert.equal(blocks[0].state, 'KERNEL');
  assert.equal(blocks[7].state, 'KERNEL');
  assert.equal(blocks[8].state, 'FREE');
});

test('MemoryManager: rechaza asignación si se solicitan más bloques que los disponibles', () => {
  const mem = new MemoryManager();
  assert.equal(mem.canAllocate(60), false);
  assert.throws(() => mem.allocate('proceso_pesado', 60), /Memoria insuficiente/);
});

test('MemoryManager: asigna bloques contiguos y actualiza métricas de memoria libre', () => {
  const mem = new MemoryManager();
  const res = mem.allocate('lighting_daemon', 4, '#10B981');
  assert.equal(res.success, true);
  assert.equal(res.allocatedBlocks, 4);
  assert.equal(res.allocatedMB, 64);
  assert.equal(mem.getFreeBlocksCount(), 52);
  const allocated = mem.getBlocks().filter((b) => b.processName === 'lighting_daemon');
  assert.equal(allocated.length, 4);
  assert.equal(allocated[0].state, 'ALLOCATED');
});

test('MemoryManager: libera todos los bloques de un proceso al finalizar', () => {
  const mem = new MemoryManager();
  mem.allocate('proc_temporal', 6);
  assert.equal(mem.getFreeBlocksCount(), 50);
  const freed = mem.freeProcessMemory('proc_temporal');
  assert.equal(freed, 6);
  assert.equal(mem.getFreeBlocksCount(), 56);
});

test('MemoryManager: protege bloques de Kernel y libera bloques de usuario', () => {
  const mem = new MemoryManager();
  // Los bloques 0 a 7 (Kernel) nunca se pueden liberar
  assert.throws(() => mem.freeBlock(0), /espacio protegido del Kernel/);
  assert.throws(() => mem.freeBlock(7), /espacio protegido del Kernel/);
  // Un bloque de usuario sí se puede liberar
  const asig = mem.allocate('test_proc', 2);
  assert.equal(mem.freeBlock(asig.blockIds[0]).success, true);
  assert.equal(mem.getFreeBlocksCount(), 55);
  // ID inválido
  assert.throws(() => mem.freeBlock(999), /inválido/);
});

// ==========================================
// 4. BOOT MANAGER (3 Tests)
// ==========================================
test('BootManager: arranque exitoso ejecuta las 8 etapas completas en orden', async () => {
  const boot = new BootManager();
  const res = await boot.executeBoot();
  assert.equal(res.success, true);
  assert.equal(res.safeMode, false);
  assert.equal(res.bootLog.length, 8);
  assert.equal(res.bootLog[0].id, 'POWER_ON');
  assert.equal(res.bootLog[7].id, 'SYSTEM_READY');
  for (const stage of res.bootLog) {
    assert.equal(stage.status, 'COMPLETED');
    assert.ok(stage.timestamp);
    assert.ok(stage.result);
  }
});

test('BootManager: simulación de fallo en una etapa activa Safe Mode y aborta etapas siguientes', async () => {
  const boot = new BootManager();
  // Forzar fallo en la etapa 4: PROCESS_MGR_INIT (Process Manager & Scheduler)
  const res = await boot.executeBoot({ failAtStage: 4 });
  assert.equal(res.success, false);
  assert.equal(res.safeMode, true);
  assert.equal(res.bootLog.length, 4);
  const failedStage = res.bootLog[3];
  assert.equal(failedStage.id, 'PROCESS_MGR_INIT');
  assert.equal(failedStage.status, 'FAILED');
  assert.ok(failedStage.error.includes('etapa 4'));
  assert.equal(boot.isSystemReady(), false);
});

test('BootManager: recupera log de arranque y confirma estado de sistema', async () => {
  const boot = new BootManager();
  await boot.executeBoot();
  assert.equal(boot.isSystemReady(), true);
  assert.equal(boot.getBootLog().length, 8);
});

// ==========================================
// 5. EVENT ENGINE (3 Tests)
// ==========================================
test('EventEngine: emite evento respetando el esquema JSON fijo exigido', () => {
  const engine = new EventEngine();
  const event = engine.emit({
    type: 'DEVICE_STATE_CHANGED',
    source: EVENT_SOURCES.IOT_MANAGER,
    severity: EVENT_SEVERITY.INFO,
    pid: 101,
    payload: { deviceId: 'd1', status: 'ON' },
  });

  assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.ok(event.timestamp);
  assert.equal(event.source, 'IOT_MANAGER');
  assert.equal(event.type, 'DEVICE_STATE_CHANGED');
  assert.equal(event.severity, 'INFO');
  assert.equal(event.pid, 101);
  assert.equal(event.payload.deviceId, 'd1');
  assert.equal(event.payload.status, 'ON');
});

test('EventEngine: rechaza eventos sin tipo o con tipo no string', () => {
  const engine = new EventEngine();
  assert.throws(() => engine.emit({ source: 'KERNEL' }), /tipo de evento/);
  assert.throws(() => engine.emit({ type: 12345 }), /tipo de evento/);
});

test('EventEngine: notifica suscriptores específicos y globales correctamente', () => {
  const engine = new EventEngine();
  let specificCalled = false;
  let globalCalled = false;

  engine.subscribe('TEST_EVENT', (e) => {
    specificCalled = true;
  });
  engine.subscribeAll((e) => {
    globalCalled = true;
  });

  engine.emit({ type: 'TEST_EVENT', payload: { ok: true } });
  assert.equal(specificCalled, true);
  assert.equal(globalCalled, true);
});

// ==========================================
// 6. SYSTEM CALLS (reglas de sandbox)
// ==========================================
test('Syscalls: sys_create_process permite visitantes en sandbox y rechaza parámetros inválidos', () => {
  const { sys } = crearSyscalls();

  // Un visitante crea un proceso en su sandbox: permitido
  const res = sys.createProcess({ name: 'mi_proceso' }, { role: 'GUEST' });
  assert.equal(res.success, true);
  assert.equal(res.process.estado, 'NEW');

  // Nombre vacío: rechazado para cualquier rol
  assert.throws(() => sys.createProcess({ name: '' }, { role: 'ADMIN' }), /no puede estar vacío/);
  assert.throws(() => sys.createProcess({ name: '' }, { role: 'GUEST' }), /no puede estar vacío/);

  // Memoria excesiva: rechazada
  assert.throws(
    () => sys.createProcess({ name: 'gigante', memoryBlocksCount: 999 }, { role: 'GUEST' }),
    /Memoria insuficiente/
  );
});

test('Syscalls: sys_create_process ejecuta con ADMIN, valida memoria y emite evento', () => {
  const { sys } = crearSyscalls();
  const res = sys.createProcess(
    { name: 'proc_autorizado', priority: 'Alta', memoryBlocksCount: 2, cpu: 15 },
    { role: 'ADMIN', user: { email: 'admin@robotos.local' } }
  );
  assert.equal(res.success, true);
  assert.equal(res.process.nombre, 'proc_autorizado');
  assert.equal(res.process.estado, 'NEW');
  assert.equal(res.memory.allocatedBlocks, 2);
});

test('Syscalls: sys_create_process no deja memoria asignada si el PCB es inválido', () => {
  const { sys, mem } = crearSyscalls();
  const libresAntes = mem.getFreeBlocksCount();

  // tiempoTotal decimal: el constructor de Proceso lo rechaza
  assert.throws(
    () => sys.createProcess({ name: 'proc_malo', tiempoTotal: 2.5, memoryBlocksCount: 3 }, { role: 'GUEST' }),
    /entero/
  );

  // Los 3 bloques reservados deben haberse devuelto
  assert.equal(mem.getFreeBlocksCount(), libresAntes);
});

test('Syscalls: sys_create_process rechaza nombres duplicados de procesos vivos', () => {
  const { sys } = crearSyscalls();
  const primero = sys.createProcess({ name: 'dup_proc' }, { role: 'GUEST' });

  assert.throws(
    () => sys.createProcess({ name: 'dup_proc', existingProcesses: [primero.process] }, { role: 'GUEST' }),
    /Ya existe un proceso activo/
  );

  // Una vez finalizado, el nombre queda disponible de nuevo
  sys.terminateProcess(primero.process.pid, { role: 'GUEST' }, [primero.process]);
  const segundo = sys.createProcess(
    { name: 'dup_proc', existingProcesses: [primero.process] },
    { role: 'GUEST' }
  );
  assert.equal(segundo.success, true);
});

test('Syscalls: sys_terminate_process protege procesos de sistema', () => {
  const { sys } = crearSyscalls();
  const procSistema = new Proceso({ ...datosBase, nombre: 'kernel_guard', isSystem: true });
  const procUsuario = new Proceso({ ...datosBase, nombre: 'user_app', isSystem: false });

  // Un USER no puede finalizar un proceso del sistema
  assert.throws(
    () => sys.terminateProcess(procSistema.pid, { role: 'USER' }, [procSistema]),
    /proceso crítico del sistema sin rol ADMIN/
  );
  assert.notEqual(procSistema.estado, ESTADOS.TERMINATED);

  // Un USER sí puede finalizar su proceso de usuario
  const res = sys.terminateProcess(procUsuario.pid, { role: 'USER' }, [procUsuario]);
  assert.equal(res.success, true);
  assert.equal(procUsuario.estado, ESTADOS.TERMINATED);

  // Un ADMIN sí puede finalizar un proceso del sistema
  const res2 = sys.terminateProcess(procSistema.pid, { role: 'ADMIN' }, [procSistema]);
  assert.equal(res2.success, true);
  assert.equal(procSistema.estado, ESTADOS.TERMINATED);

  // Finalizar uno ya finalizado da un error claro
  assert.throws(
    () => sys.terminateProcess(procUsuario.pid, { role: 'USER' }, [procUsuario]),
    /ya está finalizado/
  );
});

test('Syscalls: terminar un proceso libera exactamente su memoria', () => {
  const { sys, mem } = crearSyscalls();
  const libresAntes = mem.getFreeBlocksCount();

  const res = sys.createProcess({ name: 'proc_memoria', memoryBlocksCount: 4 }, { role: 'GUEST' });
  assert.equal(mem.getFreeBlocksCount(), libresAntes - 4);

  const fin = sys.terminateProcess(res.process.pid, { role: 'GUEST' }, [res.process]);
  assert.equal(fin.freedBlocks, 4);
  assert.equal(mem.getFreeBlocksCount(), libresAntes);
});

test('Syscalls: freeMemory protege bloques de Kernel y de procesos activos', () => {
  const { sys, mem } = crearSyscalls();

  // Bloques de Kernel: nunca, con ningún rol
  assert.throws(() => sys.freeMemory(0, { role: 'ADMIN' }), /espacio protegido del Kernel/);
  assert.throws(() => sys.freeMemory(5, { role: 'GUEST' }), /espacio protegido del Kernel/);

  // Bloque de un proceso vivo: rechazado
  const res = sys.createProcess({ name: 'proc_vivo', memoryBlocksCount: 2 }, { role: 'GUEST' });
  const bloque = res.memory.blockIds[0];
  assert.throws(
    () => sys.freeMemory(bloque, { role: 'GUEST' }, [res.process]),
    /proceso activo/
  );

  // Tras finalizar el proceso, toda su memoria queda libre
  sys.terminateProcess(res.process.pid, { role: 'GUEST' }, [res.process]);
  assert.equal(mem.getFreeBlocksCount(), 56);
});

test('Syscalls: VFS readFile y writeFile validan rutas y protegen /system', () => {
  const { sys } = crearSyscalls();
  const vfs = {
    '/system': [{ name: 'kernel.sys', size: '2 MB' }],
    '/apps': [{ name: 'notes.app', size: '10 KB' }],
  };

  // Ruta inválida
  assert.throws(() => sys.readFile('invalido', vfs), /Ruta inválida/);
  // Archivo inexistente
  assert.throws(() => sys.readFile('/apps/inexistente.txt', vfs), /no encontrado/);
  // Lectura correcta
  const readRes = sys.readFile('/apps/notes.app', vfs);
  assert.equal(readRes.success, true);

  // Escritura en /system por usuario no-ADMIN -> Denegada
  assert.throws(
    () => sys.writeFile('/system/hack.sys', 'malware', vfs, {}, { role: 'USER' }),
    /solo el rol ADMIN/
  );
  // Escritura en /apps con ADMIN -> Permitida
  const writeRes = sys.writeFile('/apps/nueva.app', 'código', vfs, {}, { role: 'ADMIN' });
  assert.equal(writeRes.success, true);
});

test('Syscalls: renameFile y deleteFile operan sin duplicar y protegen /system', () => {
  const { sys } = crearSyscalls();
  const vfs = {
    '/system': [{ id: 'f1', name: 'kernel.sys', size: '2 MB' }],
    '/apps': [
      { id: 'f2', name: 'notes.app', size: '10 KB' },
      { id: 'f3', name: 'otro.app', size: '1 KB' },
    ],
  };

  // Renombrar no crea un archivo nuevo
  const r = sys.renameFile('/apps', 'f2', 'notas.app', vfs, { role: 'GUEST' });
  assert.equal(r.file.name, 'notas.app');
  assert.equal(vfs['/apps'].length, 2);

  // Nombre duplicado y nombre vacío: rechazados
  assert.throws(() => sys.renameFile('/apps', 'f2', 'otro.app', vfs, { role: 'GUEST' }), /Ya existe/);
  assert.throws(() => sys.renameFile('/apps', 'f2', '   ', vfs, { role: 'GUEST' }), /no puede estar vacío/);

  // /system protegido para renombrar y eliminar
  assert.throws(() => sys.renameFile('/system', 'f1', 'x.sys', vfs, { role: 'USER' }), /solo el rol ADMIN/);
  assert.throws(() => sys.deleteFile('/system', 'f1', vfs, { role: 'USER' }), /solo el rol ADMIN/);

  // Eliminar en /apps está permitido
  const d = sys.deleteFile('/apps', 'f3', vfs, { role: 'GUEST' });
  assert.equal(d.success, true);
  assert.equal(vfs['/apps'].length, 1);

  // ADMIN sí puede eliminar en /system
  assert.equal(sys.deleteFile('/system', 'f1', vfs, { role: 'ADMIN' }).success, true);
  assert.equal(vfs['/system'].length, 0);
});

test('Syscalls: deviceWrite permite operar dispositivos en el sandbox y registra el estado anterior', () => {
  const engine = new EventEngine();
  const { sys } = crearSyscalls({ engine });
  const cerradura = { id: 'd5', name: 'Cerradura Principal', type: 'lock', status: 'BLOQUEADA' };
  const luz = { id: 'd1', name: 'Luz Salón', type: 'light', status: 'OFF' };

  const eventos = [];
  engine.subscribe('DEVICE_STATE_CHANGED', (e) => eventos.push(e));

  // Un visitante conmuta una luz y una cerradura en su sandbox
  const resLuz = sys.deviceWrite('d1', 'ON', [luz], { role: 'GUEST' });
  assert.equal(resLuz.status, 'ON');

  const resCerr = sys.deviceWrite('d5', 'DESBLOQUEADA', [cerradura], { role: 'GUEST' });
  assert.equal(resCerr.status, 'DESBLOQUEADA');

  // El evento guarda el estado anterior y el nuevo
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].payload.previous, 'OFF');
  assert.equal(eventos[0].payload.current, 'ON');
  assert.equal(eventos[1].payload.previous, 'BLOQUEADA');
  assert.equal(eventos[1].payload.current, 'DESBLOQUEADA');

  // Dispositivo inexistente
  assert.throws(() => sys.deviceWrite('zzz', 'ON', [luz], { role: 'GUEST' }), /no encontrado/);
});

// ==========================================
// 7. PERSISTENCE ADAPTER (3 Tests)
// ==========================================
test('PersistenceAdapter: modo Sandbox aísla mutaciones de visitantes anónimos sin alterar almacenamiento compartido', async () => {
  const adapter = new InMemoryPersistenceAdapter();
  // Modo Sandbox activo (visitante anónimo)
  adapter.setSandboxMode(true);
  assert.equal(adapter.isSandboxMode(), true);

  await adapter.saveEvent({ id: 'evt_sandbox_1', type: 'LOCAL_ACTION' });
  const sandboxHistory = await adapter.loadHistory();
  assert.equal(sandboxHistory.length, 1);

  // Cambiar a modo ADMIN (compartido)
  adapter.setSandboxMode(false);
  assert.equal(adapter.isSandboxMode(), false);
  const sharedHistory = await adapter.loadHistory();
  // El almacenamiento compartido debe estar limpio (no contaminado por el visitante anónimo)
  assert.equal(sharedHistory.length, 0);
});

test('PersistenceAdapter: modo ADMIN persiste en almacenamiento compartido', async () => {
  const adapter = new InMemoryPersistenceAdapter();
  adapter.setSandboxMode(false);

  await adapter.saveEvent({ id: 'evt_admin_1', type: 'ADMIN_CONFIG' });
  const history = await adapter.loadHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].type, 'ADMIN_CONFIG');
});

test('PersistenceAdapter: cola de reintentos procesa operaciones fallidas y actualiza estado de sincronización', async () => {
  const adapter = new InMemoryPersistenceAdapter();
  assert.equal(adapter.getSyncStatus(), SYNC_STATUS.IDLE);

  let intentos = 0;
  // Operación que falla la primera vez y pasa en el reintento
  const operacionResiliente = async () => {
    intentos += 1;
    if (intentos === 1) {
      throw new Error('Fallo de red transitorio');
    }
    return true;
  };

  adapter.enqueueRetry(operacionResiliente);
  assert.equal(adapter.retryQueue.length, 1);

  // Primer pase: falla y se reprograma
  const resPase1 = await adapter.processRetryQueue();
  assert.equal(resPase1.processed, 0);
  assert.equal(resPase1.remaining, 1);
  assert.equal(adapter.getSyncStatus(), SYNC_STATUS.ERROR);

  // Segundo pase: tiene éxito y limpia la cola
  const resPase2 = await adapter.processRetryQueue();
  assert.equal(resPase2.processed, 1);
  assert.equal(resPase2.remaining, 0);
  assert.equal(adapter.getSyncStatus(), SYNC_STATUS.IDLE);
});