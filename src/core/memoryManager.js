// src/core/memoryManager.js
// Administrador de bloques de memoria física de RobotOS SmartHouse
// Capacidad total: 1024 MB divididos en 64 bloques de 16 MB cada uno.
// Bloques 0 a 7: Reservados para el Kernel (128 MB, protegidos e inmutables).
// Bloques 8 a 63: Espacio disponible para procesos de usuario y aplicaciones.

export const TOTAL_MEMORY_MB = 1024;
export const BLOCK_SIZE_MB = 16;
export const TOTAL_BLOCKS = 64;
export const KERNEL_BLOCKS_COUNT = 8; // Bloques 0 a 7
export const DEFAULT_PAGE_SIZE_MB = 16;
export const PAGE_SIZE_OPTIONS_MB = Object.freeze([1, 2, 4, 8, 16]);
export const PAGE_REPLACEMENT_ALGORITHMS = Object.freeze({
  FIFO: 'FIFO',
  LRU: 'LRU',
});
const DEFAULT_ADDRESS_SPACE_MB = TOTAL_MEMORY_MB * 2;

export class MemoryManager {
  constructor(initialBlocks = null) {
    this.history = [];
    if (initialBlocks && Array.isArray(initialBlocks) && initialBlocks.length === TOTAL_BLOCKS) {
      this.blocks = initialBlocks.map((block) => ({
        ...block,
        legacyOwnerPid: block.legacyOwnerPid ?? (
          block.state === 'ALLOCATED' ? block.ownerPid ?? null : null
        ),
        legacyProcessName: block.legacyProcessName ?? (
          block.state === 'ALLOCATED' ? block.processName ?? null : null
        ),
      }));
    } else {
      this.blocks = Array.from({ length: TOTAL_BLOCKS }, (_, index) => {
        if (index < KERNEL_BLOCKS_COUNT) {
          return {
            id: index,
            state: 'KERNEL',
            processName: 'Kernel_Core',
            legacyOwnerPid: null,
            color: '#6366F1',
          };
        }
        return {
          id: index,
          state: 'FREE',
          processName: null,
          legacyOwnerPid: null,
          color: '#1E293B',
        };
      });
    }

    this.pageSizeMB = DEFAULT_PAGE_SIZE_MB;
    this.addressSpaces = new Map();
    this.processMetadata = new Map();
    this.replacementAlgorithm = PAGE_REPLACEMENT_ALGORITHMS.FIFO;
    this.referenceClock = 0;
    this.eventPublisher = null;
    this.virtualStats = { totalAccesses: 0, pageFaults: 0 };
    this.virtualFrames = this.createPhysicalFrames();
    this.refreshBlockSummaries();
  }

  setEventPublisher(publisher) {
    if (publisher !== null && typeof publisher !== 'function') {
      throw new Error('El publicador de eventos debe ser una función o null');
    }
    this.eventPublisher = publisher;
  }

  createPhysicalFrames() {
    const pageSizeBytes = this.pageSizeMB * 1024 * 1024;
    const totalFrames = TOTAL_MEMORY_MB / this.pageSizeMB;
    const kernelFrames = (KERNEL_BLOCKS_COUNT * BLOCK_SIZE_MB) / this.pageSizeMB;

    return Array.from({ length: totalFrames }, (_, id) => {
      const baseAddressMB = id * this.pageSizeMB;
      return {
        id,
        blockId: Math.floor(baseAddressMB / BLOCK_SIZE_MB),
        offsetMB: baseAddressMB % BLOCK_SIZE_MB,
        reserved: id < kernelFrames,
        mapping: null,
        loadedAt: null,
        lastUsed: null,
        pageSizeBytes,
      };
    });
  }

