// src/core/persistence/SupabasePersistenceAdapter.js
//
// Guarda los eventos del Event Engine en public.kernel_events (migración 002)
// y los arranques en public.boot_history.
//
// IMPORTANTE: este archivo NO importa src/lib/supabase.js. El cliente se recibe
// por el constructor (inyección). Así el Core carga también en las pruebas de
// Node, donde import.meta.env no existe.
//
// Reglas del modelo de acceso:
//  - Se usa para TODOS los visitantes cuando Supabase está configurado.
//  - origin solo puede ser 'sandbox' o 'admin' (hay un CHECK en las tablas).
//  - 'admin' únicamente con sesión REAL de Supabase Auth y fila ADMIN en
//    public.user_roles. En cualquier otro caso: 'sandbox'.
//  - Un event_id duplicado cuenta como ya sincronizado.
//  - Errores permanentes (RLS, CHECK...) no se reintentan sin fin.
//  - Errores de red se reintentan con espera creciente.
//
// Estados (SYNC_STATUS): IDLE = todo sincronizado, SYNCING = enviando o con
// eventos pendientes, ERROR = último envío rechazado, OFFLINE = sin cliente.

import { IPersistenceAdapter, SYNC_STATUS } from './IPersistenceAdapter.js';

const EVENTS_TABLE = 'kernel_events';
const BOOT_TABLE = 'boot_history';
const BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 400;
const MAX_ATTEMPTS = 5;
const MAX_LOCAL_EVENTS = 1000;
const MAX_PAYLOAD_CHARS = 6000; // la tabla limita el payload a 8 KB
const MAX_STAGES_CHARS = 14000; // boot_history limita stages a 16 KB
const ORIGIN_CACHE_MS = 30000;

