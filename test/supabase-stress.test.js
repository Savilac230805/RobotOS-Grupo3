// test/supabase-stress.test.js
// Prueba de estrés de 500 eventos consecutivos (Fase 05 - Supabase Completo).
// Valida:
// 1. Generación de 500 eventos consecutivos.
// 2. 0 pérdidas de eventos.
// 3. 0 duplicados (IDs UUID únicos).
// 4. Coherencia en el orden temporal monótono.
// 5. Medición de latencia y vaciado íntegro de la cola hacia Supabase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabasePersistenceAdapter } from '../src/core/persistence/SupabasePersistenceAdapter.js';
import { SYNC_STATUS } from '../src/core/persistence/IPersistenceAdapter.js';

function createBatchStressClient() {
  const sentBatches = [];
  const allEvents = [];
  return {
    sentBatches,
    allEvents,
    auth: {
      getSession: async () => ({ data: { session: null } }),
    },
    from: (table) => ({
      upsert: async (rows) => {
        sentBatches.push({ table, count: rows.length, timestamp: Date.now() });
        allEvents.push(...rows);
        return { error: null, status: 200 };
      },
      insert: async (rows) => {
        sentBatches.push({ table, count: rows.length, timestamp: Date.now() });
        allEvents.push(...rows);
        return { error: null, status: 201 };
      },
      select: () => ({
        order: () => ({
          limit: async () => ({ data: allEvents, error: null }),
        }),
      }),
    }),
  };
}

test('Fase 05 - Prueba de Estrés: 500 eventos consecutivos con 0 pérdidas y 0 duplicados', async () => {
  const client = createBatchStressClient();
  const adapter = new SupabasePersistenceAdapter(client);

  const report = await adapter.runStressTest(500);

  // 1. Verificación de conteo total
  assert.equal(report.totalGenerated, 500, 'Deben generarse exactamente 500 eventos');
  assert.equal(report.totalPersisted, 500, 'Deben persistirse exactamente 500 eventos');
  assert.equal(report.lossCount, 0, 'No debe haber ninguna pérdida de eventos (0 pérdidas)');
  assert.equal(report.duplicatesDetected, 0, 'No debe detectarse ningún ID duplicado (0 duplicados)');
  assert.equal(report.temporalOrderCoherent, true, 'El orden temporal debe ser estrictamente coherente');

  // 2. Verificación de lotes enviados (500 eventos / 50 por lote = 10 lotes completos)
  const kernelCalls = client.sentBatches.filter((b) => b.table === 'kernel_events');
  assert.equal(kernelCalls.length, 10, '500 eventos deben enviarse en 10 lotes de 50');
  for (const b of kernelCalls) {
    assert.equal(b.count, 50, 'Cada lote de eventos debe tener 50 elementos');
  }

  // 3. Verificación de IDs únicos y orden temporal monótono en la persistencia
  const receivedIds = new Set();
  let prevTimestamp = 0;
  for (const evt of client.allEvents) {
    assert.ok(evt.event_id, 'Cada evento debe tener event_id');
    assert.equal(receivedIds.has(evt.event_id), false, `event_id repetido: ${evt.event_id}`);
    receivedIds.add(evt.event_id);

    const ts = new Date(evt.occurred_at).getTime();
    assert.ok(!isNaN(ts), 'occurred_at debe ser una fecha ISO válida');
    assert.ok(ts >= prevTimestamp, 'El orden temporal debe ser no decreciente');
    prevTimestamp = ts;
  }
  assert.equal(receivedIds.size, 500, 'Los 500 IDs deben ser únicos');

  // 4. Verificación del estado final del adaptador
  assert.equal(adapter.getSyncStatus(), SYNC_STATUS.IDLE, 'El estado final debe ser IDLE (sincronizado)');
  assert.equal(adapter.queue.length, 0, 'La cola local debe quedar completamente vacía');

  adapter.dispose();
});
