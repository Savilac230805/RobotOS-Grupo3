// src/core/syscalls.js
// Capa de System Calls (Syscalls) formales de RobotOS SmartHouse
// Separa las solicitudes de usuario/aplicación del espacio de Kernel.
//
// REGLAS DE ROLES:
// - Los syscalls de procesos y memoria operan para visitantes sobre su estado local de sandbox.
// - Solo la escritura al almacenamiento compartido/persistido exige rol ADMIN.
// - Se mantienen las restricciones críticas: /system, procesos del sistema (isSystem)
//   y bloques de Kernel (0 a 7, protegidos en MemoryManager).
// - La seguridad real de la escritura compartida la impone PostgreSQL RLS en Supabase,
//   no las comprobaciones del cliente.

import { eventEngine, EVENT_SOURCES, EVENT_SEVERITY } from './eventEngine.js';
import { inMemoryAdapter } from './persistence/InMemoryPersistenceAdapter.js';
import { memoryManager } from './memoryManager.js';
import { Proceso, ESTADOS } from './proceso.js';
import { processManager } from './processManager.js';

export class SystemCalls {
  constructor(events = eventEngine, persistence = inMemoryAdapter, memory = memoryManager, manager = null) {
    this.events = events;
    this.persistence = persistence;
    this.memory = memory;
    this.processManager = manager;
    this.vfs = null;
    this.memory.setEventPublisher?.((event) => this.emitEvent(event));
  }

  attachVirtualFileSystem(vfs) {
    this.vfs = vfs;
    vfs?.setEventEmitter((event) => this.emitEvent(event));
    return vfs;
  }

