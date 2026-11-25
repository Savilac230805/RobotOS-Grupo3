import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEMO_USERS } from '../config/demoUsers';

export const LoginPage = ({ onNavigate }) => {
  const { login, loginAsGuest, authError, role, user, isLocked, lockoutSecondsLeft } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return;

    setLoading(true);
    setMessage(null);

    const res = await login(username, password);
    setLoading(false);

    if (res.success) {
      setMessage({ type: 'success', text: `¡Bienvenido, ${res.user.name}! Ingresando al sistema...` });
      setTimeout(() => {
        // Flujo: Login -> Welcome -> Dashboard
        onNavigate('welcome');
      }, 700);
    } else {
      setMessage({ type: 'error', text: res.error || 'Credenciales inválidas.' });
    }
  };

  const handleQuickFill = (demo) => {
    setUsername(demo.username);
    setPassword(demo.password);
    setMessage(null);
  };

  const handleGuestQuickAccess = () => {
    const guest = loginAsGuest();
    setMessage({ type: 'success', text: 'Acceso concedido como Invitado. Redirigiendo...' });
    setTimeout(() => {
      onNavigate('welcome');
    }, 600);
  };

  return (
    <div className="min-h-[82vh] flex items-center justify-center py-6 px-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
        {/* Encabezado y Marca */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-cyan-500/25 ring-1 ring-cyan-400/30">
            R
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">RobotOS</h2>
          <p className="text-xs text-cyan-400 font-mono tracking-wider uppercase font-semibold">
            Sistema Operativo para Hogares Inteligentes
          </p>
          <p className="text-xs text-slate-400">
            Autenticación y Control de Acceso por Roles (RBAC)
          </p>
        </div>

        {/* Indicador de Sesión Activa */}
        {user && (
          <div className="p-3 rounded-xl bg-slate-950 border border-cyan-800/60 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Sesión actual:</span>
            <span className="text-cyan-400 font-bold">{user.email} ({role})</span>
          </div>
        )}

        {/* Banner de Bloqueo Temporal por Intentos Fallidos */}
        {isLocked && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-red-700 text-red-200 text-xs font-mono space-y-1 animate-pulse">
            <div className="font-bold flex items-center space-x-1.5">
              <span>⛔</span>
              <span>BLOQUEO TEMPORAL DE SEGURIDAD</span>
            </div>
            <p>Se superó el límite de 3 intentos fallidos consecutivos.</p>
            <p className="text-yellow-300 font-bold">
              Desbloqueo automático en: {lockoutSecondsLeft}s
            </p>
          </div>
        )}

        {/* Mensaje de Estado / Error */}
        {message && !isLocked && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border border-red-800 text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {authError && !message && !isLocked && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300">
            {authError}
          </div>
        )}

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Usuario o Correo
            </label>
            <input
              type="text"
              value={username}
              disabled={isLocked}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-white font-mono disabled:opacity-50"
              placeholder="admin, slack o guest"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              disabled={isLocked}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-white font-mono disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || isLocked}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-lg shadow-cyan-600/20 active:scale-[0.99]"
          >
            {loading ? 'Validando credenciales...' : isLocked ? `Bloqueado (${lockoutSecondsLeft}s)` : 'Iniciar Sesión'}
          </button>
        </form>

        {/* Acceso Rápido como Invitado */}
        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-[11px] font-mono text-slate-500 uppercase">o también</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <button
          type="button"
          onClick={handleGuestQuickAccess}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-slate-300 hover:text-white font-medium text-xs transition-all flex items-center justify-center space-x-2"
        >
          <span>👁️</span>
          <span>Acceso Rápido como Invitado (Solo Lectura)</span>
        </button>

        {/* Botones de Autocompletado de Credenciales Demo */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="font-semibold text-slate-300">Credenciales Demo:</span>
            <span className="text-slate-500">(1-click para probar)</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_USERS.filter((d) => d.username !== 'invitado').map((demo) => (
              <button
                key={demo.username}
                type="button"
                onClick={() => handleQuickFill(demo)}
                className="p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/60 text-left transition-all group"
              >
                <div className={`text-[10px] font-bold font-mono ${
                  demo.role === 'ADMIN' ? 'text-purple-400' : demo.role === 'USER' ? 'text-cyan-400' : 'text-amber-400'
                }`}>
                  {demo.role}
                </div>
                <div className="text-xs text-white font-mono truncate">{demo.username}</div>
                <div className="text-[10px] text-slate-500">clave: {demo.password}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
