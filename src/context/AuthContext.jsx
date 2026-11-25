import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { inMemoryAdapter, eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from '../core';
import { findDemoUser, DEMO_USERS } from '../config/demoUsers';

const AuthContext = createContext();

export const ROLE_LEVELS = {
  ADMIN: 3,
  USER: 2,
  GUEST: 1,
};

const SESSION_STORAGE_KEY = 'robotos_session';
const LOCKOUT_THRESHOLD = 3;
const LOCKOUT_DURATION_MS = 30000; // 30 segundos de bloqueo tras 3 intentos fallidos

export const AuthProvider = ({ children }) => {
  // Inicializar sesión desde sessionStorage
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.role && ROLE_LEVELS[parsed.role]) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[AuthContext] Error al leer sessionStorage:', e);
    }
    return null; // Inicialmente sin sesión
  });

  const [authError, setAuthError] = useState(null);
  const [deniedModal, setDeniedModal] = useState(null); // { title, action, reason }
  
  // Control de intentos fallidos y bloqueo temporal
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);

  // Temporizador de cuenta regresiva para el bloqueo
  useEffect(() => {
    if (!lockoutUntil) {
      setLockoutSecondsLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutSecondsLeft(remaining);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setFailedAttempts(0);
        setAuthError(null);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Sincronizar modo Sandbox de persistencia según el rol activo
  // Visitantes y usuarios no admin: sandbox local (no tocan almacenamiento compartido)
  // ADMIN: mutaciones persistentes compartidas
  useEffect(() => {
    const isAdmin = user?.role === 'ADMIN';
    inMemoryAdapter.setSandboxMode(!isAdmin);
  }, [user]);

  // Guardar o eliminar sesión en sessionStorage
  useEffect(() => {
    try {
      if (user) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('[AuthContext] Error al sincronizar sessionStorage:', e);
    }
  }, [user]);

  // Cambiar rol rápidamente para pruebas o laboratorio
  const switchRole = useCallback((newRole) => {
    if (!ROLE_LEVELS[newRole]) return;

    const updatedUser = {
      id: user?.id || `usr_${newRole.toLowerCase()}`,
      email: `${newRole.toLowerCase()}@robotos.local`,
      name:
        newRole === 'ADMIN'
          ? 'Administrador del Sistema'
          : newRole === 'USER'
          ? 'Operador / Residente'
          : 'Invitado Temporal',
      role: newRole,
      isVisitor: newRole === 'GUEST',
    };

    setUser(updatedUser);

    try {
      eventEngine.emit({
        type: 'ROLE_SWITCHED',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.INFO,
        payload: { newRole, user: updatedUser.email },
      });
    } catch (e) {}
  }, [user]);

  // Login con credenciales demo o Supabase Auth
  const login = async (usernameOrEmail, password) => {
    setAuthError(null);

    // Verificar si el sistema está bloqueado por intentos fallidos
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const waitSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
      const msg = `Acceso bloqueado temporalmente por seguridad. Espere ${waitSec} segundos.`;
      setAuthError(msg);
      return { success: false, error: msg, locked: true, secondsLeft: waitSec };
    }

    const cleanInput = String(usernameOrEmail || '').trim();
    const cleanLower = cleanInput.toLowerCase();

    // 1. Intentar con credenciales demo aisladas (demoUsers.js)
    const demoUser = findDemoUser(cleanLower, password);
    if (demoUser) {
      const loggedUser = {
        id: `usr_${demoUser.role.toLowerCase()}`,
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        isVisitor: demoUser.role === 'GUEST',
      };

      setUser(loggedUser);
      setFailedAttempts(0);
      setLockoutUntil(null);

      try {
        eventEngine.emit({
          type: 'LOGIN_SUCCESS',
          source: EVENT_SOURCES.SECURITY_GUARD,
          severity: EVENT_SEVERITY.INFO,
          payload: {
            user: loggedUser.email,
            role: loggedUser.role,
            authMethod: 'DEMO_CREDENTIALS',
          },
        });
      } catch (e) {}

      return { success: true, user: loggedUser };
    }

    // 2. Intentar Supabase Auth si está configurado
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanLower,
        password,
      });

      if (!error && data?.user) {
        const metaRole = data.user.app_metadata?.role;
        const assignedRole = ROLE_LEVELS[metaRole] ? metaRole : 'USER';
        const loggedUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || cleanLower.split('@')[0],
          role: assignedRole,
          isVisitor: false,
        };

        setUser(loggedUser);
        setFailedAttempts(0);
        setLockoutUntil(null);

        try {
          eventEngine.emit({
            type: 'LOGIN_SUCCESS',
            source: EVENT_SOURCES.SECURITY_GUARD,
            severity: EVENT_SEVERITY.INFO,
            payload: {
              user: loggedUser.email,
              role: loggedUser.role,
              authMethod: 'SUPABASE_AUTH',
            },
          });
        } catch (e) {}

        return { success: true, user: loggedUser };
      }
    } catch (err) {
      // Ignorar error de red si no hay Supabase
    }

    // Si falló la autenticación: registrar intento fallido
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);

    try {
      eventEngine.emit({
        type: 'LOGIN_FAILED',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.WARN,
        payload: {
          attemptedUser: cleanInput,
          attemptNumber: nextAttempts,
          maxAttempts: LOCKOUT_THRESHOLD,
        },
      });
    } catch (e) {}

    if (nextAttempts >= LOCKOUT_THRESHOLD) {
      const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
      setLockoutUntil(lockoutTime);
      setLockoutSecondsLeft(30);
      const msg = `Demasiados intentos fallidos (3/3). Acceso bloqueado por 30 segundos.`;
      setAuthError(msg);
      return { success: false, error: msg, locked: true, secondsLeft: 30 };
    }

    const remaining = LOCKOUT_THRESHOLD - nextAttempts;
    const msg = `Credenciales inválidas. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'} antes del bloqueo temporal.`;
    setAuthError(msg);
    return { success: false, error: msg, remainingAttempts: remaining };
  };

  // Acceso rápido como invitado (GUEST)
  const loginAsGuest = useCallback(() => {
    const guestUser = {
      id: 'usr_guest',
      email: 'guest@robotos.local',
      name: 'Invitado Temporal',
      role: 'GUEST',
      isVisitor: true,
    };

    setUser(guestUser);
    setFailedAttempts(0);
    setLockoutUntil(null);

    try {
      eventEngine.emit({
        type: 'LOGIN_SUCCESS',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.INFO,
        payload: {
          user: guestUser.email,
          role: 'GUEST',
          authMethod: 'QUICK_GUEST_ACCESS',
        },
      });
    } catch (e) {}

    return guestUser;
  }, []);

  // Cierre de sesión
  const logout = async () => {
    const previousEmail = user?.email || 'Desconocido';
    const previousRole = user?.role || 'GUEST';

    try {
      await supabase.auth.signOut();
    } catch (e) {}

    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);

    try {
      eventEngine.emit({
        type: 'LOGOUT',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.INFO,
        payload: { user: previousEmail, role: previousRole },
      });
    } catch (e) {}
  };

  /**
   * Valida si el usuario actual cumple con el rol mínimo necesario.
   * Si no tiene permiso, muestra alerta de ACCESO DENEGADO y devuelve false.
   */
  const checkPermission = useCallback((requiredRole, actionDescription, logActionCallback) => {
    const currentLevel = user ? ROLE_LEVELS[user.role] || 0 : 0;
    const requiredLevel = ROLE_LEVELS[requiredRole] || 1;

    if (currentLevel < requiredLevel) {
      const reason = `El rol actual (${user ? user.role : 'SIN SESIÓN'}) no tiene permisos para "${actionDescription}". Se requiere rol ${requiredRole}.`;

      setDeniedModal({
        title: 'ACCESO DENEGADO',
        action: actionDescription,
        reason: reason,
      });

      try {
        eventEngine.emit({
          type: 'ACCESS_DENIED',
          source: EVENT_SOURCES.SECURITY_GUARD,
          severity: EVENT_SEVERITY.WARN,
          payload: {
            user: user?.email || 'Anónimo',
            currentRole: user?.role || 'NONE',
            requiredRole,
            action: actionDescription,
            reason,
          },
        });
      } catch (e) {}

      if (logActionCallback) {
        logActionCallback({
          level: 'ERROR',
          source: 'SECURITY_GUARD',
          message: `[ACCESO DENEGADO] Intento no autorizado por ${user?.email || 'Anónimo'}: "${actionDescription}". Motivo: ${reason}`,
        });
      }

      return false;
    }

    return true;
  }, [user]);

  const closeDeniedModal = () => setDeniedModal(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'GUEST',
        isVisitor: !user || !!user?.isVisitor || user?.role === 'GUEST',
        isAuthenticated: !!user,
        isSandbox: user?.role !== 'ADMIN',
        lockoutSecondsLeft,
        isLocked: !!lockoutUntil && lockoutSecondsLeft > 0,
        failedAttempts,
        login,
        loginAsGuest,
        logout,
        switchRole,
        checkPermission,
        deniedModal,
        closeDeniedModal,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
