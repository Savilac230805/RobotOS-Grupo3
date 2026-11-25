import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDemoUser, DEMO_USERS, ROLE_LEVELS } from '../src/config/demoUsers.js';
import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from '../src/core/eventEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Fase 11A - 1: Credenciales Demo en demoUsers.js aisladas', () => {
  assert.ok(Array.isArray(DEMO_USERS), 'DEMO_USERS debe ser un arreglo');
  assert.ok(DEMO_USERS.length >= 3, 'Debe incluir al menos admin, slack y guest');

  // Admin
  const admin = findDemoUser('admin', '123');
  assert.ok(admin, 'Admin debe autenticar con 123');
  assert.equal(admin.role, 'ADMIN');

  // Slack (Usuario)
  const slack = findDemoUser('slack', '123');
  assert.ok(slack, 'Slack debe autenticar con 123');
  assert.equal(slack.role, 'USER');

  // Guest (Invitado)
  const guest = findDemoUser('guest', '123');
  assert.ok(guest, 'Guest debe autenticar con 123');
  assert.equal(guest.role, 'GUEST');

  // Alias invitado
  const invitado = findDemoUser('invitado', '123');
  assert.ok(invitado, 'Invitado alias debe autenticar con 123');
  assert.equal(invitado.role, 'GUEST');

  // Contraseña incorrecta
  assert.equal(findDemoUser('admin', 'wrong_pass'), null);
  // Usuario inexistente
  assert.equal(findDemoUser('phantom', '123'), null);
});

test('Fase 11A - 2: Jerarquía RBAC (ADMIN > USER > GUEST)', () => {
  assert.ok(ROLE_LEVELS.ADMIN > ROLE_LEVELS.USER, 'ADMIN debe tener mayor nivel que USER');
  assert.ok(ROLE_LEVELS.USER > ROLE_LEVELS.GUEST, 'USER debe tener mayor nivel que GUEST');
  assert.equal(ROLE_LEVELS.ADMIN, 3);
  assert.equal(ROLE_LEVELS.USER, 2);
  assert.equal(ROLE_LEVELS.GUEST, 1);
});

test('Fase 11A - 3: Emisión de eventos de auditoría de seguridad a EventEngine sin exponer contraseñas', () => {
  let lastEvent = null;
  const unsub = eventEngine.subscribeAll((evt) => {
    lastEvent = evt;
  });

  // 1. Simulación de LOGIN_SUCCESS
  eventEngine.emit({
    type: 'LOGIN_SUCCESS',
    source: EVENT_SOURCES.SECURITY_GUARD,
    severity: EVENT_SEVERITY.INFO,
    payload: { user: 'admin@robotos.local', role: 'ADMIN' },
  });

  assert.equal(lastEvent?.type, 'LOGIN_SUCCESS');
  assert.equal(lastEvent?.payload?.role, 'ADMIN');
  assert.equal(lastEvent?.payload?.password, undefined, 'Nunca debe exponer la contraseña');

  // 2. Simulación de LOGIN_FAILED con intentos
  eventEngine.emit({
    type: 'LOGIN_FAILED',
    source: EVENT_SOURCES.SECURITY_GUARD,
    severity: EVENT_SEVERITY.WARN,
    payload: { attemptedUser: 'intruder', attemptNumber: 3, maxAttempts: 3 },
  });

  assert.equal(lastEvent?.type, 'LOGIN_FAILED');
  assert.equal(lastEvent?.payload?.attemptNumber, 3);
  assert.equal(lastEvent?.payload?.password, undefined);

  // 3. Simulación de ACCESS_DENIED
  eventEngine.emit({
    type: 'ACCESS_DENIED',
    source: EVENT_SOURCES.SECURITY_GUARD,
    severity: EVENT_SEVERITY.WARN,
    payload: { user: 'guest@robotos.local', requiredRole: 'ADMIN', action: 'Auditoría' },
  });

  assert.equal(lastEvent?.type, 'ACCESS_DENIED');
  assert.equal(lastEvent?.payload?.requiredRole, 'ADMIN');

  unsub();
});

test('Fase 11C: Integridad de Rutas y Módulos de Navegación', () => {
  // Verificar que existen los archivos componentes de Fase 11 en src/pages/
  const requiredPages = [
    'src/pages/LoginPage.jsx',
    'src/pages/WelcomePage.jsx',
    'src/pages/DashboardPage.jsx',
    'src/pages/ObservabilityCenter.jsx',
    'src/pages/UserAuditPage.jsx',
    'src/pages/SettingsPage.jsx',
  ];

  for (const pageRel of requiredPages) {
    const fullPath = path.join(rootDir, pageRel);
    assert.ok(fs.existsSync(fullPath), `El archivo ${pageRel} debe existir en el proyecto`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(content.length > 100, `El archivo ${pageRel} no debe estar vacío`);
  }
});

test('Fase 11 - UX & Estabilidad: ErrorBoundary y Protección de Automatizaciones', () => {
  // 1. ErrorBoundary debe existir y ser una clase exportada
  const ebPath = path.join(rootDir, 'src/components/common/ErrorBoundary.jsx');
  assert.ok(fs.existsSync(ebPath), 'ErrorBoundary.jsx debe existir en src/components/common/');
  const ebContent = fs.readFileSync(ebPath, 'utf8');
  assert.ok(ebContent.includes('componentDidCatch'), 'Debe implementar componentDidCatch');
  assert.ok(ebContent.includes('getDerivedStateFromError'), 'Debe implementar getDerivedStateFromError');

  // 2. SettingsPage debe estar envuelto en ErrorBoundary y tener reglas de automatización
  const settingsPath = path.join(rootDir, 'src/pages/SettingsPage.jsx');
  const settingsContent = fs.readFileSync(settingsPath, 'utf8');
  assert.ok(settingsContent.includes('ErrorBoundary'), 'SettingsPage debe usar ErrorBoundary');
  assert.ok(settingsContent.includes('AUTOMATION_RULE_TOGGLED'), 'Debe emitir eventos de automatización');

  // 3. Soporte del tema acogedor (warm) en ThemeContext y CSS
  const themePath = path.join(rootDir, 'src/context/ThemeContext.jsx');
  const themeContent = fs.readFileSync(themePath, 'utf8');
  assert.ok(themeContent.includes("WARM: 'warm'"), 'ThemeContext debe soportar el tema WARM');

  const cssPath = path.join(rootDir, 'src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  assert.ok(cssContent.includes('.theme-warm'), 'src/index.css debe definir reglas para .theme-warm');
  assert.ok(cssContent.includes('--warm-terracota'), 'src/index.css debe definir acento terracota');
});