  configurePageSize(pageSizeMB) {
    const size = Number(pageSizeMB);
    if (!PAGE_SIZE_OPTIONS_MB.includes(size)) {
      throw new Error(`Tamaño de página inválido. Use: ${PAGE_SIZE_OPTIONS_MB.join(', ')} MB.`);
    }
    if (this.virtualFrames.some((frame) => frame.mapping)) {
      throw new Error('Libere las páginas residentes antes de cambiar el tamaño de página.');
    }

    this.pageSizeMB = size;
    this.virtualFrames = this.createPhysicalFrames();
    for (const space of this.addressSpaces.values()) {
      space.pages = this.createPageTable(space.pid, space.sizeMB);
    }
    return this.getVirtualMemorySnapshot();
  }

  setReplacementAlgorithm(algorithm) {
    if (!Object.values(PAGE_REPLACEMENT_ALGORITHMS).includes(algorithm)) {
      throw new Error(`Algoritmo de reemplazo inválido: ${algorithm}`);
    }
    this.replacementAlgorithm = algorithm;
    return this.replacementAlgorithm;
  }

  createPageTable(pid, sizeMB) {
    const pageSizeBytes = this.pageSizeMB * 1024 * 1024;
    const pageCount = Math.ceil((sizeMB * 1024 * 1024) / pageSizeBytes);
    return Array.from({ length: pageCount }, (_, pageNumber) => ({
      pid,
      pageNumber,
      frame: null,
      present: false,
      modified: false,
      referenced: false,
      loadedAt: null,
      lastUsed: null,
    }));
  }

  createAddressSpace(pid, { sizeMB = DEFAULT_ADDRESS_SPACE_MB } = {}) {
    const processPid = Number(pid);
    const virtualSizeMB = Number(sizeMB);
    if (!Number.isInteger(processPid) || processPid <= 0) {
      throw new Error('El PID debe ser un entero positivo para crear el espacio virtual.');
    }
    if (!Number.isFinite(virtualSizeMB) || virtualSizeMB <= 0) {
      throw new Error('El tamaño del espacio virtual debe ser mayor que cero.');
    }

    const existing = this.addressSpaces.get(processPid);
    if (existing) {
      if (existing.sizeMB !== virtualSizeMB) {
        throw new Error(`El PID ${processPid} ya tiene un espacio virtual de ${existing.sizeMB} MB.`);
      }
      return this.getPageTable(processPid);
    }

    const space = {
      pid: processPid,
      sizeMB: virtualSizeMB,
      pages: this.createPageTable(processPid, virtualSizeMB),
    };
    this.addressSpaces.set(processPid, space);
    return this.getPageTable(processPid);
  }

  getPageTable(pid) {
    const space = this.addressSpaces.get(Number(pid));
    if (!space) throw new Error(`No existe un espacio virtual para el PID ${pid}.`);
    return space.pages.map((page) => ({ ...page }));
  }

  getAllPageTables() {
    return [...this.addressSpaces.keys()].map((pid) => ({
      pid,
      sizeMB: this.addressSpaces.get(pid).sizeMB,
      pages: this.getPageTable(pid),
    }));
  }

  getPhysicalFrames() {
    return this.virtualFrames.map((frame) => {
      const block = this.blocks[frame.blockId];
      const ownerPid = frame.mapping?.pid ?? block.legacyOwnerPid ?? null;
      const processName = frame.mapping
        ? this.processMetadata.get(frame.mapping.pid)?.name ?? block.processName
        : block.legacyProcessName !== null
        ? block.legacyProcessName
        : null;
      return {
        id: frame.id,
        blockId: frame.blockId,
        offsetMB: frame.offsetMB,
        reserved: frame.reserved,
        state: frame.reserved
          ? 'KERNEL'
          : frame.mapping
          ? 'MAPPED'
          : block.legacyProcessName !== null
          ? 'RESERVED'
          : 'FREE',
        pid: ownerPid,
        processName,
        pageNumber: frame.mapping?.pageNumber ?? null,
      };
    });
  }