  createDirectory(path, options = {}, context = {}) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.createDirectory(path, options, context);
  }

  createVirtualFile(path, content = '', options = {}, context = {}) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.createFile(path, content, options, context);
  }

  readVirtualFile(path, context = {}, pid = null) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.readFile(path, context, pid);
  }

  writeVirtualFile(path, content, context = {}, pid = null) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.writeFile(path, content, context, pid);
  }

  renameVirtualFile(path, newName, context = {}, pid = null) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.renameFile(path, newName, context, pid);
  }

  setVirtualFilePermissions(path, permissions, context = {}, pid = null) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.setPermissions(path, permissions, context, pid);
  }

  deleteVirtualFile(path, context = {}, pid = null) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.deleteFile(path, context, pid);
  }

  listVirtualDirectory(path, context = {}) {
    if (!this.vfs) throw new Error('El Virtual File System no está conectado al Kernel');
    return this.vfs.listDirectory(path, context);
  }

  // ==========================================
  // SYSCALLS DE EVENTOS
  // ==========================================
  emitEvent({
    type,
    source = EVENT_SOURCES.KERNEL,
    severity = EVENT_SEVERITY.INFO,
    pid = null,
    payload = {},
    correlationId = null,
  }) {
    if (!type || typeof type !== 'string') {
      throw new Error('[Syscall emitEvent] El parámetro "type" es obligatorio y debe ser un string.');
    }
    const event = this.events.emit({ type, source, severity, pid, payload, correlationId });
    this.persist('saveEvent', event);
    return event;
  }

  persist(method, ...args) {
    try {
      const operation = this.persistence[method](...args);
      return Promise.resolve(operation).then((result) => {
        if (result === false || result?.success === false) {
          throw new Error(`${method} rechazado por el adaptador de persistencia`);
        }
        return result;
      }).catch((error) => {
        this.lastPersistenceError = error;
        console.error(`[SystemCalls] ${method} falló:`, error);
        return false;
      });
    } catch (error) {
      this.lastPersistenceError = error;
      console.error(`[SystemCalls] ${method} falló:`, error);
      return Promise.resolve(false);
    }
  }

  // ==========================================
  // SYSCALLS DE GESTIÓN DE PROCESOS
  // ==========================================

  /**
   * Syscall: sys_create_process
   * Cualquier usuario (incluidos visitantes) puede crear procesos en su sandbox local.
   * - Valida memoria disponible y reserva bloques a través de MemoryManager.
   * - Si la creación del PCB falla, los bloques reservados se devuelven (sin fugas).
   * - Si se recibe existingProcesses, rechaza nombres duplicados de procesos vivos
   *   (la memoria se asigna por nombre, así que dos procesos con el mismo nombre
   *   compartirían bloques al terminar).
   */
  createProcess(
    {
      name,
      priority = 'Media',
      memoryBlocksCount = 2,
      cpu = 10,
      tiempoTotal = 4,
      color = null,
      deviceIds = [],
      tickLlegada = null,
      existingProcesses = [],
      virtualSizeMB = undefined,
    },
    context = {}
  ) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('[Syscall sys_create_process] El nombre del proceso no puede estar vacío.');
    }

    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '_');
    const requestedBlocks = Number(memoryBlocksCount);
    if (!Number.isInteger(requestedBlocks) || requestedBlocks <= 0) {
      throw new Error('[Syscall sys_create_process] Cantidad de bloques de memoria inválida.');
    }

    const duplicado = existingProcesses.some(
      (p) => p.nombre === cleanName && p.estado !== ESTADOS.TERMINATED
    );
    if (duplicado) {
      throw new Error(
        `[Syscall sys_create_process] Ya existe un proceso activo llamado "${cleanName}". Use otro nombre o finalice el existente.`
      );
    }

    // 2. Mapear prioridad textual a entera (1 = más urgente)
    const priorityNum =
      priority === 'Crítica' || priority === 1
        ? 1
        : priority === 'Alta' || priority === 2
        ? 2
        : priority === 'Media' || priority === 3
        ? 3
        : 4;

    let newProc;
    let memResult;
    try {
      // 3. Crear PCB formal
      newProc = new Proceso({
        nombre: cleanName,
        prioridad: priorityNum,
        memoriaRequerida: requestedBlocks * 16,
        cpuRequerida: Number(cpu) || 10,
        tiempoTotal: Number(tiempoTotal) || 4,
        color: color || '#06B6D4',
        isSystem: false,
        description: `Proceso creado vía sys_create_process (${context?.role || 'ANÓNIMO'})`,
        deviceIds,
        tickLlegada,
      });
      if (!newProc.id) newProc.id = `p_${newProc.pid}`;
      memResult = this.memory.allocate(cleanName, requestedBlocks, color || '#06B6D4', newProc.pid);
      this.memory.createAddressSpace(newProc.pid, {
        sizeMB: virtualSizeMB ?? Math.max(2048, requestedBlocks * 32),
      });
      this.processManager?.register(newProc);

      // 4. Emitir evento auditable
      this.emitEvent({
        type: 'PROCESS_CREATED',
        source: EVENT_SOURCES.PROCESS_MGR,
        severity: EVENT_SEVERITY.INFO,
        pid: newProc.pid,
        payload: {
          ...newProc.toJSON(),
          allocatedBlocks: memResult.allocatedBlocks,
          allocatedMB: memResult.allocatedMB,
          creatorRole: context?.role || 'GUEST',
          isSandbox: this.persistence.isSandboxMode(),
        },
      });
      this.emitEvent({
        type: 'MEMORY_ALLOCATED',
        source: EVENT_SOURCES.MEM_MANAGER,
        severity: EVENT_SEVERITY.INFO,
        pid: newProc.pid,
        payload: {
          processName: cleanName,
          blockIds: memResult.blockIds,
          allocatedBlocks: memResult.allocatedBlocks,
          allocatedMB: memResult.allocatedMB,
        },
      });
    } catch (err) {
      // Rollback: devolver los bloques reservados si algo falló después de reservar
      for (const blockId of memResult?.blockIds || []) {
        try {
          this.memory.freeBlock(blockId);
        } catch (_) {
          // un bloque no liberable no debe ocultar el error original
        }
      }
      if (newProc) this.memory.releaseAddressSpace?.(newProc.pid, { emitEvents: false });
      if (newProc) this.processManager?.remove(newProc.pid);
      throw err;
    }

    // 5. Persistir (el adaptador dirige a sandbox o a almacenamiento compartido según el modo activo)
    this.persist('saveProcess', newProc);
    return { success: true, process: newProc, memory: memResult };
  }

  /**
   * Syscall: sys_terminate_process
   * Finaliza procesos de usuario. Procesos del sistema (isSystem) solo los finaliza ADMIN.
   * Terminar un proceso ya finalizado devuelve un error claro.
   */
  terminateProcess(processId, context = {}, processesList = []) {
    const role = context?.role || 'GUEST';
    const target =
      this.processManager?.getAll().find((process) => process.id === processId || process.pid === processId) ||
      processesList.find((process) => process.id === processId || process.pid === processId);

    if (!target) {
      throw new Error(`[Syscall sys_terminate_process] Proceso con identificador ${processId} no encontrado.`);
    }

    // Proteger procesos críticos del Kernel
    if (target.isSystem && role !== 'ADMIN') {
      this.emitEvent({
        type: 'SECURITY_VIOLATION',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.CRITICAL,
        pid: target.pid,
        payload: {
          syscall: 'sys_terminate_process',
          reason: 'Intento no autorizado de finalizar un proceso crítico del sistema.',
          targetProcess: target.nombre,
          user: context?.user?.email || 'Anónimo',
        },
      });
      throw new Error('Acceso denegado: no se puede finalizar un proceso crítico del sistema sin rol ADMIN.');
    }

    if (target.estado === ESTADOS.TERMINATED) {
      throw new Error(
        `[Syscall sys_terminate_process] El proceso PID ${target.pid} (${target.nombre}) ya está finalizado.`
      );
    }

    // Cambiar estado formal a TERMINATED
    const previousState = target.estado;
    target.finalizar();

    // Liberar memoria en el MemoryManager
    const freedBlocks = this.releaseProcessMemory(target.pid);

    this.emitEvent({
      type: 'PROCESS_STATE_CHANGED',
      source: EVENT_SOURCES.PROCESS_MGR,
      severity: EVENT_SEVERITY.INFO,
      pid: target.pid,
      payload: { from: previousState, to: ESTADOS.TERMINATED, reason: 'PROCESS_TERMINATED' },
    });

    this.emitEvent({
      type: 'PROCESS_TERMINATED',
      source: EVENT_SOURCES.PROCESS_MGR,
      severity: EVENT_SEVERITY.WARN,
      pid: target.pid,
      payload: { pid: target.pid, nombre: target.nombre, freedBlocks, role },
    });

    this.persist('saveProcess', target);
    return { success: true, process: target, freedBlocks };
  }

  releaseProcessMemory(pid) {
    const process = this.memory.getBlocks().find((block) => block.ownerPid === Number(pid));
    const processName = process?.processName || null;
    const freedBlocks = this.memory.freeProcessMemory(Number(pid));
    if (freedBlocks > 0) {
      this.emitEvent({
        type: 'MEMORY_RELEASED',
        source: EVENT_SOURCES.MEM_MANAGER,
        severity: EVENT_SEVERITY.INFO,
        pid: Number(pid),
        payload: { processName, freedBlocks, freedMB: freedBlocks * 16 },
      });
    }
    return freedBlocks;
  }

  accessVirtualAddress(pid, address, options = {}) {
    if (this.processManager && !this.processManager.get(pid)) {
      throw new Error(`Proceso PID ${pid} no encontrado.`);
    }
    return this.memory.accessVirtualAddress(pid, address, options);
  }

  // ==========================================
  // SYSCALLS DE GESTIÓN DE MEMORIA
  // ==========================================

  /**
   * Syscall: sys_allocate_memory
   */
  allocateMemory(processName, blocksCount, context = {}, color = '#06B6D4') {
    const pid = Number.isInteger(context?.pid) ? context.pid : null;
    const res = this.memory.allocate(processName, blocksCount, color, pid);
    this.emitEvent({
      type: 'MEMORY_ALLOCATED',
      source: EVENT_SOURCES.MEM_MANAGER,
      severity: EVENT_SEVERITY.INFO,
      pid,
      payload: { processName, ...res, role: context?.role || 'GUEST' },
    });
    return res;
  }

  /**
   * Syscall: sys_free_memory
   * Libera un bloque específico.
   * - Los bloques de Kernel (0 a 7) nunca se liberan (lo impone MemoryManager).
   * - Si se recibe processesList, un bloque de un proceso vivo NO puede liberarse a mano
   *   (dejaría al proceso activo sin memoria y el mapa inconsistente).
   */
  freeMemory(blockId, context = {}, processesList = []) {
    const block = this.memory.getBlocks().find((b) => b.id === Number(blockId));
    if (block && block.state === 'ALLOCATED') {
      const owner = processesList.find(
        (p) => p.nombre === block.processName && p.estado !== ESTADOS.TERMINATED
      );
      if (owner) {
        throw new Error(
          `Operación denegada: el bloque #${blockId} pertenece al proceso activo PID ${owner.pid} (${owner.nombre}). Finalice el proceso para liberar su memoria.`
        );
      }
    }

    const res = this.memory.freeBlock(blockId);
    this.emitEvent({
      type: 'MEMORY_RELEASED',
      source: EVENT_SOURCES.MEM_MANAGER,
      severity: EVENT_SEVERITY.INFO,
      pid: block?.ownerPid ?? null,
      payload: { blockId, ...res, role: context?.role || 'GUEST' },
    });
    return res;
  }

  // ==========================================
  // SYSCALLS DE ARCHIVOS (VFS)
  // ==========================================
  readFile(path, fileSystem, context = {}, pid = null) {
    if (this.vfs) return this.vfs.readFile(path, context, pid);
    if (!path || typeof path !== 'string') {
      throw new Error('[Syscall readFile] Parámetro de ruta inválido.');
    }

    const normalized = path.trim();
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`[Syscall readFile] Ruta inválida: ${path}. Formato requerido: /carpeta/archivo`);
    }

    const folder = `/${parts[0]}`;
    const filename = parts.slice(1).join('/');

    const folderFiles = fileSystem[folder];
    if (!folderFiles) {
      this.emitEvent({
        type: 'VFS_READ_ERROR',
        source: EVENT_SOURCES.VFS,
        severity: EVENT_SEVERITY.WARN,
        payload: { path, reason: 'Directorio no encontrado' },
      });
      throw new Error(`Directorio no encontrado: ${folder}`);
    }

    const file = folderFiles.find((f) => f.name === filename);
    if (!file) {
      this.emitEvent({
        type: 'VFS_READ_ERROR',
        source: EVENT_SOURCES.VFS,
        severity: EVENT_SEVERITY.WARN,
        payload: { path, reason: 'Archivo no encontrado' },
      });
      throw new Error(`Archivo no encontrado: ${path}`);
    }

    this.emitEvent({
      type: 'VFS_FILE_READ',
      source: EVENT_SOURCES.VFS,
      severity: EVENT_SEVERITY.INFO,
      payload: { path, size: file.size },
    });

    return {
      success: true,
      file,
      content: file.content || `[Contenido simulado de ${file.name}]`,
    };
  }

  /**
   * Syscall: sys_write_file
   * RESTRICCIÓN DE SEGURIDAD: Modificar archivos en /system exige rol ADMIN.
   */
  writeFile(path, content, fileSystem, options = { permissions: 'rw-r--r--' }, context = {}) {
    if (this.vfs) {
      if (!path || typeof path !== 'string') throw new Error('[Syscall writeFile] Parámetro de ruta inválido.');
      const cleanPath = path.trim();
      const separator = cleanPath.lastIndexOf('/');
      const folder = separator <= 0 ? '/' : cleanPath.slice(0, separator);
      const name = cleanPath.slice(separator + 1);
      const existing = this.vfs.getSnapshot()[folder]?.some((file) => file.name === name);
      return existing
        ? this.vfs.writeFile(cleanPath, content, context)
        : this.vfs.createFile(cleanPath, content, options, context);
    }
    if (!path || typeof path !== 'string') {
      throw new Error('[Syscall writeFile] Parámetro de ruta inválido.');
    }

    const normalized = path.trim();
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`[Syscall writeFile] Ruta inválida: ${path}. Formato requerido: /carpeta/archivo`);
    }

    const folder = `/${parts[0]}`;
    const filename = parts.slice(1).join('/');

    // Proteger archivos en /system para que solo ADMIN pueda modificarlos
    if (folder === '/system' && context?.role !== 'ADMIN') {
      this.emitEvent({
        type: 'SECURITY_VIOLATION',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.CRITICAL,
        payload: { syscall: 'writeFile', path, reason: 'Escritura denegada en /system sin rol ADMIN.' },
      });
      throw new Error('Acceso denegado: solo el rol ADMIN puede modificar archivos en /system.');
    }

    if (!fileSystem[folder]) {
      throw new Error(`Directorio no encontrado: ${folder}`);
    }

    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const existingIdx = fileSystem[folder].findIndex((f) => f.name === filename);

    let fileRecord;
    const sizeKB = Math.max(1, Math.round((content ? content.length : 10) / 1024));
    const sizeStr = `${sizeKB} KB`;

    if (existingIdx >= 0) {
      fileRecord = {
        ...fileSystem[folder][existingIdx],
        size: sizeStr,
        content: String(content),
        modified: now,
      };
      fileSystem[folder][existingIdx] = fileRecord;
    } else {
      fileRecord = {
        id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name: filename,
        size: sizeStr,
        content: String(content),
        modified: now,
        permissions: options.permissions || 'rw-r--r--',
      };
      fileSystem[folder].push(fileRecord);
    }

    this.emitEvent({
      type: existingIdx >= 0 ? 'VFS_FILE_MODIFIED' : 'VFS_FILE_CREATED',
      source: EVENT_SOURCES.VFS,
      severity: EVENT_SEVERITY.INFO,
      payload: { path, size: sizeStr },
    });

    return { success: true, file: fileRecord };
  }

  /**
   * Syscall: sys_rename_file
   * Renombra un archivo existente sin duplicarlo. /system exige ADMIN.
   */
  renameFile(folder, fileId, newName, fileSystem, context = {}) {
    if (this.vfs) {
      const file = this.vfs.getSnapshot()[folder]?.find((entry) => entry.id === fileId);
      if (!file) throw new Error(`Archivo no encontrado (id ${fileId}) en ${folder}.`);
      return this.vfs.renameFile(`${folder}/${file.name}`, newName, context);
    }
    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
      throw new Error('[Syscall renameFile] El nuevo nombre no puede estar vacío.');
    }
    const cleanName = newName.trim();

    if (!fileSystem[folder]) {
      throw new Error(`Directorio no encontrado: ${folder}`);
    }

    if ((folder === '/system' || folder === 'system') && context?.role !== 'ADMIN') {
      this.emitEvent({
        type: 'SECURITY_VIOLATION',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.CRITICAL,
        payload: { syscall: 'renameFile', folder, reason: 'Modificación denegada en /system sin rol ADMIN.' },
      });
      throw new Error('Acceso denegado: solo el rol ADMIN puede modificar archivos en /system.');
    }

    const idx = fileSystem[folder].findIndex((f) => f.id === fileId);
    if (idx < 0) {
      throw new Error(`Archivo no encontrado (id ${fileId}) en ${folder}.`);
    }
    if (fileSystem[folder].some((f, i) => i !== idx && f.name === cleanName)) {
      throw new Error(`Ya existe un archivo llamado "${cleanName}" en ${folder}.`);
    }

    const previousName = fileSystem[folder][idx].name;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const updated = { ...fileSystem[folder][idx], name: cleanName, modified: now };
    fileSystem[folder][idx] = updated;

    this.emitEvent({
      type: 'VFS_FILE_RENAMED',
      source: EVENT_SOURCES.VFS,
      severity: EVENT_SEVERITY.INFO,
      payload: { folder, previousName, newName: cleanName },
    });

    return { success: true, file: updated };
  }

  /**
   * Syscall: sys_delete_file
   * Elimina un archivo. /system exige ADMIN.
   */
  deleteFile(folder, fileId, fileSystem, context = {}) {
    if (this.vfs) {
      const file = this.vfs.getSnapshot()[folder]?.find((entry) => entry.id === fileId);
      if (!file) throw new Error(`Archivo no encontrado (id ${fileId}) en ${folder}.`);
      return this.vfs.deleteFile(`${folder}/${file.name}`, context);
    }
    if (!fileSystem[folder]) {
      throw new Error(`Directorio no encontrado: ${folder}`);
    }

    if ((folder === '/system' || folder === 'system') && context?.role !== 'ADMIN') {
      this.emitEvent({
        type: 'SECURITY_VIOLATION',
        source: EVENT_SOURCES.SECURITY_GUARD,
        severity: EVENT_SEVERITY.CRITICAL,
        payload: { syscall: 'deleteFile', folder, reason: 'Eliminación denegada en /system sin rol ADMIN.' },
      });
      throw new Error('Acceso denegado: solo el rol ADMIN puede eliminar archivos en /system.');
    }

    const file = fileSystem[folder].find((f) => f.id === fileId);
    if (!file) {
      throw new Error(`Archivo no encontrado (id ${fileId}) en ${folder}.`);
    }

    fileSystem[folder] = fileSystem[folder].filter((f) => f.id !== fileId);

    this.emitEvent({
      type: 'VFS_FILE_DELETED',
      source: EVENT_SOURCES.VFS,
      severity: EVENT_SEVERITY.WARN,
      payload: { path: `${folder}/${file.name}` },
    });

    return { success: true, file };
  }

  // ==========================================
  // SYSCALLS DE DISPOSITIVOS
  // ==========================================
  deviceRead(deviceId, devicesList) {
    const dev = devicesList.find((d) => d.id === deviceId);
    if (!dev) throw new Error(`Dispositivo no encontrado: ${deviceId}`);

    this.emitEvent({
      type: 'DEVICE_READ',
      source: EVENT_SOURCES.IOT_MANAGER,
      severity: EVENT_SEVERITY.INFO,
      payload: { deviceId, status: dev.status, zone: dev.zone },
    });

    return dev;
  }

  deviceWrite(deviceId, nextStatus, devicesList, context = {}) {
    const dev = devicesList.find((d) => d.id === deviceId);
    if (!dev) throw new Error(`Dispositivo no encontrado: ${deviceId}`);

    const previous = dev.status;
    dev.status = nextStatus;

    this.emitEvent({
      type: 'DEVICE_STATE_CHANGED',
      source: EVENT_SOURCES.IOT_MANAGER,
      severity: EVENT_SEVERITY.INFO,
      payload: {
        deviceId,
        name: dev.name,
        previous,
        current: nextStatus,
        zone: dev.zone,
        role: context?.role || 'GUEST',
      },
    });

    this.persist('saveDeviceState', deviceId, nextStatus, { name: dev.name, zone: dev.zone });
    return dev;
  }
}

export const syscalls = new SystemCalls(eventEngine, inMemoryAdapter, memoryManager, processManager);