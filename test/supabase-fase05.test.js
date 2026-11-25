// test/supabase-fase05.test.js
// Pruebas unitarias de persistencia completa de RobotOS SmartHouse (Fase 05).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabasePersistenceAdapter } from '../src/core/persistence/SupabasePersistenceAdapter.js';
import { SYNC_STATUS } from '../src/core/persistence/IPersistenceAdapter.js';

function createMockClient(role = null) {
  const calls = [];
  return {
    calls,
    auth: {
      getSession: async () => ({
        data: { session: role ? { user: { id: 'admin-user-01' } } : null },
      }),
    },
    from: (table) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { role }, error: null }) }),
          }),
        };
      }
      return {
        insert: async (rows) => {
          calls.push({ table, op: 'insert', rows: Array.isArray(rows) ? rows : [rows] });
          return { error: null, status: 201, data: { id: 'bench-uuid-1' } };
        },
        upsert: async (rows) => {
          calls.push({ table, op: 'upsert', rows: Array.isArray(rows) ? rows : [rows] });
          return { error: null, status: 200 };
        },
        select: (cols) => ({
          order: () => ({
            limit: async () => ({ data: [{ id: 'mock-1', table }], error: null }),
          }),
          single: async () => ({ data: { id: 'bench-uuid-1' }, error: null }),
        }),
      };
    },
  };
}

test('Fase 05 - 1: saveProcess persiste en tabla processes con origin sandbox', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);
  
  const ok = await adapter.saveProcess({
    pid: 10,
    nombre: 'security_agent',
    estado: 'RUNNING',
    prioridad: 2,
    memoryBlocks: 4,
    dispositivo: 'd4',
  });

  assert.equal(ok, true);
  const call = client.calls.find((c) => c.table === 'processes');
  assert.ok(call, 'Debe haber un llamado a la tabla processes');
  assert.equal(call.rows[0].pid, 10);
  assert.equal(call.rows[0].name, 'security_agent');
  assert.equal(call.rows[0].state, 'RUNNING');
  assert.equal(call.rows[0].origin, 'sandbox');
  adapter.dispose();
});

test('Fase 05 - 2: saveCpuHistory persiste métricas de CPU y scheduler en cpu_history', async () => {
  const client = createMockClient('ADMIN');
  const adapter = new SupabasePersistenceAdapter(client);

  const ok = await adapter.saveCpuHistory({
    ticks: 120,
    algoritmo: 'ROUND_ROBIN',
    quantum: 4,
    utilizacionCPU: 78.5,
    tiempoEsperaPromedio: 3.2,
    tiempoRetornoPromedio: 8.5,
    throughput: 1.4,
    contextSwitches: 14,
  });

  assert.equal(ok, true);
  const call = client.calls.find((c) => c.table === 'cpu_history');
  assert.ok(call);
  assert.equal(call.rows[0].ticks, 120);
  assert.equal(call.rows[0].algorithm, 'ROUND_ROBIN');
  assert.equal(call.rows[0].utilization, 78.5);
  assert.equal(call.rows[0].origin, 'admin');
  adapter.dispose();
});

test('Fase 05 - 3: saveMemoryAllocation persiste asignación física en memory_allocations', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);

  const ok = await adapter.saveMemoryAllocation({
    pid: 5,
    processName: 'climate_daemon',
    allocatedBlocks: 8,
    allocatedMB: 128,
    action: 'ALLOCATE',
    fragmentationPercent: 12.5,
  });

  assert.equal(ok, true);
  const call = client.calls.find((c) => c.table === 'memory_allocations');
  assert.ok(call);
  assert.equal(call.rows[0].pid, 5);
  assert.equal(call.rows[0].allocated_blocks, 8);
  assert.equal(call.rows[0].allocated_mb, 128);
  assert.equal(call.rows[0].action, 'ALLOCATE');
  adapter.dispose();
});

