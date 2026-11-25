import React, { Component } from 'react';
import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from '../../core/eventEngine.js';

/**
 * ErrorBoundary - Componente de contención de fallos de renderizado
 * 
 * Captura excepciones en el ciclo de vida de React, previene la pantalla negra,
 * emite eventos estructurados al Event Engine y ofrece un fallback seguro con reintento.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    try {
      // Registrar evento real en el Event Engine sin exponer credenciales ni datos sensibles
      eventEngine.emit({
        type: 'UI_RENDER_RECOVERED',
        source: EVENT_SOURCES.ALERT_DAEMON || 'ALERT_DAEMON',
        severity: EVENT_SEVERITY.ERROR || 'ERROR',
        payload: {
          component: this.props.componentName || 'Vista Desconocida',
          errorMessage: error?.message || 'Error de renderizado no especificado',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn('[ErrorBoundary] No se pudo emitir evento:', e);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full max-w-2xl mx-auto my-8 p-6 rounded-2xl bg-amber-950/20 border border-amber-600/40 shadow-xl space-y-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl shrink-0">
              ⚠️
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-300">
                Recuperación Segura: {this.props.componentName || 'Módulo Protegido'}
              </h2>
              <p className="text-xs text-slate-400">
                Se interceptó una anomalía visual. El Kernel y la persistencia continúan funcionando con normalidad.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
            <span className="text-slate-500 block text-[10px] uppercase font-bold">Diagnóstico:</span>
            <p className="text-amber-400 break-words">
              {this.state.error?.message || 'Error inesperado durante la ejecución del componente.'}
            </p>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-md shadow-amber-600/20 transition-all flex items-center space-x-1.5"
            >
              <span>🔄</span>
              <span>Reintentar Carga</span>
            </button>

            {this.props.onNavigate && (
              <button
                onClick={() => this.props.onNavigate('dashboard')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-xs transition-all"
              >
                Volver al Dashboard
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