  getVirtualMemoryStats() {
    const userFrames = this.virtualFrames.filter((frame) => !frame.reserved);
    const freeFrames = userFrames.filter((frame) => {
      const block = this.blocks[frame.blockId];
      return !frame.mapping && block.legacyProcessName === null;
    }).length;
    const residentFrames = userFrames.filter((frame) => frame.mapping).length;
    const totalAccesses = this.virtualStats.totalAccesses;
    const pageFaults = this.virtualStats.pageFaults;

    return {
      pageSizeMB: this.pageSizeMB,
      totalFrames: this.virtualFrames.length,
      reservedFrames: this.virtualFrames.length - userFrames.length,
      userFrames: userFrames.length,
      occupiedFrames: userFrames.length - freeFrames,
      residentFrames,
      freeFrames,
      totalAccesses,
      pageFaults,
      faultRate: totalAccesses === 0 ? 0 : (pageFaults / totalAccesses) * 100,
      physicalMemoryAvailableMB: freeFrames * this.pageSizeMB,
      replacementAlgorithm: this.replacementAlgorithm,
    };
  }

  getVirtualMemorySnapshot(pid = null) {
    return {
      stats: this.getVirtualMemoryStats(),
      frames: this.getPhysicalFrames(),
      pageTables: pid === null
        ? this.getAllPageTables()
        : [{
            pid: Number(pid),
            sizeMB: this.addressSpaces.get(Number(pid))?.sizeMB ?? 0,
            pages: this.getPageTable(pid),
          }],
    };
  }

  publishVirtualEvent(type, pid, payload, severity = 'INFO') {
    const event = {
      type,
      source: 'MEM_MANAGER',
      severity,
      pid,
      payload,
    };
    return this.eventPublisher ? this.eventPublisher(event) : event;
  }

  getAvailableFrames(pid) {
    return this.virtualFrames.filter((frame) => {
      if (frame.reserved || frame.mapping) return false;
      const block = this.blocks[frame.blockId];
      return block.legacyProcessName === null || block.legacyOwnerPid === pid;
    });
  }

  getReplaceableFrames(pid) {
    return this.virtualFrames.filter((frame) => {
      if (frame.reserved || !frame.mapping) return false;
      const block = this.blocks[frame.blockId];
      return block.legacyProcessName === null || block.legacyOwnerPid === pid;
    });
  }

