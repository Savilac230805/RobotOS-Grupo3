import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { memoryManager } from '../core';

export const MemoryPage = () => {
  const {
    memoryBlocks,
    fileSystem,
    freeMemoryBlock,
    memoryHistory,
    createFile,
    writeFile,
    setFilePermissions,
    createDirectory,
    deleteFile,
    readFile,
    addLog,
  } = useSystem();
  const { role, checkPermission } = useAuth();

  const [selectedFolder, setSelectedFolder] = useState('/system');
  const [newDirectoryName, setNewDirectoryName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [filePermissions, setFilePermissionsState] = useState(role === 'ADMIN' ? 'rw-r--r--' : 'rw-rw-rw-');
  const [activeFileId, setActiveFileId] = useState(null);
  const [vfsFeedback, setVfsFeedback] = useState('');

  const rootFolders = Object.keys(fileSystem);
  const activeFile = fileSystem[selectedFolder]?.find((file) => file.id === activeFileId);

  const memStats = memoryManager.getStats();

  const handleCreateDirectory = () => {
    const path = `${selectedFolder}/${newDirectoryName.trim()}`;
    const result = createDirectory(path);
    setVfsFeedback(result?.success === false ? result.reason : `Directorio ${path} creado.`);
    if (result?.success !== false) setNewDirectoryName('');
  };

  const handleCreateFile = () => {
    const result = createFile(selectedFolder, {
      name: newFileName.trim(),
      content: fileContent,
      permissions: filePermissions,
    });
    setVfsFeedback(result?.success === false ? result.reason : `Archivo ${newFileName.trim()} creado.`);
    if (result?.success) {
      setActiveFileId(result.file.id);
      setNewFileName('');
    }
  };

  const handleReadFile = (file) => {
    try {
      const result = readFile(`${selectedFolder}/${file.name}`);
      setActiveFileId(file.id);
      setFileContent(result.content);
      setVfsFeedback(`Leído ${selectedFolder}/${file.name}`);
    } catch (error) {
      setVfsFeedback(error.message);
    }
  };

  const handleWriteFile = () => {
    if (!activeFile) return;
    const result = writeFile(`${selectedFolder}/${activeFile.name}`, fileContent);
    setVfsFeedback(result?.success === false ? result.reason : `Archivo ${activeFile.name} actualizado.`);
  };

  const handlePermissionsChange = (permissions) => {
    if (!activeFile) return;
    const result = setFilePermissions(`${selectedFolder}/${activeFile.name}`, permissions);
    setVfsFeedback(result?.success === false ? result.reason : `Permisos actualizados: ${permissions}`);
  };

  const handleDeleteFile = (file) => {
    const result = deleteFile(selectedFolder, file.id);
    setVfsFeedback(result?.success === false ? result.reason : `Archivo ${file.name} eliminado.`);
    if (file.id === activeFileId) {
      setActiveFileId(null);
      setFileContent('');
    }
  };

  const handleFreeBlockClick = (block) => {
    if (block.state === 'FREE') return;
    if (block.state === 'KERNEL') {
      checkPermission('ADMIN', 'Liberar bloque protegido del Kernel', addLog);
      return;
    }

    // Cualquier usuario en modo sandbox local puede liberar sus bloques de usuario;
    // syscalls valida que no sea bloque de kernel
    freeMemoryBlock(block.id);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Memoria & Sistema de Archivos (VFS)</h2>
          <p className="text-xs text-slate-400">
            Supervisión física de los 64 bloques de memoria RAM (1024 MB), fragmentación externa y VFS de RobotOS.
          </p>
        </div>
        <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
          Rol activo: <span className="font-bold">{role}</span>
        </div>
      </div>

      {/* Métricas de Memoria con Fragmentación Externa */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-500">Capacidad Total</div>
          <div className="text-xl font-black text-white mt-0.5">1024 MB</div>
          <div className="text-xs font-mono text-slate-400">64 bloques (16 MB c/u)</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-indigo-900/40">
          <div className="text-[10px] font-mono uppercase text-indigo-400">Kernel Protegido</div>
          <div className="text-xl font-black text-indigo-300 mt-0.5">{memStats.kernelMB} MB</div>
          <div className="text-xs font-mono text-indigo-400/80">{memStats.kernelBlocks} bloques (0-7)</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-cyan-900/40">
          <div className="text-[10px] font-mono uppercase text-cyan-400">Memoria Asignada</div>
          <div className="text-xl font-black text-cyan-300 mt-0.5">{memStats.usedMB} MB</div>
          <div className="text-xs font-mono text-cyan-400/80">{memStats.usedBlocks} bloques a procesos</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-900/40">
          <div className="text-[10px] font-mono uppercase text-emerald-400">Memoria Libre</div>
          <div className="text-xl font-black text-emerald-400 mt-0.5">{memStats.freeMB} MB</div>
          <div className="text-xs font-mono text-emerald-400/80">{memStats.freeBlocks} bloques disponibles</div>
        </div>

        {/* MÉTRICA DE FRAGMENTACIÓN EXTERNA */}
        <div className="p-4 rounded-xl bg-slate-900 border border-purple-900/40">
          <div className="text-[10px] font-mono uppercase text-purple-400">Fragmentación Externa</div>
          <div className="text-xl font-black text-purple-300 mt-0.5">{memStats.fragmentationPercent}%</div>
          <div className="text-xs font-mono text-purple-400/80">
            Mayor contiguo: {memStats.maxContiguousFreeMB} MB ({memStats.freeSegmentsCount} huecos)
          </div>
        </div>
      </div>

      {/* 1. MALLA INTERACTIVA DE BLOQUES DE MEMORIA (64 BLOQUES) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Mapa Físico de Bloques de Memoria</h3>
            <p className="text-xs text-slate-400">
              Representación de la asignación física en tiempo real. Pulsa en un bloque de usuario para liberarlo vía syscall.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="flex items-center space-x-1.5 text-indigo-400">
              <span className="w-2.5 h-2.5 rounded bg-indigo-500"></span>
              <span>Kernel (0-7)</span>
            </span>
            <span className="flex items-center space-x-1.5 text-cyan-400">
              <span className="w-2.5 h-2.5 rounded bg-cyan-500"></span>
              <span>Procesos</span>
            </span>
            <span className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 rounded bg-slate-800 border border-slate-700"></span>
              <span>Libre</span>
            </span>
          </div>
        </div>

        {/* Grícula de 64 bloques */}
        <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-16 gap-2">
          {memoryBlocks.map((block) => {
            const isKernel = block.state === 'KERNEL' || block.id < 8;
            const isAllocated = block.state === 'ALLOCATED';

            return (
              <div
                key={block.id}
                onClick={() => handleFreeBlockClick(block)}
                className={`p-2 rounded-lg border text-center transition-all cursor-pointer relative group ${
                  isKernel
                    ? 'bg-indigo-950/80 border-indigo-700/80 text-indigo-300 cursor-not-allowed'
                    : isAllocated
                    ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-600 hover:border-slate-700'
                }`}
                title={`Bloque #${block.id}: ${block.state} ${
                  block.processName ? `(${block.processName})` : ''
                } ${isKernel ? '[PROTEGIDO KERNEL]' : ''}`}
              >
                <div className="text-[10px] font-mono font-bold">#{block.id}</div>
                <div className="text-[8px] font-mono truncate mt-0.5">
                  {isKernel ? 'KERNEL' : isAllocated ? block.processName : 'LIBRE'}
                </div>
              </div>

            );
          })}
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
        <h3 className="text-sm font-bold text-white mb-3">Historial de memoria</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="py-2 pr-3">Operación</th>
                <th className="py-2 pr-3">PID / proceso</th>
                <th className="py-2 pr-3">Bloques</th>
                <th className="py-2">Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {[...memoryHistory].reverse().slice(-10).reverse().map((entry, index) => (
                <tr key={`${entry.timestamp}_${index}`} className="text-slate-400">
                  <td className="py-2 pr-3 text-cyan-300">{entry.type}</td>
                  <td className="py-2 pr-3">{entry.pid ?? entry.processName ?? '—'}</td>
                  <td className="py-2 pr-3">{entry.blockIds.join(', ')}</td>
                  <td className="py-2">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
              {memoryHistory.length === 0 && (
                <tr><td className="py-3 text-slate-600" colSpan={4}>Sin asignaciones registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. EXPLORADOR DEL SISTEMA DE ARCHIVOS (VFS) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Explorador del Sistema de Archivos VFS</h3>
          <p className="text-xs text-slate-400">Las 6 carpetas raíz canónicas de RobotOS montadas en etapa VFS_MOUNT</p>
        </div>

        {/* Tabs de Carpetas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {rootFolders.map((folder) => {
            const isSelected = selectedFolder === folder;
            return (
              <button
                key={folder}
                type="button"
                onClick={() => setSelectedFolder(folder)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 font-bold shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-mono text-xs">
                  <span>📁</span>
                  <span>{folder}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  {fileSystem[folder]?.length || 0} archivos
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex gap-2">
            <input
              value={newDirectoryName}
              onChange={(event) => setNewDirectoryName(event.target.value)}
              placeholder="Nuevo directorio"
              className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <button
              type="button"
              onClick={handleCreateDirectory}
              disabled={!newDirectoryName.trim()}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-cyan-300 disabled:opacity-40"
            >
              Crear carpeta
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={newFileName}
              onChange={(event) => setNewFileName(event.target.value)}
              placeholder="Nuevo archivo"
              className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <button
              type="button"
              onClick={handleCreateFile}
              disabled={!newFileName.trim()}
              className="px-3 py-2 rounded-lg bg-cyan-700 border border-cyan-600 text-xs text-white disabled:opacity-40"
            >
              Crear archivo
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="vfs-permissions" className="text-[10px] uppercase font-mono text-slate-500">
            Permisos de nuevos archivos
          </label>
          <select
            id="vfs-permissions"
            value={filePermissions}
            onChange={(event) => setFilePermissionsState(event.target.value)}
            className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-cyan-300"
          >
            <option value="rw-r--r--">Privado lectura</option>
            <option value="rw-rw-r--">Grupo escritura</option>
            <option value="rw-rw-rw-">Lectura y escritura pública</option>
            <option value="r--r--r--">Solo lectura</option>
          </select>
        </div>
        {activeFile && (
          <div className="space-y-2">
            <div className="text-xs font-mono text-cyan-300">Editando: {selectedFolder}/{activeFile.name}</div>
            <textarea
              value={fileContent}
              onChange={(event) => setFileContent(event.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
            />
            <button
              type="button"
              onClick={handleWriteFile}
              className="px-3 py-2 rounded-lg bg-emerald-800 border border-emerald-700 text-xs text-white"
            >
              Guardar cambios
            </button>
            <select
              value={activeFile.permissions}
              onChange={(event) => handlePermissionsChange(event.target.value)}
              className="ml-2 px-2 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-cyan-300"
              aria-label="Cambiar permisos del archivo"
            >
              <option value="rw-r--r--">rw-r--r--</option>
              <option value="rw-rw-r--">rw-rw-r--</option>
              <option value="rw-rw-rw-">rw-rw-rw-</option>
              <option value="r--r--r--">r--r--r--</option>
            </select>
          </div>
        )}
        {vfsFeedback && <div className="text-xs font-mono text-slate-400">{vfsFeedback}</div>}

        {/* Lista de Archivos */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Nombre</th>
                <th className="py-2.5 px-3">Tamaño</th>
                <th className="py-2.5 px-3">Permisos</th>
                <th className="py-2.5 px-3">Modificado</th>
                <th className="py-2.5 px-3">Operaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {fileSystem[selectedFolder]?.map((file) => (
                <tr key={file.id} className="hover:bg-slate-950/40 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-slate-200 flex items-center space-x-2">
                    <span>📄</span>
                    <span>{file.name}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">{file.size}</td>
                  <td className="py-2.5 px-3 text-cyan-400/80">{file.permissions}</td>
                  <td className="py-2.5 px-3 text-slate-500">{file.modified}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => handleReadFile(file)} className="text-cyan-300 hover:text-white">Leer</button>
                      <button type="button" onClick={() => handleDeleteFile(file)} className="text-red-400 hover:text-red-300">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