test('Fase 05 - 4: savePageFault persiste fallos de página y algoritmo FIFO/LRU en page_faults', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);

  const ok = await adapter.savePageFault({
    pid: 3,
    virtualAddress: 0x2040,
    pageNumber: 8,
    frameId: 12,
    algorithm: 'LRU',
    victimPage: 2,
  });

  assert.equal(ok, true);
  const call = client.calls.find((c) => c.table === 'page_faults');
  assert.ok(call);
  assert.equal(call.rows[0].pid, 3);
  assert.equal(call.rows[0].page_number, 8);
  assert.equal(call.rows[0].frame_id, 12);
  assert.equal(call.rows[0].replacement_algorithm, 'LRU');
  assert.equal(call.rows[0].victim_page, 2);
  adapter.dispose();
});

test('Fase 05 - 5: saveDeviceState actualiza devices y sensor_readings', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);

  const ok = await adapter.saveDeviceState('d6', 'ACTIVO', {
    name: 'Termostato Inteligente',
    type: 'climate',
    zone: 'Salón',
    readingType: 'temperatura',
    value: 23.5,
    unit: '°C',
  });

  assert.equal(ok, true);
  const devCall = client.calls.find((c) => c.table === 'devices');
  assert.ok(devCall);
  assert.equal(devCall.rows[0].id, 'd6');
  assert.equal(devCall.rows[0].status, 'ACTIVO');

  const sensorCall = client.calls.find((c) => c.table === 'sensor_readings');
  assert.ok(sensorCall);
  assert.equal(sensorCall.rows[0].device_id, 'd6');
  assert.equal(sensorCall.rows[0].value, 23.5);
  adapter.dispose();
});

test('Fase 05 - 6: saveLog y saveAlert persisten en logs y alerts', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);

  const okLog = await adapter.saveLog({
    level: 'WARN',
    source: 'SECURITY_HAL',
    message: 'Intento de acceso denegado a cerradura perimetral',
  });
  assert.equal(okLog, true);
  const logCall = client.calls.find((c) => c.table === 'logs');
  assert.ok(logCall);
  assert.equal(logCall.rows[0].level, 'WARN');

  const okAlert = await adapter.saveAlert({
    title: 'Humo Detectado en Cocina',
    severity: 'CRITICAL',
    state: 'ACTIVE',
    details: 'Sensor d8 disparó alarma de humo al 85% de densidad',
  });
  assert.equal(okAlert, true);
  const alertCall = client.calls.find((c) => c.table === 'alerts');
  assert.ok(alertCall);
  assert.equal(alertCall.rows[0].severity, 'CRITICAL');
  adapter.dispose();
});

test('Fase 05 - 7: saveFilesystemNode persiste nodos VFS en filesystem_nodes', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);

  const ok = await adapter.saveFilesystemNode({
    path: '/home/user/notes.txt',
    name: 'notes.txt',
    type: 'FILE',
    size: '124 B',
    permissions: 'rw-r--r--',
  });

  assert.equal(ok, true);
  const vfsCall = client.calls.find((c) => c.table === 'filesystem_nodes');
  assert.ok(vfsCall);
  assert.equal(vfsCall.rows[0].path, '/home/user/notes.txt');
  assert.equal(vfsCall.rows[0].type, 'FILE');
  adapter.dispose();
});

test('Fase 05 - 8: métricas de latencia y getSyncMetrics() informan estado completo', async () => {
  const client = createMockClient(null);
  const adapter = new SupabasePersistenceAdapter(client);

  await adapter.saveLog({ level: 'INFO', source: 'KERNEL', message: 'Test latency metric' });
  const metrics = adapter.getSyncMetrics();

  assert.ok(metrics);
  assert.equal(metrics.status, SYNC_STATUS.IDLE);
  assert.equal(typeof metrics.avgLatencyMs, 'number');
  assert.equal(typeof metrics.queueSize, 'number');
  assert.equal(metrics.origin, 'sandbox');
  adapter.dispose();
});
