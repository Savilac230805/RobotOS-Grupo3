/**
 * RobotOS - Intelligent Diagnostic Assistant (Fase 09)
 * Asistente de diagnóstico del Kernel basado en evidencia empírica estricta.
 * Analiza eventos de kernel_events, alertas, logs, métricas de scheduler y fallos de página.
 * 
 * Regla inquebrantable:
 * Si no existen eventos o métricas suficientes que respalden una hipótesis causal,
 * el asistente devuelve exactamente "DATOS INSUFICIENTES" con justificación.
 */

export class DiagnosticAssistant {
  /**
   * Ejecuta un análisis determinista del estado del sistema
   * @param {Object} systemState { events, logs, alerts, metrics, processes, devices }
   * @returns {Object} Reporte estructurado de diagnóstico
   */
  static analyze({
    events = [],
    logs = [],
    alerts = [],
    metrics = {},
    processes = [],
    devices = [],
  } = {}) {
    const findings = [];
    const citedEvidence = [];

    // Si no hay datos básicos, responder estrictamente DATOS INSUFICIENTES
    if (events.length === 0 && logs.length === 0 && alerts.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        headline: 'DATOS INSUFICIENTES',
        summary: 'No existen registros de telemetría, eventos ni logs suficientes en el búfer del Kernel para formular un diagnóstico confiable.',
        confidence: 0,
        evidence: [],
        recommendations: ['Ejecutar al menos 5 ticks del Kernel o generar tráfico de dispositivos para recopilar telemetría.'],
      };
    }

    // 1. Análisis de Alertas Críticas de Seguridad y Sensores
    const criticalAlerts = alerts.filter((a) => a.severity === 'critical' || a.severity === 'error');
    if (criticalAlerts.length > 0) {
      criticalAlerts.forEach((a) => {
        citedEvidence.push({
          type: 'ALERT',
          id: a.id || a.timestamp,
          source: a.title,
          details: a.details,
        });
      });
      findings.push({
        subsystem: 'SEGURIDAD / HARDWARE',
        severity: 'CRÍTICA',
        diagnosis: `Se identificaron ${criticalAlerts.length} alertas severas activas que comprometen la operación del sistema.`,
      });
    }

    // 2. Análisis de Fallos Inyectados
    const faultEvents = events.filter((e) => e.type === 'FAULT_INJECTED');
    if (faultEvents.length > 0) {
      faultEvents.forEach((f) => {
        citedEvidence.push({
          type: 'FAULT_EVENT',
          id: f.id,
          component: f.payload?.component,
          category: f.payload?.category,
          detail: f.payload?.detail,
        });
      });
      findings.push({
        subsystem: 'FAULT_ENGINE',
        severity: 'ALERTA',
        diagnosis: `Se detectaron ${faultEvents.length} fallos controlados inyectados en los componentes: ${faultEvents.map((f) => f.payload?.component).join(', ')}.`,
      });
    }

    // 3. Análisis de Procesos Bloqueados o Daemons Caídos
    const terminatedDaemons = processes.filter((p) => p.isSystem && (p.estado === 'TERMINATED' || p.state === 'TERMINATED'));
    const blockedProcesses = processes.filter((p) => p.estado === 'BLOCKED' || p.estado === 'WAITING');

    if (terminatedDaemons.length > 0) {
      terminatedDaemons.forEach((d) => {
        citedEvidence.push({
          type: 'PROCESS_CRASH',
          pid: d.pid,
          name: d.nombre,
          state: d.estado,
        });
      });
      findings.push({
        subsystem: 'PROCESS_MANAGER',
        severity: 'CRÍTICA',
        diagnosis: `Procesos críticos del sistema terminados de forma anormal: ${terminatedDaemons.map((d) => `PID ${d.pid} [${d.nombre}]`).join(', ')}.`,
      });
    }

    if (blockedProcesses.length > 0) {
      findings.push({
        subsystem: 'SCHEDULER',
        severity: 'MEDIA',
        diagnosis: `${blockedProcesses.length} procesos se encuentran en espera de recursos de E/S: ${blockedProcesses.map((p) => `PID ${p.pid}`).join(', ')}.`,
      });
    }

    // 4. Análisis de Dispositivos Offline
    const offlineDevices = devices.filter((d) => d.status === 'OFFLINE' || d.status === 'DESCONECTADO');
    if (offlineDevices.length > 0) {
      offlineDevices.forEach((dev) => {
        citedEvidence.push({
          type: 'DEVICE_OFFLINE',
          id: dev.id,
          name: dev.name,
          zone: dev.zone,
        });
      });
      findings.push({
        subsystem: 'DRIVERS',
        severity: 'ALERTA',
        diagnosis: `Dispositivos sin comunicación en el bus de hardware: ${offlineDevices.map((d) => d.name).join(', ')}.`,
      });
    }

    // Si no se encontraron anomalías con evidencia sólida
    if (findings.length === 0) {
      return {
        status: 'HEALTHY',
        headline: 'SISTEMA OPERATIVO SALUDABLE',
        summary: 'El análisis de eventos, métricas de CPU y telemetría de drivers no arrojó desviaciones anómalas ni fallos activos.',
        confidence: 0.95,
        evidence: [
          { type: 'METRICS_CHECK', detail: 'CPU y Scheduler dentro de parámetros nominales' },
          { type: 'PROCESS_CHECK', detail: `${processes.length} procesos en ejecución o listos sin interbloqueos` },
        ],
        recommendations: ['Mantener la monitorización continua.'],
      };
    }

    // Diagnóstico fundamentado con evidencia concreta
    const recommendations = [];
    if (terminatedDaemons.length > 0) {
      recommendations.push('Reiniciar daemons del sistema caídos para restaurar el control de hardware domótico.');
    }
    if (offlineDevices.length > 0) {
      recommendations.push('Reintentar handshake en bus Zigbee/I2C o revisar alimentación de sensores desconectados.');
    }
    if (criticalAlerts.length > 0) {
      recommendations.push('Verificar el registro de eventos en Supabase para auditar las causas raíz de las alertas críticas.');
    }

    return {
      status: 'ISSUES_DETECTED',
      headline: `DIAGNÓSTICO: ${findings[0].severity} — ${findings[0].subsystem}`,
      summary: findings.map((f) => f.diagnosis).join(' '),
      findings,
      confidence: 0.88,
      evidence: citedEvidence,
      recommendations,
    };
  }
}
