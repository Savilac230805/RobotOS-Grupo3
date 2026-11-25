import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

export const FileExplorerPage = () => {
  const {
    fileSystem,
    createFile,
    createDirectory,
    deleteFile,
    readFile,
    addLog,
  } = useSystem();

  const { role } = useAuth();

  const [currentPath, setCurrentPath] = useState('/home');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContentPreview, setFileContentPreview] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Estados para modales de creación
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');

  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [actionError, setActionError] = useState(null);

  // Helper para buscar un nodo dado su path
  const findNode = (tree, targetPath) => {
    if (!tree) return null;
    if (tree.path === targetPath) return tree;
    if (tree.children) {
      for (const child of tree.children) {
        const found = findNode(child, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const currentNode = findNode(fileSystem, currentPath) || fileSystem;
  const entries = currentNode?.children || [];

  const handleNavigate = (path) => {
    setCurrentPath(path);
    setSelectedFile(null);
    setActionError(null);
  };

  const handleOpenFile = (entry) => {
    setSelectedFile(entry);
    setActionError(null);
    try {
      const res = readFile(entry.path);
      setFileContentPreview(typeof res === 'string' ? res : res?.content || entry.content || '');
      setPreviewModalOpen(true);
      addLog({
        level: 'INFO',
        source: 'VFS_EXPLORER',
        message: `Archivo abierto para lectura: ${entry.path}`,
      });
    } catch (err) {
      setActionError(`Error al leer archivo: ${err.message}`);
    }
  };

  const handleDelete = (entry) => {
    setActionError(null);
    try {
      deleteFile(entry.path);
      addLog({
        level: 'INFO',
        source: 'VFS_EXPLORER',
        message: `Archivo eliminado: ${entry.path}`,
      });
      if (selectedFile?.path === entry.path) {
        setSelectedFile(null);
      }
    } catch (err) {
      setActionError(`Error al eliminar: ${err.message}`);
    }
  };

  const handleCreateFileSubmit = (e) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    setActionError(null);
    try {
      const fullPath = currentPath === '/' ? `/${newFileName.trim()}` : `${currentPath}/${newFileName.trim()}`;
      createFile(fullPath, newFileContent);
      addLog({
        level: 'INFO',
        source: 'VFS_EXPLORER',
        message: `Nuevo archivo creado vía Syscall: ${fullPath}`,
      });
      setNewFileName('');
      setNewFileContent('');
      setNewFileModalOpen(false);
    } catch (err) {
      setActionError(`No se pudo crear archivo: ${err.message}`);
    }
  };

  const handleCreateFolderSubmit = (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setActionError(null);
    try {
      const fullPath = currentPath === '/' ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`;
      createDirectory(fullPath);
      addLog({
        level: 'INFO',
        source: 'VFS_EXPLORER',
        message: `Nuevo directorio creado vía Syscall: ${fullPath}`,
      });
      setNewFolderName('');
      setNewFolderModalOpen(false);
    } catch (err) {
      setActionError(`No se pudo crear directorio: ${err.message}`);
    }
  };

  // Renderizador recursivo para el árbol lateral
  const renderTree = (node) => {
    if (!node) return null;
    const isDirectory = node.type === 'DIRECTORY' || Boolean(node.children);
    const isSelected = currentPath === node.path;

    return (
      <div key={node.path} className="text-xs">
        <div
          onClick={() => isDirectory ? handleNavigate(node.path) : handleOpenFile(node)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
            isSelected
              ? 'bg-indigo-900/60 text-indigo-300 font-semibold'
              : 'hover:bg-slate-800 text-slate-300'
          }`}
        >
          <span>{isDirectory ? '📁' : '📄'}</span>
          <span className="truncate">{node.name || (node.path === '/' ? 'root (/)' : node.path)}</span>
        </div>
        {isDirectory && node.children && (
          <div className="pl-3 border-l border-slate-800 ml-2 space-y-0.5">
            {node.children.map((child) => renderTree(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span className="text-indigo-400">🗂️</span>
            Explorador de Archivos (Virtual File System)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Navegación y manipulación de archivos en memoria con control de acceso por roles ({role})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewFileModalOpen(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <span>+</span> Nuevo Archivo
          </button>
          <button
            onClick={() => setNewFolderModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <span>📁</span> Nueva Carpeta
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Container: Split View */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[calc(100vh-14rem)] min-h-[450px]">
        {/* Left: Directory Tree */}
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-3 overflow-y-auto flex flex-col">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
            Estructura de Carpetas
          </span>
          <div className="space-y-1 flex-1">
            {renderTree(fileSystem)}
          </div>
        </div>

        {/* Right: Directory Contents Table */}
        <div className="md:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto flex flex-col">
          {/* Breadcrumb Path */}
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800 text-xs font-mono text-slate-400">
            <span className="text-slate-500">Ubicación actual:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
              {currentPath}
            </span>
            {currentPath !== '/' && (
              <button
                onClick={() => {
                  const segments = currentPath.split('/').filter(Boolean);
                  segments.pop();
                  handleNavigate(segments.length === 0 ? '/' : `/${segments.join('/')}`);
                }}
                className="text-xs text-cyan-400 hover:underline ml-2"
              >
                ↑ Subir un nivel
              </button>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Nombre</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Tamaño</th>
                  <th className="py-2.5 px-3">Permisos</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-500">
                      Este directorio está vacío.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => {
                    const isDir = entry.type === 'DIRECTORY' || Boolean(entry.children);
                    return (
                      <tr
                        key={entry.path || entry.name}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td
                          className="py-2.5 px-3 font-medium text-slate-200 cursor-pointer flex items-center gap-2"
                          onClick={() => (isDir ? handleNavigate(entry.path) : handleOpenFile(entry))}
                        >
                          <span>{isDir ? '📁' : '📄'}</span>
                          <span className="hover:underline">{entry.name}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {isDir ? 'Directorio' : 'Archivo'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {isDir ? '-' : `${entry.size || (entry.content ? entry.content.length : 0)} B`}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">
                          {entry.permissions || (entry.path?.startsWith('/system') ? 'r--r--r--' : 'rw-r--r--')}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          {!isDir && (
                            <button
                              onClick={() => handleOpenFile(entry)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[11px] border border-slate-700"
                            >
                              Ver
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(entry)}
                            className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 rounded text-[11px] border border-rose-800/50"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Preview File */}
      {previewModalOpen && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span>📄</span>
                <span className="text-sm font-bold text-slate-100">{selectedFile.name}</span>
                <span className="text-xs text-slate-500 font-mono">({selectedFile.path})</span>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-200 whitespace-pre-wrap">
              {fileContentPreview || '<Archivo vacío>'}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create File */}
      {newFileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFileSubmit}
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <h2 className="text-sm font-bold text-slate-100">Crear Nuevo Archivo</h2>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nombre del Archivo</label>
              <input
                type="text"
                placeholder="ej: notas.txt"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-indigo-500"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Contenido Inicial</label>
              <textarea
                rows={4}
                placeholder="Escriba el contenido aquí..."
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewFileModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Crear Archivo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Create Folder */}
      {newFolderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolderSubmit}
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <h2 className="text-sm font-bold text-slate-100">Crear Nueva Carpeta</h2>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nombre de la Carpeta</label>
              <input
                type="text"
                placeholder="ej: reportes"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 outline-none focus:border-indigo-500"
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewFolderModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
              >
                Crear Carpeta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