function makeSessionId() {
  try {
    const saved = sessionStorage.getItem('robotos_session_id');
    if (saved) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem('robotos_session_id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function toIso(value) {
  const d = new Date(value ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function fromRow(r) {
  return {
    id: r.event_id,
    timestamp: r.occurred_at,
    source: r.source,
    type: r.type,
    severity: r.severity,
    pid: r.pid,
    payload: r.payload ?? {},
    correlationId: r.payload?.correlationId ?? null,
    sessionId: r.session_id,
    origin: r.origin,
  };
}

export class SupabasePersistenceAdapter extends IPersistenceAdapter {
  /**
   * @param {object} client  Cliente de Supabase (createClient). Si es null: modo OFFLINE.
   * @param {object} options { sessionId?, fallback? }  fallback = adaptador en memoria
   */
  constructor(client, { sessionId = null, fallback = null } = {}) {
    super();
    this.name = 'Supabase';
    this.client = client || null;
    this.fallback = fallback;
    this.sessionId = sessionId || makeSessionId();

    this.queue = []; // { row, attempts }
    this.failed = []; // { row, message }
    this.local = []; // copia en memoria de los eventos (respaldo)
    this.listeners = new Set();

    this.status = this.client ? SYNC_STATUS.IDLE : SYNC_STATUS.OFFLINE;
    this.lastError = null;

    this._timer = null;
    this._flushing = false;
    this._lastSendFailed = false;
    this._origin = null;
    this._originAt = 0;
    this._forceSandbox = false;
    this._useInsertFallback = false;
    this._authSub = null;
    this._onPageHide = () => {
      this.flush();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this._onPageHide);
    }

    // Si cambia la sesión de Supabase, se vuelve a decidir el origin.
    try {
      const sub = this.client?.auth?.onAuthStateChange?.(() => {
        setTimeout(() => this.refreshOrigin(), 0);
      });
      this._authSub = sub?.data?.subscription ?? null;
    } catch {
      this._authSub = null;
    }
  }

  // ---------- Interfaz IPersistenceAdapter ----------

  async saveEvent(event) {
    const row = this._toRow(event);
    if (!row) return false;

    this._remember(event);
    this._mirror('saveEvent', [event]);
    if (!this.client) return true; // OFFLINE: solo memoria

    this.queue.push({ row, attempts: 0 });
    this._setStatus(SYNC_STATUS.SYNCING);
    this._schedule();
    return true;
  }

  async saveBootRecord(record) {
    this._mirror('saveBootRecord', [record]);
    if (!this.client) return false;
    try {
      const origin = await this._resolveOrigin();
      let stages = record?.stages ?? record?.bootLog ?? [];
      if (JSON.stringify(stages).length > MAX_STAGES_CHARS) {
        stages = [{ truncated: true, count: Array.isArray(stages) ? stages.length : 0 }];
      }
      const { error } = await this.client.from(BOOT_TABLE).insert({
        booted_at: toIso(record?.timestamp),
        success: Boolean(record?.success),
        safe_mode: Boolean(record?.safeMode),
        stages,
        session_id: this.sessionId,
        origin,
      });
      if (error) {
        this.lastError = `${error.code || 'RED'}: ${error.message}`;
        console.warn('[SupabasePersistenceAdapter] boot_history no guardado:', this.lastError);
        return false;
      }
      return true;
    } catch (e) {
      this.lastError = e.message;
      return false;
    }
  }

  async loadHistory(filter = null) {
    const limit = filter?.limit ?? 100;
    const fallback = () => [...this.local].slice(-limit).reverse();
    if (!this.client) return fallback();
    try {
      let q = this.client
        .from(EVENTS_TABLE)
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (filter?.type) q = q.eq('type', filter.type);
      if (filter?.sessionId) q = q.eq('session_id', filter.sessionId);
      const { data, error } = await q;
      if (error) throw error;
      return data.map(fromRow);
    } catch (e) {
      this.lastError = e.message;
      return fallback();
    }
  }

  // Estas operaciones aún no tienen tabla en Supabase (llegan en las etapas 03A y 05):
  // se delegan al adaptador en memoria.
  saveProcess(p) {
    return this._delegate('saveProcess', [p], false);
  }
  saveMetric(m) {
    return this._delegate('saveMetric', [m], false);
  }
  getDevices() {
    return this._delegate('getDevices', [], []);
  }
  saveDeviceState(id, status, metadata) {
    return this._delegate('saveDeviceState', [id, status, metadata], false);
  }
  getLogs(limit) {
    return this._delegate('getLogs', [limit], []);
  }
  saveLog(entry) {
    return this._delegate('saveLog', [entry], false);
  }
  getSystemSnapshot() {
    return this._delegate('getSystemSnapshot', [], {});
  }

  enqueueRetry(operation) {
    const evt = operation?.event ?? operation;
    if (evt?.id && evt?.type) this.saveEvent(evt);
  }

  async processRetryQueue() {
    return this.flush();
  }

  getSyncStatus() {
    return this.status;
  }

  setSandboxMode(isSandbox) {
    this._forceSandbox = Boolean(isSandbox);
    this._originAt = 0;
  }

  isSandboxMode() {
    return this._forceSandbox || this._origin !== 'admin';
  }

  // ---------- Extras ----------

  getState() {
    return {
      adapter: this.name,
      status: this.status,
      pending: this.queue.length,
      failed: this.failed.length,
      lastError: this.lastError,
      origin: this._origin ?? 'sandbox',
      sessionId: this.sessionId,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  // Vuelve a consultar si hay sesión real de ADMIN (llamar al cambiar de usuario).
  async refreshOrigin() {
    this._originAt = 0;
    return this._resolveOrigin();
  }

  dispose() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    try {
      this._authSub?.unsubscribe?.();
    } catch {
      /* nada */
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._onPageHide);
    }
  }

  // Envía lo que haya en cola. Se llama sola; también sirve en pruebas.
  async flush() {
    if (!this.client || this._flushing || this.queue.length === 0) return;
    this._flushing = true;
    this._setStatus(SYNC_STATUS.SYNCING);

    try {
      const origin = await this._resolveOrigin();

      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, BATCH_SIZE);
        const result = await this._send(batch.map(({ row }) => ({ ...row, origin })));

        if (result.ok) {
          this._lastSendFailed = false;
          continue;
        }

        if (result.transient) {
          // Fallo de red o servidor: reintentar con espera creciente.
          batch.forEach((item) => {
            item.attempts += 1;
          });
          const retry = batch.filter((i) => i.attempts < MAX_ATTEMPTS);
          batch
            .filter((i) => i.attempts >= MAX_ATTEMPTS)
            .forEach((i) => this._fail(i.row, result.message));
          this.queue.unshift(...retry);
          if (retry.length > 0) {
            this._schedule(Math.min(30000, 1000 * 2 ** retry[0].attempts));
          }
          break;
        }

        // Error permanente: aislar la fila culpable enviando una por una.
        if (batch.length === 1) {
          this._fail(batch[0].row, result.message);
          continue;
        }
        for (const item of batch) {
          const single = await this._send([{ ...item.row, origin }]);
          if (single.ok) {
            this._lastSendFailed = false;
          } else if (single.transient) {
            item.attempts += 1;
            this.queue.push(item);
            this._schedule(2000);
          } else {
            this._fail(item.row, single.message);
          }
        }
      }
    } finally {
      this._flushing = false;
      this._refreshStatus();
    }
  }

  // ---------- Internos ----------

  _toRow(event) {
    const bad = (message) => {
      this.lastError = message;
      this.failed.push({ row: event, message });
      this._lastSendFailed = true;
      this._setStatus(SYNC_STATUS.ERROR);
      return null;
    };

    if (!event || typeof event !== 'object') return bad('Evento inválido');
    if (!event.id || !event.type) return bad('Evento sin id o type');

    let payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    if (event.correlationId) payload = { ...payload, correlationId: event.correlationId };
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
      payload = { truncated: true, correlationId: event.correlationId ?? null };
    }

    return {
      event_id: String(event.id),
      occurred_at: toIso(event.timestamp),
      source: String(event.source ?? 'KERNEL').slice(0, 64),
      type: String(event.type).slice(0, 64),
      severity: String(event.severity ?? 'INFO').slice(0, 16),
      pid: Number.isInteger(event.pid) ? event.pid : null,
      payload,
      session_id: this.sessionId,
    };
  }

  _remember(event) {
    this.local.push(event);
    if (this.local.length > MAX_LOCAL_EVENTS) this.local.shift();
  }

  // Copia en el adaptador en memoria (para snapshot y Gemelo Digital); nunca rompe.
  _mirror(method, args) {
    try {
      const f = this.fallback;
      if (f && typeof f[method] === 'function') {
        Promise.resolve(f[method](...args)).catch(() => {});
      }
    } catch {
      /* el respaldo local no debe frenar la persistencia */
    }
  }

  _delegate(method, args, fallbackValue) {
    const f = this.fallback;
    if (f && typeof f[method] === 'function') return f[method](...args);
    return Promise.resolve(fallbackValue);
  }

  async _resolveOrigin() {
    if (this._forceSandbox) return 'sandbox';
    const now = Date.now();
    if (this._origin && now - this._originAt < ORIGIN_CACHE_MS) return this._origin;

    let origin = 'sandbox';
    try {
      const { data } = await this.client.auth.getSession();
      const userId = data?.session?.user?.id;
      if (userId) {
        const { data: roleRow } = await this.client
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();
        if (roleRow?.role === 'ADMIN') origin = 'admin';
      }
    } catch {
      origin = 'sandbox';
    }
    this._origin = origin;
    this._originAt = now;
    return origin;
  }

  async _send(rows) {
    try {
      let res;
      if (this._useInsertFallback) {
        res = await this.client.from(EVENTS_TABLE).insert(rows);
      } else {
        // ON CONFLICT DO NOTHING: un event_id repetido no rompe el lote.
        res = await this.client
          .from(EVENTS_TABLE)
          .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });
      }

      // Si el upsert fue rechazado por permisos, probar una vez con insert simple.
      if (res.error?.code === '42501' && !this._useInsertFallback) {
        this._useInsertFallback = true;
        res = await this.client.from(EVENTS_TABLE).insert(rows);
      }

      const { error, status } = res;
      if (!error) return { ok: true };
      if (error.code === '23505') return { ok: true }; // duplicado = ya sincronizado

      const transient = !error.code || status >= 500 || status === 429;
      return { ok: false, transient, message: `${error.code || 'RED'}: ${error.message}` };
    } catch (e) {
      return { ok: false, transient: true, message: e.message };
    }
  }

  _fail(row, message) {
    this.failed.push({ row, message });
    this.lastError = message;
    this._lastSendFailed = true;
    console.warn('[SupabasePersistenceAdapter] evento no guardado:', message);
  }

  _schedule(delay = FLUSH_DELAY_MS) {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, delay);
  }

  _refreshStatus() {
    if (this.queue.length > 0) this._setStatus(SYNC_STATUS.SYNCING);
    else if (this._lastSendFailed) this._setStatus(SYNC_STATUS.ERROR);
    else this._setStatus(SYNC_STATUS.IDLE);
  }

  _setStatus(status) {
    this.status = status;
    const detail = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(detail);
      } catch {
        /* un listener roto no debe frenar el adaptador */
      }
    });
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('robotos:sync', { detail }));
    }
  }
}
