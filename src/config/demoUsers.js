/**
 * CREDENCIALES DE DEMOSTRACIÓN - SOLO DEMO
 * 
 * Este archivo contiene credenciales locales para pruebas y evaluación de RobotOS.
 * NO debe usarse en entornos de producción.
 * La seguridad definitiva de los datos compartidos está protegida por Supabase RLS.
 */

export const ROLE_LEVELS = Object.freeze({
  ADMIN: 3,
  USER: 2,
  GUEST: 1,
});

export const DEMO_USERS = [
  {
    username: 'admin',
    password: '123',
    role: 'ADMIN',
    name: 'Administrador del Sistema',
    email: 'admin@robotos.local',
    description: 'Acceso total: configuración, procesos, auditoría avanzada, benchmarking y fallos.'
  },
  {
    username: 'slack',
    password: '123',
    role: 'USER',
    name: 'Operador / Residente',
    email: 'slack@robotos.local',
    description: 'Acceso operativo: dispositivos, procesos, diagnósticos básicos. Sin auditoría de administración.'
  },
  {
    username: 'guest',
    password: '123',
    role: 'GUEST',
    name: 'Invitado Temporal',
    email: 'guest@robotos.local',
    description: 'Solo visualización: telemetría y planos. Sin permisos de modificación ni ejecución.'
  },
  {
    username: 'invitado',
    password: '123',
    role: 'GUEST',
    name: 'Invitado Temporal',
    email: 'invitado@robotos.local',
    description: 'Alias de invitado para compatibilidad.'
  }
];

export const findDemoUser = (username, password) => {
  const cleanUser = String(username || '').trim().toLowerCase();
  const user = DEMO_USERS.find(
    (u) => u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser
  );
  if (!user) return null;
  if (user.password === String(password)) {
    return user;
  }
  return null;
};
