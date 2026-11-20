import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { inMemoryAdapter } from '../core';

const AuthContext = createContext();

const ROLE_LEVELS = {
  ADMIN: 3,
  USER: 2,
  GUEST: 1,
};

// ==========================================
// CUENTAS DE LABORATORIO
// Solo se habilitan en desarrollo (npm run dev) o si se define
// VITE_ENABLE_LAB_ACCOUNTS=true. NO son seguridad real: cualquier valor que viaje
// en el frontend es visible. La protección real de los datos compartidos
// la imponen las políticas RLS de Supabase (is_admin()).
// ==========================================
const LAB_ACCOUNTS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_LAB_ACCOUNTS === 'true';

const LAB_PASSWORD = import.meta.env.VITE_LAB_PASSWORD || 'robotos-lab';

const LAB_ACCOUNTS = {
  'admin@robotos.local': { role: 'ADMIN', name: 'Operador Admin' },
  'residente@robotos.local': { role: 'USER', name: 'Residente Hogar' },
  'invitado@robotos.local': { role: 'GUEST', name: 'Invitado Temporal' },
};

// Visitante público: entra sin cuenta, lee todo y opera su propia simulación local (sandbox).
const VISITOR_USER = {
  id: 'usr_visitor',
  email: 'visitante@robotos.local',
  name: 'Visitante',
  role: 'USER',
  isVisitor: true,
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(VISITOR_USER);

  const [authError, setAuthError] = useState(null);
  const [deniedModal, setDeniedModal] = useState(null); // { title, action, reason }

  // Sincronizar modo Sandbox de persistencia según el rol activo
  // Visitantes y usuarios no admin: sandbox local (no tocan almacenamiento compartido)
  // ADMIN: mutaciones persistentes compartidas
  useEffect(() => {
    const isAdmin = user?.role === 'ADMIN';
    inMemoryAdapter.setSandboxMode(!isAdmin);
  }, [user]);

  // Cambiar rol rápidamente para pruebas de laboratorio.
  // Solo disponible cuando las cuentas de laboratorio están habilitadas.
  const switchRole = (newRole) => {
    if (!LAB_ACCOUNTS_ENABLED) return;
    if (!ROLE_LEVELS[newRole]) return;

    setUser((prev) => ({
      ...prev,
      role: newRole,
      isVisitor: false,
      name:
        newRole === 'ADMIN'
          ? 'Operador Admin'
          : newRole === 'USER'
          ? 'Residente Hogar'
          : 'Invitado Temporal',
      email: `${newRole.toLowerCase()}@robotos.local`,
    }));
  };

  const tryLabLogin = (email, password) => {
    if (!LAB_ACCOUNTS_ENABLED) return false;
    const account = LAB_ACCOUNTS[email];
    if (!account || password !== LAB_PASSWORD) return false;

    setUser({
      id: `lab_${account.role.toLowerCase()}`,
      email,
      name: account.name,
      role: account.role,
      isVisitor: false,
    });
    return true;
  };

  // Login: solo ADMIN (y usuarios registrados) necesitan autenticarse.
  const login = async (email, password) => {
    setAuthError(null);
    const cleanEmail = String(email || '').trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!error && data?.user) {
        // El rol debe venir de app_metadata (lo asigna el servidor), no de user_metadata,
        // que el propio usuario puede editar. La fuente definitiva será la tabla user_roles
        // consultada con is_admin() y reforzada por RLS.
        const metaRole = data.user.app_metadata?.role;
        const assignedRole = ROLE_LEVELS[metaRole] ? metaRole : 'USER';
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || cleanEmail.split('@')[0],
          role: assignedRole,
          isVisitor: false,
        });
        return { success: true };
      }
    } catch (err) {
      // Sin conexión o Supabase sin configurar: se intenta con las cuentas de laboratorio.
    }

    if (tryLabLogin(cleanEmail, password)) {
      return { success: true };
    }

    const message = LAB_ACCOUNTS_ENABLED
      ? 'Credenciales inválidas. En modo laboratorio use admin@robotos.local con la contraseña de laboratorio.'
      : 'Credenciales inválidas.';
    setAuthError(message);
    return { success: false, error: message };
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignorar error si no está configurado Supabase
    }
    // Al cerrar sesión se vuelve al modo Visitante (lectura total + sandbox local)
    setUser(VISITOR_USER);
  };

  /**
   * Valida si el usuario actual cumple con el rol mínimo necesario.
   * Si no tiene permiso, muestra alerta de ACCESO DENEGADO y devuelve false.
   */
  const checkPermission = (requiredRole, actionDescription, logActionCallback) => {
    const currentLevel = user ? ROLE_LEVELS[user.role] || 0 : 0;
    const requiredLevel = ROLE_LEVELS[requiredRole] || 1;

    if (currentLevel < requiredLevel) {
      const reason = `El rol actual (${user ? user.role : 'ANÓNIMO'}) no tiene permisos para "${actionDescription}". Se requiere rol ${requiredRole}.`;

      setDeniedModal({
        title: 'ACCESO DENEGADO',
        action: actionDescription,
        reason: reason,
      });

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
  };

  const closeDeniedModal = () => setDeniedModal(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'GUEST',
        isVisitor: !!user?.isVisitor,
        isAuthenticated: !!user && !user.isVisitor && user.role !== 'GUEST',
        isSandbox: user?.role !== 'ADMIN',
        labAccountsEnabled: LAB_ACCOUNTS_ENABLED,
        switchRole,
        login,
        logout,
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
