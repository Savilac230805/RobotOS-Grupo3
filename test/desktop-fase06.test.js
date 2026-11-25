import test from 'node:test';
import assert from 'node:assert/strict';
import { syscalls } from '../src/core/syscalls.js';
import { processManager } from '../src/core/processManager.js';
import { VirtualFileSystem } from '../src/core/virtualFileSystem.js';
import { memoryManager } from '../src/core/memoryManager.js';
import { ALGORITMOS } from '../src/core/scheduler.js';

test('Fase 06 - 1: Syscalls permite crear y terminar procesos desde comandos de terminal', () => {
  const context = { role: 'USER' };
  
  // Proceso creado mediante syscall (comando: process start TestProc 4)
  const res = syscalls.createProcess(
    {
      name: 'TerminalJob',
      priority: 4,
      memory: 2,
    },
    context
  );

  assert.ok(res.success);
  assert.ok(res.process);
  assert.equal(res.process.nombre.toLowerCase(), 'terminaljob');
  assert.equal(res.process.prioridad, 4);

  // Terminación mediante syscall (comando: process terminate <pid>)
  const termRes = syscalls.terminateProcess(res.process.pid, context);
  assert.ok(termRes.success);
  assert.equal(termRes.process.estado, 'TERMINATED');
});

test('Fase 06 - 2: Terminal y Configuración soportan algoritmos válidos del Scheduler', () => {
  assert.equal(ALGORITMOS.PRIORIDAD, 'PRIORIDAD');
  assert.equal(ALGORITMOS.ROUND_ROBIN, 'ROUND_ROBIN');
});

test('Fase 06 - 3: VFS soporta operaciones de FileExplorer vía Syscalls protegidas', () => {
  const vfs = new VirtualFileSystem();
  syscalls.attachVirtualFileSystem(vfs);

  const adminContext = { role: 'ADMIN' };
  const userContext = { role: 'USER' };

  // Crear directorios iniciales
  syscalls.createDirectory('/home', {}, userContext);
  syscalls.createDirectory('/system', {}, adminContext);

  // Crear archivo en /home
  const fileCreated = syscalls.createVirtualFile('/home/test-doc.txt', 'Hola RobotOS', userContext);
  assert.ok(fileCreated);

  // Leer archivo
  const fileRead = syscalls.readVirtualFile('/home/test-doc.txt', userContext);
  assert.equal(fileRead.content, 'Hola RobotOS');

  // Eliminar archivo
  const deleted = syscalls.deleteVirtualFile('/home/test-doc.txt', userContext);
  assert.ok(deleted);

  // Intento de modificar /system como USER debe rechazarse
  assert.throws(() => {
    syscalls.createVirtualFile('/system/hack.sys', 'payload', userContext);
  }, /ADMIN/);
});

test('Fase 06 - 4: Memory Manager entrega estadísticas completas para Resource Monitor', () => {
  const stats = memoryManager.getStats();
  assert.ok(stats);
  assert.equal(stats.totalBlocks, 64);
  assert.equal(stats.kernelBlocks, 8);
  assert.ok(stats.freeBlocks >= 0);
  assert.ok(typeof stats.usedBlocks === 'number');
});

test('Fase 06 - Corrección Crítica: Creación de procesos tolera todos los formatos de nombre válidos', () => {
  const context = { role: 'USER' };

  // 1. name estándar
  const r1 = syscalls.sys_create_process({ name: 'ProcesoAlpha', priority: 'Alta', memoryBlocksCount: 2 }, context);
  assert.ok(r1.success);
  assert.equal(r1.process.nombre, 'procesoalpha');
  assert.equal(r1.process.name, 'procesoalpha');

  // 2. nombre en español
  const r2 = syscalls.sys_create_process({ nombre: 'ProcesoBeta', prioridad: 2, bloquesMemoria: 2 }, context);
  assert.ok(r2.success);
  assert.equal(r2.process.nombre, 'procesobeta');

  // 3. processName / process_name
  const r3 = syscalls.createProcess({ processName: 'ProcesoGamma', memory: 2 }, context);
  assert.ok(r3.success);
  assert.equal(r3.process.nombre, 'procesogamma');

  const r4 = syscalls.createProcess({ process_name: 'ProcesoDelta', memoryBlocks: 2 }, context);
  assert.ok(r4.success);
  assert.equal(r4.process.nombre, 'procesodelta');

  // 4. payload.name (como llega en algunos eventos)
  const r5 = syscalls.createProcess({ payload: { name: 'ProcesoEpsilon' } }, context);
  assert.ok(r5.success);
  assert.equal(r5.process.nombre, 'procesoepsilon');

  // 5. string directo
  const r6 = syscalls.sys_create_process('ProcesoZeta', context);
  assert.ok(r6.success);
  assert.equal(r6.process.nombre, 'procesozeta');

  // 6. Verificar que todos están registrados en ProcessManager
  [r1, r2, r3, r4, r5, r6].forEach((r) => {
    const fromMgr = processManager.get(r.process.pid);
    assert.ok(fromMgr, `Proceso PID ${r.process.pid} debe existir en ProcessManager`);
    assert.equal(fromMgr.nombre, r.process.nombre);
    assert.equal(fromMgr.estado, 'NEW');
  });

  // Limpieza: terminar procesos creados
  [r1, r2, r3, r4, r5, r6].forEach((r) => {
    syscalls.sys_terminate_process(r.process.pid, context);
  });
});

test('Fase 06 - Corrección Crítica: Rechazo estricto de nombres vacíos o inválidos', () => {
  const context = { role: 'USER' };

  // Caso 1: string vacío
  assert.throws(() => {
    syscalls.sys_create_process({ name: '' }, context);
  }, /El nombre del proceso no puede estar vacío/);

  // Caso 2: solo espacios
  assert.throws(() => {
    syscalls.createProcess({ name: '    ' }, context);
  }, /El nombre del proceso no puede estar vacío/);

  // Caso 3: objeto vacío sin propiedad de nombre
  assert.throws(() => {
    syscalls.sys_create_process({}, context);
  }, /El nombre del proceso no puede estar vacío/);

  // Caso 4: nombre null
  assert.throws(() => {
    syscalls.createProcess({ name: null }, context);
  }, /El nombre del proceso no puede estar vacío/);

  // Caso 5: nombre tipo no string
  assert.throws(() => {
    syscalls.sys_create_process({ name: 12345 }, context);
  }, /El nombre del proceso no puede estar vacío/);
});
