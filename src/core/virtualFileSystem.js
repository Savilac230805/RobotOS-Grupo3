import { createEventId } from './eventEngine.js';

const DEFAULT_DIRECTORY_PERMISSIONS = 'rwxrwxrwx';
const DEFAULT_FILE_PERMISSIONS = 'rw-r--r--';

function normalizePath(path) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('La ruta debe ser un string no vacío');
  }
  const parts = path.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`Ruta no permitida: ${path}`);
  }
  return `/${parts.join('/')}`;
}

function parentPath(path) {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

function makeRecordId() {
  return createEventId();
}

export class VirtualFileSystem {
  constructor(initialFileSystem = {}, emitEvent = () => {}) {
    this.directories = new Map();
    this.emitEvent = emitEvent;
    this.directories.set('/', {
      path: '/',
      permissions: DEFAULT_DIRECTORY_PERMISSIONS,
      files: new Map(),
    });

    for (const [path, files] of Object.entries(initialFileSystem)) {
      const cleanPath = normalizePath(path);
      this.directories.set(cleanPath, {
        path: cleanPath,
        permissions: DEFAULT_DIRECTORY_PERMISSIONS,
        files: new Map((files || []).map((file) => [file.name, { ...file }])),
      });
    }
  }

  setEventEmitter(emitEvent) {
    this.emitEvent = emitEvent;
  }

  getSnapshot() {
    return Object.fromEntries(
      [...this.directories.entries()]
        .filter(([path]) => path !== '/')
        .map(([path, directory]) => [path, [...directory.files.values()].map((file) => ({ ...file }))])
    );
  }

  listDirectory(path, context = {}) {
    const cleanPath = normalizePath(path);
    const directory = this.directories.get(cleanPath);
    if (!directory) throw new Error(`Directorio no encontrado: ${cleanPath}`);
    this.assertPermission(directory.permissions, 'r', context, cleanPath);

    const children = [...this.directories.keys()]
      .filter((child) => child !== cleanPath && parentPath(child) === cleanPath)
      .sort();
    return {
      path: cleanPath,
      directories: children,
      files: [...directory.files.values()].map((file) => ({ ...file })),
      permissions: directory.permissions,
    };
  }

  createDirectory(path, { permissions = DEFAULT_DIRECTORY_PERMISSIONS, pid = null } = {}, context = {}) {
    const cleanPath = normalizePath(path);
    if (cleanPath === '/' || this.directories.has(cleanPath)) {
      throw new Error(`El directorio ya existe: ${cleanPath}`);
    }
    const parent = this.directories.get(parentPath(cleanPath));
    if (!parent) throw new Error(`Directorio padre no encontrado: ${parentPath(cleanPath)}`);
    this.assertPermission(parent.permissions, 'w', context, parent.path);

    this.directories.set(cleanPath, { path: cleanPath, permissions, files: new Map() });
    this.record('FILE_CREATED', pid, { path: cleanPath, kind: 'directory', permissions });
    return this.listDirectory(cleanPath, { role: 'ADMIN' });
  }

  createFile(path, content = '', { permissions = null, pid = null } = {}, context = {}) {
    const cleanPath = normalizePath(path);
    const directory = this.getParentDirectory(cleanPath);
    this.assertPermission(directory.permissions, 'w', context, directory.path);
    const name = cleanPath.slice(cleanPath.lastIndexOf('/') + 1);
    if (!name || directory.files.has(name)) throw new Error(`El archivo ya existe: ${cleanPath}`);

    const file = {
      id: makeRecordId(),
      name,
      content: String(content),
      size: this.formatSize(String(content).length),
      modified: new Date().toISOString(),
      permissions: permissions || (
        context?.role === 'ADMIN' ? DEFAULT_FILE_PERMISSIONS : 'rw-rw-rw-'
      ),
      ownerPid: Number.isInteger(pid) ? pid : null,
    };
    directory.files.set(name, file);
    this.record('FILE_CREATED', pid, {
      path: cleanPath,
      kind: 'file',
      size: file.size,
      permissions: file.permissions,
    });
    return { ...file };
  }

  readFile(path, context = {}, pid = null) {
    const { directory, name, cleanPath } = this.getFile(path);
    const file = directory.files.get(name);
    this.assertPermission(file.permissions, 'r', context, cleanPath);
    this.record('FILE_READ', pid, { path: cleanPath, size: file.size });
    return { success: true, file: { ...file }, content: file.content ?? '' };
  }

  writeFile(path, content, context = {}, pid = null) {
    const { directory, name, cleanPath } = this.getFile(path);
    const file = directory.files.get(name);
    this.assertPermission(file.permissions, 'w', context, cleanPath);
    const nextContent = String(content);
    const updated = {
      ...file,
      content: nextContent,
      size: this.formatSize(nextContent.length),
      modified: new Date().toISOString(),
    };
    directory.files.set(name, updated);
    this.record('FILE_WRITTEN', pid, { path: cleanPath, size: updated.size });
    return { ...updated };
  }

  renameFile(path, newName, context = {}, pid = null) {
    const cleanName = String(newName || '').trim();
    if (!cleanName || cleanName.includes('/')) throw new Error('El nuevo nombre de archivo no es válido');
    const { directory, name, cleanPath } = this.getFile(path);
    const file = directory.files.get(name);
    this.assertPermission(file.permissions, 'w', context, cleanPath);
    if (directory.files.has(cleanName)) throw new Error(`El archivo ya existe: ${cleanName}`);

    directory.files.delete(name);
    const updated = { ...file, name: cleanName, modified: new Date().toISOString() };
    directory.files.set(cleanName, updated);
    this.record('FILE_WRITTEN', pid, {
      path: cleanPath,
      newPath: `${parentPath(cleanPath)}/${cleanName}`,
      action: 'RENAME',
    });
    return { ...updated };
  }

  setPermissions(path, permissions, context = {}, pid = null) {
    if (typeof permissions !== 'string' || !/^[rwx-]{9}$/.test(permissions)) {
      throw new Error('Los permisos deben usar el formato de nueve caracteres rwx');
    }
    const { directory, name, cleanPath } = this.getFile(path);
    const file = directory.files.get(name);
    if (
      context?.role !== 'ADMIN' &&
      (cleanPath === '/system' || cleanPath.startsWith('/system/'))
    ) {
      throw new Error('Acceso denegado: solo el rol ADMIN puede modificar /system.');
    }
    if (context?.role !== 'ADMIN' && file.ownerPid !== pid) {
      throw new Error('Solo ADMIN o el proceso propietario puede cambiar los permisos');
    }
    const updated = { ...file, permissions, modified: new Date().toISOString() };
    directory.files.set(name, updated);
    this.record('FILE_WRITTEN', pid, { path: cleanPath, action: 'CHMOD', permissions });
    return { ...updated };
  }

  deleteFile(path, context = {}, pid = null) {
    const { directory, name, cleanPath } = this.getFile(path);
    const file = directory.files.get(name);
    this.assertPermission(file.permissions, 'w', context, cleanPath);
    directory.files.delete(name);
    this.record('FILE_DELETED', pid, { path: cleanPath, name });
    return { ...file };
  }

  getParentDirectory(path) {
    const directory = this.directories.get(parentPath(path));
    if (!directory) throw new Error(`Directorio no encontrado: ${parentPath(path)}`);
    return directory;
  }

  getFile(path) {
    const cleanPath = normalizePath(path);
    const directory = this.getParentDirectory(cleanPath);
    const name = cleanPath.slice(cleanPath.lastIndexOf('/') + 1);
    if (!directory.files.has(name)) throw new Error(`Archivo no encontrado: ${cleanPath}`);
    return { directory, name, cleanPath };
  }

  assertPermission(mode, operation, context, path) {
    const role = context?.role || 'GUEST';
    if (role === 'ADMIN') return;
    if (operation !== 'r' && (path === '/system' || path.startsWith('/system/'))) {
      throw new Error('Acceso denegado: solo el rol ADMIN puede modificar /system.');
    }

    const offset = role === 'USER' ? 3 : 6;
    const allowed = String(mode || '').slice(offset, offset + 3).includes(operation);
    if (!allowed) throw new Error(`Permiso ${operation} denegado para ${path}`);
  }

  formatSize(bytes) {
    return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  }

  record(type, pid, payload) {
    this.emitEvent({
      type,
      source: 'VFS',
      severity: 'INFO',
      pid: Number.isInteger(pid) ? pid : null,
      payload,
    });
  }
}
