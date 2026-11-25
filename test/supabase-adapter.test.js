// test/supabase-adapter.test.js
// Pruebas del SupabasePersistenceAdapter con un cliente falso (sin red).

import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabasePersistenceAdapter } from '../src/core/persistence/SupabasePersistenceAdapter.js';
import { SYNC_STATUS } from '../src/core/persistence/IPersistenceAdapter.js';

// respond(rows, callNumber) devuelve { error, status } como lo haría supabase-js.
// role: null = visitante; 'ADMIN' = sesión real con fila ADMIN en user_roles.
function fakeClient(respond = () => ({ error: null, status: 201 }), role = null) {
  const calls = [];
  return {
    calls,
    auth: {
      getSession: async () => ({
        data: { session: role ? { user: { id: 'user-1' } } : null },
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
      const run = async (rows) => {
        calls.push({ table, rows });
        return respond(rows, calls.length);
      };
      return { upsert: run, insert: run };
    },
  };
}

const evt = (id, extra = {}) => ({
  id,
  timestamp: new Date().toISOString(),
  source: 'TEST',
  type: 'TEST_EVENT',
  severity: 'INFO',
  pid: null,
  payload: { hola: 'mundo' },
  ...extra,
});

test('visitante: el evento se guarda con origin sandbox y campos mapeados', async () => {
  const client = fakeClient();
  const a = new SupabasePersistenceAdapter(client);
  assert.equal(await a.saveEvent(evt('e1')), true);
  await a.flush();
  a.dispose();

  const row = client.calls[0].rows[0];
  assert.equal(client.calls[0].table, 'kernel_events');
  assert.equal(row.event_id, 'e1');
  assert.equal(row.origin, 'sandbox');
  assert.ok(row.occurred_at);
  assert.ok(row.session_id);
  assert.equal(a.getSyncStatus(), SYNC_STATUS.IDLE);
});

test('admin real (sesión + fila ADMIN): origin admin', async () => {
  const client = fakeClient(undefined, 'ADMIN');
  const a = new SupabasePersistenceAdapter(client);
  await a.saveEvent(evt('e2'));
  await a.flush();
  a.dispose();

  assert.equal(client.calls[0].rows[0].origin, 'admin');
  assert.equal(a.isSandboxMode(), false);
});

test('event_id duplicado (23505) cuenta como sincronizado', async () => {
  const client = fakeClient(() => ({ error: { code: '23505', message: 'duplicate' }, status: 409 }));
  const a = new SupabasePersistenceAdapter(client);
  await a.saveEvent(evt('e3'));
  await a.flush();
  a.dispose();

  assert.equal(a.getSyncStatus(), SYNC_STATUS.IDLE);
  assert.equal(a.failed.length, 0);
});

test('error permanente (CHECK/RLS): ERROR y sin reintentos', async () => {
  const client = fakeClient(() => ({ error: { code: '23514', message: 'check violation' }, status: 400 }));
  const a = new SupabasePersistenceAdapter(client);
  await a.saveEvent(evt('e4'));
  await a.flush();
  a.dispose();

  assert.equal(a.getSyncStatus(), SYNC_STATUS.ERROR);
  assert.equal(a.failed.length, 1);
  assert.equal(client.calls.length, 1); // un solo intento
  assert.equal(a.queue.length, 0);
});

test('evento inválido se rechaza antes de enviarse', async () => {
  const client = fakeClient();
  const a = new SupabasePersistenceAdapter(client);
  assert.equal(await a.saveEvent({ payload: {} }), false); // sin id ni type
  await a.flush();
  a.dispose();

  assert.equal(client.calls.length, 0);
});

test('sin cliente: modo OFFLINE, el evento queda en memoria', async () => {
  const a = new SupabasePersistenceAdapter(null);
  assert.equal(a.getSyncStatus(), SYNC_STATUS.OFFLINE);
  assert.equal(await a.saveEvent(evt('e5')), true);
  const history = await a.loadHistory();
  a.dispose();

  assert.equal(history.length, 1);
  assert.equal(history[0].id, 'e5');
});

test('saveMetric persiste métricas CPU en kernel_events usando el esquema de eventos', async () => {
  const client = fakeClient();
  const a = new SupabasePersistenceAdapter(client);
  await a.saveMetric({
    algorithm: 'ROUND_ROBIN',
    quantum: 4,
    utilizacionCpu: 80,
    timeline: [{ tick: 0, pid: 7 }],
  });
  await a.flush();
  a.dispose();

  const row = client.calls[0].rows[0];
  assert.equal(row.type, 'CPU_METRICS_RECORDED');
  assert.equal(row.source, 'SCHEDULER');
  assert.deepEqual(row.payload.timeline, [{ tick: 0, pid: 7 }]);
});