  accessVirtualAddress(pid, address, { write = false, algorithm = this.replacementAlgorithm } = {}) {
    const processPid = Number(pid);
    const virtualAddress = Number(address);
    const space = this.addressSpaces.get(processPid);
    if (!space) throw new Error(`No existe un espacio virtual para el PID ${pid}.`);
    if (!Number.isSafeInteger(virtualAddress) || virtualAddress < 0) {
      throw new Error('La dirección virtual debe ser un entero no negativo expresado en bytes.');
    }
    if (!Object.values(PAGE_REPLACEMENT_ALGORITHMS).includes(algorithm)) {
      throw new Error(`Algoritmo de reemplazo inválido: ${algorithm}`);
    }

    const pageSizeBytes = this.pageSizeMB * 1024 * 1024;
    const pageNumber = Math.floor(virtualAddress / pageSizeBytes);
    const offset = virtualAddress % pageSizeBytes;
    const page = space.pages[pageNumber];
    if (!page) throw new Error(`La dirección virtual excede el espacio de ${space.sizeMB} MB del PID ${processPid}.`);

    this.virtualStats.totalAccesses += 1;
    this.referenceClock += 1;
    let frame = page.present
      ? this.virtualFrames[page.frame]
      : null;
    let pageFault = false;
    let victim = null;

    if (!frame) {
      pageFault = true;
      this.virtualStats.pageFaults += 1;
      const available = this.getAvailableFrames(processPid);
      if (available.length > 0) {
        frame = available[0];
      } else {
        const candidates = this.getReplaceableFrames(processPid);
        candidates.sort((left, right) => {
          const leftTime = algorithm === PAGE_REPLACEMENT_ALGORITHMS.FIFO
            ? left.loadedAt
            : left.lastUsed;
          const rightTime = algorithm === PAGE_REPLACEMENT_ALGORITHMS.FIFO
            ? right.loadedAt
            : right.lastUsed;
          return leftTime - rightTime || left.id - right.id;
        });
        frame = candidates[0] ?? null;
      }

      if (!frame) {
        this.publishVirtualEvent('PAGE_FAULT', processPid, {
          pageNumber,
          frame: null,
          algorithm,
          victim: null,
          status: 'OUT_OF_MEMORY',
        }, 'ERROR');
        this.refreshBlockSummaries();
        throw new Error(`No hay marcos físicos disponibles para el PID ${processPid} (page ${pageNumber}).`);
      }

      if (frame.mapping) {
        victim = { ...frame.mapping, frame: frame.id };
        const victimSpace = this.addressSpaces.get(victim.pid);
        const victimPage = victimSpace?.pages[victim.pageNumber];
        if (victimPage) {
          victimPage.frame = null;
          victimPage.present = false;
          victimPage.modified = false;
          victimPage.referenced = false;
          victimPage.loadedAt = null;
          victimPage.lastUsed = null;
        }
      }

      frame.mapping = { pid: processPid, pageNumber };
      frame.loadedAt = this.referenceClock;
      page.frame = frame.id;
      page.present = true;
      page.loadedAt = this.referenceClock;
    }

    frame.lastUsed = this.referenceClock;
    page.lastUsed = this.referenceClock;
    page.referenced = true;
    if (write) page.modified = true;
    this.refreshBlockSummaries();

    if (pageFault) {
      this.publishVirtualEvent('PAGE_FAULT', processPid, {
        pageNumber,
        frame: frame.id,
        algorithm,
        victim,
        status: victim ? 'REPLACED' : 'LOADED',
      });
    }

    return {
      pid: processPid,
      virtualAddress,
      pageNumber,
      offset,
      frame: frame.id,
      physicalAddress: frame.id * pageSizeBytes + offset,
      pageFault,
      algorithm,
      victim,
    };
  }

  releaseAddressSpace(pid, { emitEvents = true } = {}) {
    const processPid = Number(pid);
    const space = this.addressSpaces.get(processPid);
    if (!space) return 0;
    let releasedPages = 0;

    for (const page of space.pages) {
      if (!page.present) continue;
      const frame = this.virtualFrames[page.frame];
      if (frame?.mapping?.pid === processPid) {
        frame.mapping = null;
        frame.loadedAt = null;
        frame.lastUsed = null;
        releasedPages += 1;
        if (emitEvents) {
          this.publishVirtualEvent('PAGE_RELEASED', processPid, {
            pageNumber: page.pageNumber,
            frame: frame.id,
          });
        }
      }
    }

    this.addressSpaces.delete(processPid);
    this.refreshBlockSummaries();
    return releasedPages;
  }

  simulateReferenceString(references, frameCount, algorithm) {
    if (!Array.isArray(references) || references.some((page) => !Number.isInteger(page) || page < 0)) {
      throw new Error('La secuencia debe ser una lista de números de página enteros no negativos.');
    }
    const capacity = Number(frameCount);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('La cantidad de marcos debe ser un entero positivo.');
    }
    if (!Object.values(PAGE_REPLACEMENT_ALGORITHMS).includes(algorithm)) {
      throw new Error(`Algoritmo de reemplazo inválido: ${algorithm}`);
    }

    const frames = [];
    const timeline = [];
    let clock = 0;
    let pageFaults = 0;

