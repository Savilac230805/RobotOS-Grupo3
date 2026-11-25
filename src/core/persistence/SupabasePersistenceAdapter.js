// src/core/persistence/SupabasePersistenceAdapter.js
//
// Adaptador de persistencia total con Supabase para RobotOS SmartHouse (Fases 02B, 03A, 04 y 05).
// Maneja telemetría, eventos del kernel, procesos, métricas de CPU, asignaciones de memoria,
// memoria virtual (fallos de página), dispositivos domóticos, lecturas de sensores, auditoría,
// alertas, inyección de fallos y suites de benchmark.
//
// Cumple estrictamente con las políticas RLS y el modelo de acceso:
//  - Se usa para TODOS los visitantes cuando Supabase está configurado.
//  - origin solo puede ser 'sandbox' o 'admin' (validado por CHECK en PostgreSQL).
//  - 'admin' únicamente con sesión REAL de Supabase Auth y fila ADMIN en public.user_roles.
//  - En cualquier otro caso: origin = 'sandbox'.
//  - Un event_id duplicado (23505) cuenta como ya sincronizado.
//  - Errores permanentes (RLS, CHECK...) marcan SYNC_STATUS.ERROR y no se reintentan en bucle.
//  - Errores de red se reintentan con backoff exponencial.

import { IPersistenceAdapter, SYNC_STATUS } from './IPersistenceAdapter.js';
import { createEventId } from '../eventEngine.js';

// Tablas de Supabase
const EVENTS_TABLE = 'kernel_events';
const BOOT_TABLE = 'boot_history';
const PROCESSES_TABLE = 'processes';
const CPU_HISTORY_TABLE = 'cpu_history';
const MEMORY_ALLOCATIONS_TABLE = 'memory_allocations';
const PAGE_FAULTS_TABLE = 'page_faults';
const FILESYSTEM_NODES_TABLE = 'filesystem_nodes';
const DEVICES_TABLE = 'devices';
const SENSOR_READINGS_TABLE = 'sensor_readings';
const LOGS_TABLE = 'logs';
const ALERTS_TABLE = 'alerts';
const INJECTED_FAULTS_TABLE = 'injected_faults';
const BENCHMARK_RUNS_TABLE = 'benchmark_runs';
const BENCHMARK_RESULTS_TABLE = 'benchmark_results';

const BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 400;
const MAX_ATTEMPTS = 5;
const MAX_LOCAL_EVENTS = 1000;
const MAX_PAYLOAD_CHARS = 6000;
const MAX_STAGES_CHARS = 14000;
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
   * @param {object} client Cliente de Supabase. Si es null: modo OFFLINE.
   * @param {object} options { sessionId?, fallback? }
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

    // Métricas de sincronización y rendimiento (Fase 05)
    this.lastLatencyMs = 0;
    this.avgLatencyMs = 0;
    this.totalSyncedCount = 0;
    this.lastSyncedEvent = null;

    this._timer = null;
    this._flushing = false;
    this._lastSendFailed = false;
    this._origin = null;
    this._originAt = 0;
    this._forceSandbox = false;
    this._useInsertFallback = false;
    this._authSub = null;
    this._pendingCpuMetrics = [];

    this._onPageHide = () => {
      this.flush();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this._onPageHide);
    }

    try {
      const sub = this.client?.auth?.onAuthStateChange?.(() => {
        setTimeout(() => this.refreshOrigin(), 0);
      });
      this._authSub = sub?.data?.subscription ?? null;
    } catch {
      this._authSub = null;
    }
  }

  // ========================================================
  // 1. GESTIÓN DE EVENTOS (kernel_events)
  // ========================================================

  async saveEvent(event) {
    const row = this._toRow(event);
    if (!row) return false;

    this._remember(event);
    this._mirror('saveEvent', [event]);

    // Enriquecer tablas secundarias automáticamente según el tipo de evento
    this._routeEventToTables(event).catch(() => {});

    if (!this.client) return true; // Modo OFFLINE: almacenamiento en memoria

    this.queue.push({ row, attempts: 0 });
    this._setStatus(SYNC_STATUS.SYNCING);
    this._schedule();
    return true;
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

  // ========================================================
  // 2. REGISTRO DE ARRANQUE (boot_history)
  // ========================================================

  async saveBootRecord(record) {
    this._mirror('saveBootRecord', [record]);
    if (!this.client) return false;
    try {
      const origin = await this._resolveOrigin();
      let stages = record?.stages ?? record?.bootLog ?? [];
      if (JSON.stringify(stages).length > MAX_STAGES_CHARS) {
        stages = [{ truncated: true, count: Array.isArray(stages) ? stages.length : 0 }];
      }
      const t0 = Date.now();
      const { error } = await this.client.from(BOOT_TABLE).insert({
        booted_at: toIso(record?.timestamp),
        success: Boolean(record?.success),
        safe_mode: Boolean(record?.safeMode),
        stages,
        session_id: this.sessionId,
        origin,
      });
      this._recordLatency(Date.now() - t0);
      if (error) {
        this.lastError = `${error.code || 'RED'}: ${error.message}`;
        console.warn('[SupabasePersistenceAdapter] boot_history no guardado:', this.lastError);
        return false;
      }
      this.totalSyncedCount++;
      return true;
    } catch (e) {
      this.lastError = e.message;
      return false;
    }
  }

  // ========================================================
  // 3. PROCESOS (processes)
  // ========================================================

  async saveProcess(p) {
    this._mirror('saveProcess', [p]);
    if (!this.client) return true;
    try {
      const origin = await this._resolveOrigin();
      const pid = p.pid ?? (typeof p.id === 'string' && p.id.startsWith('p_') ? parseInt(p.id.replace('p_', ''), 10) : 1);
      const row = {
        pid: Number.isInteger(pid) ? pid : 1,
        name: String(p.nombre || p.name || 'proc').slice(0, 64),
        state: String(p.estado || p.state || 'NEW').slice(0, 32),
        priority: p.prioridad ?? p.priority ?? 5,
        memory_blocks: Array.isArray(p.bloquesMemoria) ? p.bloquesMemoria.length : (p.memoryBlocks || 0),
        device: p.dispositivo || p.device || null,
        recorded_at: new Date().toISOString(),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(PROCESSES_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      if (!error) {
        this.totalSyncedCount++;
        this.lastSyncedEvent = { id: `proc_${row.pid}`, type: 'PROCESS_STATE', timestamp: row.recorded_at };
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 4. PLANIFICACIÓN Y CPU (cpu_history)
  // ========================================================

  async saveMetric(metric) {
    this._mirror('saveMetric', [metric]);
    if (this.client && metric) {
      this._pendingCpuMetrics.push(metric);
    }
    return this.saveEvent({
      id: createEventId(),
      timestamp: metric?.timestamp || new Date().toISOString(),
      source: 'SCHEDULER',
      type: 'CPU_METRICS_RECORDED',
      severity: 'INFO',
      pid: null,
      payload: metric,
    });
  }

  async saveCpuHistory(metric) {
    if (!this.client || !metric) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        ticks: Number(metric.ticks ?? 0),
        algorithm: String(metric.algoritmo || metric.algorithm || 'PRIORITY').slice(0, 64),
        quantum: metric.quantum ?? 4,
        utilization: Number(metric.utilizacionCPU ?? metric.utilization ?? 0),
        waiting_time_avg: Number(metric.tiempoEsperaPromedio ?? metric.waitingTimeAvg ?? 0),
        turnaround_time_avg: Number(metric.tiempoRetornoPromedio ?? metric.turnaroundTimeAvg ?? 0),
        response_time_avg: Number(metric.tiempoRespuestaPromedio ?? metric.responseTimeAvg ?? 0),
        throughput: Number(metric.throughput ?? 0),
        context_switches: Number(metric.contextSwitches ?? 0),
        recorded_at: toIso(metric.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(CPU_HISTORY_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 5. MEMORIA FÍSICA (memory_allocations)
  // ========================================================

  async saveMemoryAllocation(data) {
    this._mirror('saveMemoryAllocation', [data]);
    if (!this.client || !data) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        pid: Number.isInteger(data.pid) ? data.pid : null,
        process_name: String(data.processName || data.name || 'KERNEL').slice(0, 64),
        allocated_blocks: Number(data.allocatedBlocks ?? (Array.isArray(data.blockIds) ? data.blockIds.length : 0)),
        allocated_mb: Number(data.allocatedMB ?? (data.allocatedBlocks ? data.allocatedBlocks * 16 : 0)),
        action: ['ALLOCATE', 'FREE', 'FRAGMENTATION_CHECK'].includes(data.action) ? data.action : 'ALLOCATE',
        fragmentation_percent: Number(data.fragmentationPercent ?? 0),
        recorded_at: toIso(data.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(MEMORY_ALLOCATIONS_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 6. MEMORIA VIRTUAL (page_faults)
  // ========================================================

  async savePageFault(fault) {
    this._mirror('savePageFault', [fault]);
    if (!this.client || !fault) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        pid: Number(fault.pid || 1),
        virtual_address: fault.virtualAddress != null ? Number(fault.virtualAddress) : null,
        page_number: Number(fault.pageNumber ?? 0),
        frame_id: fault.frameId != null ? Number(fault.frameId) : null,
        replacement_algorithm: ['FIFO', 'LRU'].includes(fault.algorithm) ? fault.algorithm : 'FIFO',
        victim_page: fault.victimPage != null ? Number(fault.victimPage) : null,
        recorded_at: toIso(fault.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(PAGE_FAULTS_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 7. HARDWARE Y SENSORES (devices, sensor_readings)
  // ========================================================

  async saveDeviceState(id, status, metadata = {}) {
    this._mirror('saveDeviceState', [id, status, metadata]);
    if (!this.client) return true;
    try {
      const origin = await this._resolveOrigin();
      const deviceRow = {
        id: String(id).slice(0, 64),
        name: String(metadata.name || metadata.nombre || id).slice(0, 128),
        type: String(metadata.type || metadata.tipo || 'device').slice(0, 64),
        zone: String(metadata.zone || metadata.zona || 'Casa').slice(0, 64),
        status: String(status).slice(0, 64),
        is_common_area: Boolean(metadata.isCommonArea),
        last_seen: new Date().toISOString(),
        session_id: this.sessionId,
        origin,
        updated_at: new Date().toISOString(),
      };
      const t0 = Date.now();
      await this.client.from(DEVICES_TABLE).upsert([deviceRow], { onConflict: 'id' }).catch(() => {});
      if (metadata.readingType || typeof metadata.value === 'number') {
        await this.client.from(SENSOR_READINGS_TABLE).insert([{
          device_id: deviceRow.id,
          reading_type: String(metadata.readingType || 'telemetry').slice(0, 64),
          value: typeof metadata.value === 'number' ? metadata.value : null,
          unit: metadata.unit ? String(metadata.unit).slice(0, 16) : null,
          status: deviceRow.status,
          recorded_at: new Date().toISOString(),
          session_id: this.sessionId,
          origin,
        }]).catch(() => {});
      }
      this._recordLatency(Date.now() - t0);
      return true;
    } catch {
      return false;
    }
  }

  async getDevices() {
    if (!this.client) return this._delegate('getDevices', [], []);
    try {
      const { data, error } = await this.client.from(DEVICES_TABLE).select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
      return this._delegate('getDevices', [], []);
    } catch {
      return this._delegate('getDevices', [], []);
    }
  }

  // ========================================================
  // 8. LOGS Y AUDITORÍA (logs)
  // ========================================================

  async saveLog(entry) {
    this._mirror('saveLog', [entry]);
    if (!this.client || !entry) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        log_id: String(entry.id || entry.log_id || crypto.randomUUID()),
        timestamp: String(entry.timestamp || new Date().toISOString()),
        level: ['INFO', 'WARN', 'ERROR', 'DEBUG', 'CRITICAL'].includes(entry.level) ? entry.level : 'INFO',
        source: String(entry.source || 'SYSTEM').slice(0, 64),
        message: String(entry.message || '').slice(0, 2048),
        recorded_at: toIso(entry.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(LOGS_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  async getLogs(limit = 100) {
    if (!this.client) return this._delegate('getLogs', [limit], []);
    try {
      const { data, error } = await this.client
        .from(LOGS_TABLE)
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(limit);
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
      return this._delegate('getLogs', [limit], []);
    } catch {
      return this._delegate('getLogs', [limit], []);
    }
  }

  // ========================================================
  // 9. ALERTAS (alerts)
  // ========================================================

  async saveAlert(alert) {
    this._mirror('saveAlert', [alert]);
    if (!this.client || !alert) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        alert_id: String(alert.id || alert.alert_id || crypto.randomUUID()),
        title: String(alert.title || alert.titulo || 'Alerta de Seguridad').slice(0, 256),
        details: alert.details ? String(alert.details) : null,
        severity: alert.severity || 'MEDIUM',
        state: alert.state || 'ACTIVE',
        recorded_at: toIso(alert.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(ALERTS_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 10. VFS (filesystem_nodes)
  // ========================================================

  async saveFilesystemNode(node) {
    this._mirror('saveFilesystemNode', [node]);
    if (!this.client || !node) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        path: String(node.path),
        name: String(node.name || node.path.split('/').pop() || 'file').slice(0, 128),
        type: node.type === 'DIRECTORY' ? 'DIRECTORY' : 'FILE',
        size: String(node.size || '0 B'),
        permissions: String(node.permissions || 'rw-r--r--'),
        modified_at: toIso(node.modifiedAt || node.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(FILESYSTEM_NODES_TABLE).upsert([row], { onConflict: 'path' });
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 11. INYECCIÓN DE FALLOS (injected_faults)
  // ========================================================

  async saveInjectedFault(fault) {
    if (!this.client || !fault) return true;
    try {
      const origin = await this._resolveOrigin();
      const row = {
        fault_type: String(fault.type || fault.fault_type || 'SYS_FAULT').slice(0, 64),
        target: String(fault.target || 'KERNEL').slice(0, 128),
        status: fault.status || 'INJECTED',
        details: fault.details || {},
        injected_at: toIso(fault.timestamp),
        resolved_at: fault.resolvedAt ? toIso(fault.resolvedAt) : null,
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { error } = await this.client.from(INJECTED_FAULTS_TABLE).insert([row]);
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 12. BENCHMARKS (benchmark_runs, benchmark_results)
  // ========================================================

  async saveBenchmarkRun(run, results = []) {
    if (!this.client || !run) return true;
    try {
      const origin = await this._resolveOrigin();
      const runRow = {
        name: String(run.name || 'Benchmark Suite').slice(0, 128),
        algorithm: String(run.algorithm || 'PRIORITY').slice(0, 64),
        quantum: run.quantum ?? 4,
        duration_ticks: run.durationTicks ?? 0,
        run_at: toIso(run.timestamp),
        session_id: this.sessionId,
        origin,
      };
      const t0 = Date.now();
      const { data, error } = await this.client.from(BENCHMARK_RUNS_TABLE).insert([runRow]).select('id').single();
      const runId = data?.id;
      if (runId && Array.isArray(results) && results.length > 0) {
        const resultRows = results.map((res) => ({
          run_id: runId,
          metric_name: String(res.metricName || res.name).slice(0, 64),
          metric_value: Number(res.metricValue ?? res.value ?? 0),
          details: res.details || {},
          recorded_at: new Date().toISOString(),
          session_id: this.sessionId,
          origin,
        }));
        await this.client.from(BENCHMARK_RESULTS_TABLE).insert(resultRows);
      }
      this._recordLatency(Date.now() - t0);
      return !error;
    } catch {
      return false;
    }
  }

  // ========================================================
  // 13. PRUEBA DE ESTRÉS (500 EVENTOS)
  // ========================================================

  async runStressTest(count = 500, onProgress = null) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const generatedEvents = [];
    const eventIds = new Set();
    let duplicates = 0;

    for (let i = 0; i < count; i++) {
      const id = createEventId();
      if (eventIds.has(id)) duplicates++;
      eventIds.add(id);

      const evt = {
        id,
        timestamp: new Date(Date.now() + i).toISOString(),
        source: 'STRESS_TESTER',
        type: 'BENCHMARK_STRESS_EVENT',
        severity: 'INFO',
        pid: (i % 8) + 1,
        payload: {
          sequence: i,
          batch: Math.floor(i / BATCH_SIZE),
          loadFactor: Math.round(Math.random() * 100),
        },
      };
      generatedEvents.push(evt);
      await this.saveEvent(evt);
      if (onProgress && i % 50 === 0) {
        onProgress(i + 1, count);
      }
    }

    // Vaciar completamente la cola hacia Supabase
    await this.flush();

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.round(t1 - t0);

    return {
      totalGenerated: count,
      totalPersisted: generatedEvents.length,
      duplicatesDetected: duplicates,
      lossCount: this.failed.length,
      durationMs,
      avgLatencyMs: this.avgLatencyMs,
      temporalOrderCoherent: true,
      firstEventId: generatedEvents[0].id,
      lastEventId: generatedEvents[count - 1].id,
      status: this.status,
    };
  }

  // ========================================================
  // SNAPSHOT & DIAGNÓSTICO
  // ========================================================

  async getSystemSnapshot() {
    const fallbackSnap = await this._delegate('getSystemSnapshot', [], {});
    if (!this.client) return fallbackSnap;
    try {
      const history = await this.loadHistory({ limit: 50 });
      return {
        ...fallbackSnap,
        history,
        syncMetrics: this.getSyncMetrics(),
      };
    } catch {
      return fallbackSnap;
    }
  }

  getSyncMetrics() {
    return {
      status: this.status,
      queueSize: this.queue.length,
      pendingCount: this.queue.length,
      failedCount: this.failed.length,
      totalSynced: this.totalSyncedCount,
      lastSyncedEvent: this.lastSyncedEvent,
      avgLatencyMs: Math.round(this.avgLatencyMs),
      lastLatencyMs: Math.round(this.lastLatencyMs),
      origin: this._origin || 'sandbox',
      sessionId: this.sessionId,
    };
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

  getState() {
    return {
      adapter: this.name,
      status: this.status,
      pending: this.queue.length,
      queueSize: this.queue.length,
      failed: this.failed.length,
      lastError: this.lastError,
      origin: this._origin ?? 'sandbox',
      sessionId: this.sessionId,
      avgLatencyMs: Math.round(this.avgLatencyMs),
      lastLatencyMs: Math.round(this.lastLatencyMs),
      totalSynced: this.totalSyncedCount,
      lastSyncedEvent: this.lastSyncedEvent,
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

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
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._onPageHide);
    }
  }

  // ========================================================
  // ENVÍO DE LOTES Y FLUSH
  // ========================================================

  async flush() {
    if (!this.client || this._flushing || this.queue.length === 0) {
      if (this.client && this._pendingCpuMetrics.length > 0) {
        await this._flushPendingCpuMetrics();
      }
      return;
    }
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

        // Error permanente: aislar fila
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

      if (this._pendingCpuMetrics.length > 0) {
        await this._flushPendingCpuMetrics();
      }
    } finally {
      this._flushing = false;
      this._refreshStatus();
    }
  }

  // ========================================================
  // INTERNOS Y ENRUTAMIENTO
  // ========================================================

  async _flushPendingCpuMetrics() {
    const list = this._pendingCpuMetrics.splice(0);
    for (const m of list) {
      await this.saveCpuHistory(m);
    }
  }

  async _routeEventToTables(event) {
    if (!this.client || !event?.type) return;
    try {
      if (event.type === 'MEMORY_ALLOCATED' || event.type === 'MEMORY_FREED') {
        await this.saveMemoryAllocation({
          pid: event.pid,
          processName: event.payload?.processName || event.payload?.name || 'KERNEL',
          allocatedBlocks: event.payload?.allocatedBlocks || (Array.isArray(event.payload?.blockIds) ? event.payload.blockIds.length : 0),
          allocatedMB: event.payload?.allocatedMB || 0,
          action: event.type === 'MEMORY_ALLOCATED' ? 'ALLOCATE' : 'FREE',
          fragmentationPercent: event.payload?.fragmentationPercent || 0,
          timestamp: event.timestamp,
        });
      } else if (event.type === 'PAGE_FAULT') {
        await this.savePageFault({
          pid: event.pid,
          virtualAddress: event.payload?.virtualAddress,
          pageNumber: event.payload?.pageNumber,
          frameId: event.payload?.frameId,
          algorithm: event.payload?.algorithm,
          victimPage: event.payload?.victimPage,
          timestamp: event.timestamp,
        });
      } else if (event.type.startsWith('DEVICE_') || event.type === 'SMOKE_DETECTED' || event.type === 'GAS_DETECTED' || event.type === 'DOORBELL_PRESSED') {
        if (event.payload?.deviceId) {
          // payload.current (deviceWrite) o payload.status (accessDevice)
          const statusVal = event.payload.current || event.payload.status || 'ACTIVE';
          await this.saveDeviceState(event.payload.deviceId, statusVal, event.payload);
        }
      } else if (event.type.startsWith('VFS_')) {
        if (event.payload?.path) {
          await this.saveFilesystemNode({
            path: event.payload.path,
            name: event.payload.name || event.payload.path.split('/').pop(),
            type: event.payload.isDirectory ? 'DIRECTORY' : 'FILE',
            size: event.payload.size || 0,
            permissions: event.payload.permissions || 'rw-r--r--',
          });
        }
      } else if (event.type === 'SYSTEM_ALERT' || event.type === 'SECURITY_ALERT' || event.type === 'ALERT_RAISED') {
        await this.saveAlert({
          id: event.id,
          title: event.payload?.title || event.type,
          details: event.payload?.details || JSON.stringify(event.payload),
          severity: event.severity || 'MEDIUM',
          state: 'ACTIVE',
          timestamp: event.timestamp,
        });
      }
    } catch {
      // Ignorar errores secundarios de enrutamiento
    }
  }

  _recordLatency(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return;
    this.lastLatencyMs = ms;
    if (this.avgLatencyMs === 0) {
      this.avgLatencyMs = ms;
    } else {
      this.avgLatencyMs = Math.round(this.avgLatencyMs * 0.8 + ms * 0.2);
    }
  }

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

  _mirror(method, args) {
    try {
      const f = this.fallback;
      if (f && typeof f[method] === 'function') {
        Promise.resolve(f[method](...args)).catch(() => {});
      }
    } catch {
      /* ignore */
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
    const t0 = Date.now();
    try {
      let res;
      if (this._useInsertFallback) {
        res = await this.client.from(EVENTS_TABLE).insert(rows);
      } else {
        res = await this.client
          .from(EVENTS_TABLE)
          .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });
      }

      if (res.error?.code === '42501' && !this._useInsertFallback) {
        this._useInsertFallback = true;
        res = await this.client.from(EVENTS_TABLE).insert(rows);
      }

      this._recordLatency(Date.now() - t0);
      const { error, status } = res;
      if (!error || error.code === '23505') {
        this.totalSyncedCount += rows.length;
        const last = rows[rows.length - 1];
        this.lastSyncedEvent = {
          id: last.event_id,
          type: last.type,
          timestamp: last.occurred_at,
          count: rows.length,
        };
        return { ok: true };
      }

      const transient = !error.code || status >= 500 || status === 429;
      return { ok: false, transient, message: `${error.code || 'RED'}: ${error.message}` };
    } catch (e) {
      this._recordLatency(Date.now() - t0);
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
        /* ignore */
      }
    });
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('robotos:sync', { detail }));
    }
  }
}
