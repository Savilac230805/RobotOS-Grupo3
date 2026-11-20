// src/core/index.js
// Punto de exportación unificado del Core de RobotOS SmartHouse
// Módulos JavaScript puros sin dependencias de React.

export * from './clock.js';
export * from './eventEngine.js';
export * from './proceso.js';
export * from './processManager.js';
export * from './scheduler.js';
export * from './cpu.js';
export * from './memoryManager.js';
export * from './virtualFileSystem.js';
export * from './bootManager.js';
export * from './persistence/IPersistenceAdapter.js';
export * from './persistence/InMemoryPersistenceAdapter.js';
export * from './persistence/SupabasePersistenceAdapter.js';
export * from './syscalls.js';