    references.forEach((pageNumber) => {
      clock += 1;
      const hit = frames.find((frame) => frame.pageNumber === pageNumber);
      if (hit) {
        hit.lastUsed = clock;
        timeline.push({
          step: timeline.length + 1,
          pageNumber,
          hit: true,
          pageFault: false,
          frame: hit.id,
          victim: null,
        });
        return;
      }

      pageFaults += 1;
      let frame = frames.find((candidate) => candidate.pageNumber === null);
      if (!frame && frames.length < capacity) {
        frame = { id: frames.length, pageNumber: null, loadedAt: null, lastUsed: null };
        frames.push(frame);
      }
      let victim = null;
      if (!frame) {
        frame = [...frames].sort((left, right) => {
          const leftTime = algorithm === PAGE_REPLACEMENT_ALGORITHMS.FIFO
            ? left.loadedAt
            : left.lastUsed;
          const rightTime = algorithm === PAGE_REPLACEMENT_ALGORITHMS.FIFO
            ? right.loadedAt
            : right.lastUsed;
          return leftTime - rightTime || left.id - right.id;
        })[0];
        victim = frame.pageNumber;
      }

      frame.pageNumber = pageNumber;
      frame.loadedAt = clock;
      frame.lastUsed = clock;
      timeline.push({
        step: timeline.length + 1,
        pageNumber,
        hit: false,
        pageFault: true,
        frame: frame.id,
        victim,
      });
    });

