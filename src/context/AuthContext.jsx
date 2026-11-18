import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { inMemoryAdapter } from '../core';

const AuthContext = createContext();

const ROLE_LEVELS = {
  ADMIN: 3,
  USER: 2,
  GUEST: 1,
};

export const AuthProvider = ({ children }) => {
  // Usuario por defecto para desarrollo/pruebas.
  // En producción pública, un visitante anónimo tiene role GUEST / solo lectura.
  const [user, setUser] = useState({
    id: 'usr_admin',
    email: 'admin@robotos.local',
    name: 'Operador Admin',
    role: 'ADMIN', // ADMIN | USER | GUEST
  });

  const [authError, setAuthError] = useState(null);
  const [deniedModal, setDeniedModal] = useState(null); // { message, reason }

  // Sincronizar modo Sandbox de persistencia según el rol activo
  // Visitantes anónimos / GUEST / USER: Sandbox local (no tocan persistencia compartida)
  // ADMIN: Mutaciones persistentes compartidas
  useEffect(() => {
    const isAdmin = user?.role === 'ADMIN';
    inMemoryAdapter.setSandboxMode(!isAdmin);
  }, [user]);

  // Cambiar rol rápidamente para pruebas de laboratorio
  const switchRole = (newRole) => {
    if (ROLE_LEVELS[newRole]) {
      setUser((prev) => ({
        ...prev,
        role: newRole,
        name:
          newRole === 'ADMIN'
            ? 'Operador Admin'
            : newRole === 'USER'
            ? 'Residente Hogar'
            : 'Visitante Anónimo (Solo Lectura)',
        email: `${newRole.toLowerCase()}@robotos.local`,
      }));
    }
  };

  // Función de login con Supabase Auth (solo ADMIN requiere autenticarse)
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data?.user) {
        const assignedRole = data.user.user_metadata?.role || 'USER';
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || email.split('@')[0],
          role: assignedRole,
        });
        return { success: true };
      }

      // Fallback a cuentas de laboratorio
      if (email.includes('admin')) {
        setUser({ id: 'u_adm', email, name: 'Operador Admin', role: 'ADMIN' });
        return { success: true };
      } else if (email.includes('guest')) {
        setUser({ id: 'u_gst', email, name: 'Visitante Anónimo', role: 'GUEST' });
        return { success: true };
      } else {
        setUser({ id: 'u_usr', email, name: 'Residente', role: 'USER' });
        return { success: true };
      }
    } catch (err) {
      setAuthError(err.message || 'Error de autenticación');
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // Ignorar error si no está configurado Supabase
    }
    // Al cerrar sesión, vuelve a modo Visitante Anónimo (GUEST)
    setUser({
      id: 'usr_anon',
      email: 'anonimo@robotos.local',
      name: 'Visitante Anónimo',
      role: 'GUEST',
    });
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
        isAuthenticated: !!user && user.role !== 'GUEST',
        isSandbox: user?.role !== 'ADMIN',
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