    return {
      algorithm,
      frameCount: capacity,
      totalAccesses: references.length,
      pageFaults,
      faultRate: references.length === 0 ? 0 : (pageFaults / references.length) * 100,
      timeline,
      frames: frames.map((frame) => ({ ...frame })),
    };
  }

  compareReferenceString(references, frameCount) {
    return {
      FIFO: this.simulateReferenceString(references, frameCount, PAGE_REPLACEMENT_ALGORITHMS.FIFO),
      LRU: this.simulateReferenceString(references, frameCount, PAGE_REPLACEMENT_ALGORITHMS.LRU),
    };
  }

  refreshBlockSummaries() {
    this.blocks = this.blocks.map((block) => {
      if (block.id < KERNEL_BLOCKS_COUNT) {
        return {
          ...block,
          state: 'KERNEL',
          processName: 'Kernel_Core',
          ownerPid: null,
          legacyOwnerPid: null,
        };
      }

      if (block.legacyProcessName !== null && block.legacyProcessName !== undefined) {
        return {
          ...block,
          state: 'ALLOCATED',
          ownerPid: block.legacyOwnerPid ?? null,
          processName: block.legacyProcessName,
        };
      }

      const owners = new Set(
        this.virtualFrames
          .filter((frame) => frame.blockId === block.id && frame.mapping)
          .map((frame) => frame.mapping.pid)
      );
      if (owners.size === 0) {
        return {
          ...block,
          state: 'FREE',
          processName: null,
          ownerPid: null,
          legacyOwnerPid: null,
          legacyProcessName: null,
          color: '#1E293B',
        };
      }

      const ownerPid = owners.size === 1 ? [...owners][0] : null;
      return {
        ...block,
        state: 'ALLOCATED',
        processName: ownerPid === null
          ? 'Virtual Memory'
          : this.processMetadata.get(ownerPid)?.name ?? 'Virtual Memory',
        ownerPid,
        legacyOwnerPid: null,
        legacyProcessName: null,
        color: ownerPid === null
          ? '#06B6D4'
          : this.processMetadata.get(ownerPid)?.color ?? '#06B6D4',
      };
    });
  }

  getBlocks() {
    return this.blocks;
  }

  getFreeBlocksCount() {
    return this.blocks.filter((b) => b.state === 'FREE').length;
  }

  getUsedBlocksCount() {
    return this.blocks.filter((b) => b.state === 'ALLOCATED').length;
  }

  getKernelBlocksCount() {
    return KERNEL_BLOCKS_COUNT;
  }

  /**
   * Valida si existe memoria suficiente para la cantidad de bloques solicitados.
   */
  canAllocate(requestedBlocks) {
    const count = Number(requestedBlocks);
    if (!Number.isInteger(count) || count <= 0) return false;
    return count <= this.getFreeBlocksCount();
  }

  /**
   * Asigna bloques contiguos o dispersos a un proceso.
   */
  allocate(processName, blocksCount, color = '#06B6D4', ownerPid = null) {
    const requested = Number(blocksCount);
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new Error(`Cantidad de bloques inválida para asignación: ${blocksCount}`);
    }

    if (!this.canAllocate(requested)) {
      throw new Error(
        `Memoria insuficiente: se solicitaron ${requested} bloques (${requested * BLOCK_SIZE_MB} MB), pero solo hay ${this.getFreeBlocksCount()} bloques disponibles.`
      );
    }

    const cleanName = String(processName).trim();
    if (Number.isInteger(ownerPid)) {
      this.processMetadata.set(ownerPid, { name: cleanName, color });
    }
    let allocatedSoFar = 0;
    const allocatedIndices = [];

    this.blocks = this.blocks.map((b) => {
      if (b.state === 'FREE' && allocatedSoFar < requested) {
        allocatedSoFar += 1;
        allocatedIndices.push(b.id);
        return {
          ...b,
          state: 'ALLOCATED',
          processName: cleanName,
          ownerPid,
          legacyOwnerPid: ownerPid,
          legacyProcessName: cleanName,
          color,
        };
      }
      return b;
    });

    const result = {
      success: true,
      allocatedBlocks: requested,
      allocatedMB: requested * BLOCK_SIZE_MB,
      blockIds: allocatedIndices,
      freeBlocksRemaining: this.getFreeBlocksCount(),
    };
    this.history.push({
      type: 'MEMORY_ALLOCATED',
      pid: Number.isInteger(ownerPid) ? ownerPid : null,
      processName: cleanName,
      blockIds: [...allocatedIndices],
      allocatedBlocks: requested,
      allocatedMB: requested * BLOCK_SIZE_MB,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  /**
   * Libera todos los bloques asociados a un proceso específico.
   */
  freeProcessMemory(processIdentifier) {
    if (processIdentifier === null || processIdentifier === undefined || processIdentifier === '') return 0;
    const byPid = Number.isInteger(processIdentifier);
    const cleanName = byPid ? null : String(processIdentifier).trim();
    const processPids = byPid
      ? [processIdentifier]
      : [...this.processMetadata]
        .filter(([, metadata]) => metadata.name === cleanName)
        .map(([pid]) => pid);
    const before = new Map(this.blocks.map((block) => [block.id, block.state]));
    processPids.forEach((pid) => this.releaseAddressSpace(pid));

    this.blocks = this.blocks.map((block) => {
      const ownerMatches = byPid
        ? block.legacyOwnerPid === processIdentifier
        : block.legacyProcessName === cleanName;
      return ownerMatches
        ? { ...block, legacyOwnerPid: null, legacyProcessName: null }
        : block;
    });
    processPids.forEach((pid) => this.processMetadata.delete(pid));
    this.refreshBlockSummaries();

    const freedBlockIds = this.blocks
      .filter((block) => before.get(block.id) === 'ALLOCATED' && block.state === 'FREE')
      .map((block) => block.id);
    const freedCount = freedBlockIds.length;

    if (freedCount > 0) {
      this.history.push({
        type: 'MEMORY_RELEASED',
        pid: byPid ? processIdentifier : null,
        processName: cleanName,
        blockIds: freedBlockIds,
        freedBlocks: freedCount,
        freedMB: freedCount * BLOCK_SIZE_MB,
        timestamp: new Date().toISOString(),
      });
    }
    return freedCount;
  }

  /**
   * Libera un bloque específico individualmente.
   * Si es bloque de Kernel (0-7), arroja error de protección.
   */
  freeBlock(blockId) {
    const id = Number(blockId);
    if (!Number.isInteger(id) || id < 0 || id >= TOTAL_BLOCKS) {
      throw new Error(`ID de bloque inválido: ${blockId}`);
    }

    const target = this.blocks.find((b) => b.id === id);
    if (!target) {
      throw new Error(`Bloque de memoria #${id} no encontrado.`);
    }

    if (target.state === 'KERNEL' || id < KERNEL_BLOCKS_COUNT) {
      throw new Error(`Operación denegada: El bloque #${id} pertenece al espacio protegido del Kernel.`);
    }

    if (target.state === 'FREE') {
      return { success: true, message: `El bloque #${id} ya se encuentra libre.` };
    }

    if (this.virtualFrames.some((frame) => frame.blockId === id && frame.mapping)) {
      throw new Error(`El bloque #${id} contiene páginas virtuales residentes y no puede liberarse manualmente.`);
    }

    this.blocks = this.blocks.map((block) =>
      block.id === id
        ? {
            ...block,
            state: 'FREE',
            processName: null,
            ownerPid: null,
            legacyOwnerPid: null,
            legacyProcessName: null,
            color: '#1E293B',
          }
        : block
    );
    this.refreshBlockSummaries();

    this.history.push({
      type: 'MEMORY_RELEASED',
      pid: target.ownerPid ?? null,
      processName: target.processName,
      blockIds: [id],
      freedBlocks: 1,
      freedMB: BLOCK_SIZE_MB,
      timestamp: new Date().toISOString(),
    });
    return { success: true, freedBlockId: id, freeBlocksCount: this.getFreeBlocksCount() };
  }

  getHistory() {
    return this.history.map((entry) => ({ ...entry, blockIds: [...entry.blockIds] }));
  }

  /**
   * Calcula la fragmentación externa de la memoria:
   * Porcentaje de memoria libre que se encuentra dividida en segmentos no contiguos.
   * Fórmula: 1 - (segmento_libre_más_grande / total_bloques_libres)
   */
  getFragmentation() {
    const freeCount = this.getFreeBlocksCount();
    if (freeCount === 0) {
      return { fragmentationPercent: 0, maxContiguousFreeBlocks: 0, freeSegmentsCount: 0 };
    }

    let currentContiguous = 0;
    let maxContiguous = 0;
    let segmentsCount = 0;
    let inSegment = false;

    // Solo evaluar espacio no-kernel (bloques 8 a 63)
    for (let i = KERNEL_BLOCKS_COUNT; i < TOTAL_BLOCKS; i++) {
      if (this.blocks[i].state === 'FREE') {
        currentContiguous += 1;
        if (!inSegment) {
          segmentsCount += 1;
          inSegment = true;
        }
        if (currentContiguous > maxContiguous) {
          maxContiguous = currentContiguous;
        }
      } else {
        currentContiguous = 0;
        inSegment = false;
      }
    }

    const fragmentationPercent =
      freeCount > 0 ? Math.round((1 - maxContiguous / freeCount) * 100) : 0;

    return {
      fragmentationPercent: Math.max(0, fragmentationPercent),
      maxContiguousFreeBlocks: maxContiguous,
      maxContiguousFreeMB: maxContiguous * BLOCK_SIZE_MB,
      freeSegmentsCount: segmentsCount,
    };
  }

  getStats() {
    const freeCount = this.getFreeBlocksCount();
    const usedCount = this.getUsedBlocksCount();
    const frag = this.getFragmentation();

    return {
      totalMB: TOTAL_MEMORY_MB,
      blockSizeMB: BLOCK_SIZE_MB,
      totalBlocks: TOTAL_BLOCKS,
      kernelBlocks: KERNEL_BLOCKS_COUNT,
      kernelMB: KERNEL_BLOCKS_COUNT * BLOCK_SIZE_MB,
      usedBlocks: usedCount,
      usedMB: usedCount * BLOCK_SIZE_MB,
      freeBlocks: freeCount,
      freeMB: freeCount * BLOCK_SIZE_MB,
      ...frag,
    };
  }
}

export const memoryManager = new MemoryManager();
